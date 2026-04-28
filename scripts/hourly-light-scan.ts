/**
 * hourly-light-scan.ts
 *
 * Fast 15-min scan: polls a curated subset of high-signal feeds + Bluesky +
 * Telegram, scores each candidate against active trackers via deterministic
 * keyword matching. HIGH-score (>= 0.85, with substance gate) → posts to
 * Telegram for instant alerting AND queues to pending-candidates.json so the
 * next heavy scan promotes it to AI triage + tracker data update. MODERATE
 * (>= MODERATE_THRESHOLD) → pending only. LOW → discarded to audit log.
 *
 * Telegram is an alert channel; only the heavy scan writes tracker data. Both
 * paths queue to pending so high-confidence breaking news actually reaches
 * the tracker's events file.
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
import { buildKeywordIndices, scoreCandidateDetailed } from '../src/lib/keyword-match.js';
import { pollRealtimeSources } from '../src/lib/realtime-sources.js';
import { appendTriageEntries, pruneTriageLog } from '../src/lib/triage-log.js';
import { loadAllTrackers } from './lib/load-trackers-node.js';

const HIGH_THRESHOLD     = 0.85;
// Defer threshold is intentionally low — the new matcher discards aggressively,
// and we want even single-hit borderline cases to reach the heavy scan's AI
// triage rather than being lost. The substance gate above keeps direct posts
// strict; the deferred queue is the heavy scan's input, not a publish channel.
const MODERATE_THRESHOLD = 0.25;

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

  // Build keyword indices corpus-aware so common tokens (e.g. "history",
  // "war", "2025", "tracker") that appear across many trackers are stripped
  // — they generate false positives on unrelated headlines.
  const inputs = trackers.map((t) => ({
    tracker: t,
    config: {
      slug: t.slug,
      keywords: [
        ...(Array.isArray(t.tags) ? t.tags : []),
        ...(t.name ? [t.name] : []),
      ],
      searchContext: t.ai?.searchContext,
    },
  }));
  const indexMap = buildKeywordIndices(inputs.map((i) => i.config));
  const indexes = inputs.map((i) => ({ tracker: i.tracker, index: indexMap.get(i.tracker.slug)! }));

  const [rss, realtime] = await Promise.all([pollLightFeeds(), pollRealtimeSources()]);
  const fresh = dedup([...rss, ...realtime], seenUrls);
  console.log(`[light-scan] ${fresh.length} fresh candidates after dedup`);

  const pending = loadPending(PATHS.pendingCandidates);
  const logEntries: TriageLogEntry[] = [];
  let posted = 0, deferred = 0, discarded = 0, queued = 0;

  for (const cand of fresh) {
    let bestScore = 0;
    let bestSlug = '';
    let bestDetail = { specificHits: 0, commonHits: 0, phraseHits: 0 };
    for (const { tracker, index } of indexes) {
      const d = scoreCandidateDetailed(cand, index, indexMap);
      if (d.score > bestScore) {
        bestScore = d.score;
        bestSlug = tracker.slug;
        bestDetail = d;
      }
    }

    // Substance gate: even with a high score, a direct post needs at least
    // 2 distinct specific tokens — single-keyword matches like "Trump" or
    // "United States" alone produce false positives, and the heavy scan's
    // AI triage handles those better than the threshold alone.
    const hasSubstance =
      bestDetail.specificHits >= 2 ||
      (bestDetail.specificHits >= 1 && bestDetail.phraseHits >= 1);

    if (bestScore >= HIGH_THRESHOLD && bestSlug && hasSubstance) {
      cand.matchedTracker = bestSlug;
      await postTelegram(cand, bestScore, bestSlug);
      // Also queue for the next heavy scan: Telegram is just an alert channel,
      // it doesn't write to tracker data. Without this, high-confidence breaking
      // news posts to Telegram but the tracker's events file is never updated
      // (e.g. CJNG El Jardinero detention 2026-04-27 — detected 2× at 0.87,
      // posted to Telegram, but mencho-cjng/data/events/* unchanged).
      pending.entries.push({ candidate: cand, score: bestScore, recordedAt: new Date().toISOString() });
      posted++;
      queued++;
      logEntries.push({
        timestamp: new Date().toISOString(), candidate: cand,
        decision: 'update', reason: `light-scan posted directly + queued for heavy scan (score ${bestScore.toFixed(2)})`,
        confidence: bestScore, model: null, scanType: 'light',
      });
    } else if (bestScore >= MODERATE_THRESHOLD) {
      cand.matchedTracker = bestSlug;
      pending.entries.push({ candidate: cand, score: bestScore, recordedAt: new Date().toISOString() });
      deferred++;
      queued++;
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

  console.log(`[light-scan] done: posted=${posted} deferred=${deferred} discarded=${discarded} queued=${queued}`);
}

main().catch((err) => { console.error('[light-scan] fatal:', err); process.exit(1); });
