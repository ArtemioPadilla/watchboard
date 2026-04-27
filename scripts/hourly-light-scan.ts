/**
 * hourly-light-scan.ts
 *
 * Fast 15-min scan: polls a curated subset of high-signal feeds + Bluesky +
 * Telegram, scores each candidate against active trackers via deterministic
 * keyword matching, posts to Telegram on HIGH score (>= 0.85), defers
 * MODERATE (0.5..0.85) to pending-candidates.json for the next heavy scan,
 * and discards LOW (< 0.5) to the audit log.
 *
 * No LLM call — by design, this path is keyword-only.
 */
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { XMLParser } from 'fast-xml-parser';
import {
  type Candidate,
  type PendingCandidates,
  type TriageLogEntry,
  PATHS,
  loadState,
  saveState,
  normalizeCandidate,
} from './hourly-types.js';
import { buildKeywordIndex, scoreCandidate } from '../src/lib/keyword-match.js';
import { pollRealtimeSources } from '../src/lib/realtime-sources.js';
import { appendTriageEntries, pruneTriageLog } from '../src/lib/triage-log.js';
import { loadAllTrackers } from '../src/lib/tracker-registry.js';

const HIGH_THRESHOLD     = 0.85;
const MODERATE_THRESHOLD = 0.50;

/** Curated high-signal RSS feeds for the light scan only. The heavy scan
 *  uses the wider list. */
const LIGHT_RSS_FEEDS = [
  { url: 'https://feeds.reuters.com/reuters/worldNews',                tier: 2 as const, source: 'reuters' },
  { url: 'https://feeds.bbci.co.uk/news/world/rss.xml',                tier: 2 as const, source: 'bbc' },
  { url: 'https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en',      tier: 2 as const, source: 'google-news-en' },
  { url: 'https://news.google.com/rss?hl=es-419&gl=MX&ceid=MX:es-419', tier: 2 as const, source: 'google-news-mx' },
];

async function pollLightFeeds(): Promise<Candidate[]> {
  const out: Candidate[] = [];
  const parser = new XMLParser({ ignoreAttributes: false });
  for (const f of LIGHT_RSS_FEEDS) {
    try {
      const res = await fetch(f.url, { headers: { 'User-Agent': 'WatchboardLightScan/1.0' } });
      if (!res.ok) continue;
      const xml = await res.text();
      const doc = parser.parse(xml);
      const items: any[] = doc?.rss?.channel?.item ?? doc?.feed?.entry ?? [];
      for (const item of items.slice(0, 25)) {
        const title = item.title?.['#text'] ?? item.title ?? '';
        const link  = item.link?.['#text'] ?? item.link ?? item.guid ?? '';
        if (!title || !link || typeof link !== 'string') continue;
        out.push(normalizeCandidate(
          { title: String(title), url: link, source: f.source, timestamp: new Date().toISOString() },
          null,
          'rss',
          { sourceTier: f.tier },
        ));
      }
    } catch (err) {
      console.warn(`[light-scan] rss fetch failed for ${f.url}:`, (err as Error).message);
    }
  }
  return out;
}

function dedup(cands: Candidate[], seenUrls: Set<string>): Candidate[] {
  const fresh: Candidate[] = [];
  for (const c of cands) {
    if (seenUrls.has(c.url)) continue;
    seenUrls.add(c.url);
    fresh.push(c);
  }
  return fresh;
}

function loadPending(path: string): PendingCandidates {
  if (!existsSync(path)) return { version: 1, entries: [] };
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as PendingCandidates;
    if (raw.version !== 1 || !Array.isArray(raw.entries)) return { version: 1, entries: [] };
    return raw;
  } catch { return { version: 1, entries: [] }; }
}

function savePending(p: PendingCandidates, path: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(p, null, 2), 'utf8');
}

async function postTelegram(candidate: Candidate, score: number, trackerSlug: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.warn('[light-scan] TELEGRAM_BOT_TOKEN/CHAT_ID missing; skipping post');
    return;
  }
  // Use plain text instead of Markdown to avoid escaping headache — headlines
  // routinely contain `_`, `*`, `[`, `]`, `(`, `)` which Telegram's Markdown
  // parser treats as formatting. Plain text + URL preview gives the same UX
  // without the breakage risk.
  const text = `⚡ Breaking (${trackerSlug}, score ${score.toFixed(2)})\n${candidate.title}\n${candidate.url}`;
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: false }),
  });
  if (!res.ok) console.warn('[light-scan] telegram post failed:', await res.text());
}

async function main() {
  const state = loadState();
  const seenUrls = new Set(state.seen.map((s) => s.url));

  const trackers = loadAllTrackers().filter((t) => t.status === 'active');
  if (trackers.length === 0) { console.log('[light-scan] no active trackers'); return; }

  // Build keyword indexes from the actual tracker.json schema:
  //  - tracker.tags: array of free-form keyword hints (e.g. "Mexico", "PRI")
  //  - tracker.name: full display name as fallback signal
  //  - tracker.ai.searchContext: prose context the nightly pipeline uses
  const indexes = trackers.map((t) => ({
    tracker: t,
    index: buildKeywordIndex({
      slug: t.slug,
      keywords: [
        ...(Array.isArray(t.tags) ? t.tags : []),
        ...(t.name ? [t.name] : []),
      ],
      searchContext: t.ai?.searchContext,
    }),
  }));

  const [rss, realtime] = await Promise.all([pollLightFeeds(), pollRealtimeSources()]);
  const fresh = dedup([...rss, ...realtime], seenUrls);
  console.log(`[light-scan] ${fresh.length} fresh candidates after dedup`);

  const pending = loadPending(PATHS.pendingCandidates);
  const logEntries: TriageLogEntry[] = [];
  let posted = 0, deferred = 0, discarded = 0;

  for (const cand of fresh) {
    let bestScore = 0;
    let bestSlug = '';
    for (const { tracker, index } of indexes) {
      const s = scoreCandidate(cand, index);
      if (s > bestScore) { bestScore = s; bestSlug = tracker.slug; }
    }

    if (bestScore >= HIGH_THRESHOLD && bestSlug) {
      cand.matchedTracker = bestSlug;
      await postTelegram(cand, bestScore, bestSlug);
      posted++;
      logEntries.push({
        timestamp: new Date().toISOString(), candidate: cand,
        decision: 'update', reason: `light-scan posted directly (score ${bestScore.toFixed(2)})`,
        confidence: bestScore, model: null, scanType: 'light',
      });
    } else if (bestScore >= MODERATE_THRESHOLD) {
      cand.matchedTracker = bestSlug;
      pending.entries.push({ candidate: cand, score: bestScore, recordedAt: new Date().toISOString() });
      deferred++;
      logEntries.push({
        timestamp: new Date().toISOString(), candidate: cand,
        decision: 'defer', reason: `deferred to next heavy scan (score ${bestScore.toFixed(2)})`,
        confidence: bestScore, model: null, scanType: 'light',
      });
    } else {
      discarded++;
      logEntries.push({
        timestamp: new Date().toISOString(), candidate: cand,
        decision: 'discard', reason: `low score (${bestScore.toFixed(2)})`,
        confidence: bestScore, model: null, scanType: 'light',
      });
    }

    state.seen.push({ url: cand.url, tracker: bestSlug || '', eventId: '', ts: new Date().toISOString() });
  }

  savePending(pending, PATHS.pendingCandidates);
  appendTriageEntries(logEntries, PATHS.triageLog);
  // Independent prune from the heavy scan so the audit log stays bounded
  // even if the heavy pipeline is paused/failing.
  const removedFromLog = pruneTriageLog(PATHS.triageLog, 14);
  if (removedFromLog > 0) console.log(`[light-scan] pruned ${removedFromLog} log entries older than 14 days`);
  state.lastScan = new Date().toISOString();
  saveState(state);

  console.log(`[light-scan] done: posted=${posted} deferred=${deferred} discarded=${discarded}`);
}

main().catch((err) => { console.error('[light-scan] fatal:', err); process.exit(1); });
