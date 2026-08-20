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
import { pathToFileURL } from 'node:url';
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
import { buildKeywordIndices, scoreCandidateDetailed, hasSubstance as hasSubstanceFor } from '../src/lib/keyword-match.js';
import { pollRealtimeSources } from '../src/lib/realtime-sources.js';
import { appendTriageEntries } from '../src/lib/triage-log.js';
import { loadAllTrackers } from './lib/load-trackers-node.js';

const HIGH_THRESHOLD     = 0.85;
// Defer threshold is intentionally low — the new matcher discards aggressively,
// and we want even single-hit borderline cases to reach the heavy scan's AI
// triage rather than being lost. The substance gate above keeps direct posts
// strict; the deferred queue is the heavy scan's input, not a publish channel.
const MODERATE_THRESHOLD = 0.25;

// ── Telegram noise control ───────────────────────────────────────────────────
// This scan runs every 15 minutes and, until now, posted every candidate that
// cleared the substance gate. Deduplication was by URL only, so one story
// covered by Reuters, AP and the BBC was three URLs and three near-identical
// posts to a public channel with outside subscribers.
//
// Two limits, deliberately blunt: a topic fingerprint so the same story is not
// repeated, and a daily cap so an unusually busy news day cannot flood the
// channel regardless. telegram-channel.ts already caps itself at 10/day; this
// path had no cap at all.
/** Hours a topic stays suppressed after being alerted. */
const TOPIC_COOLDOWN_HOURS = 12;
/** Max light-scan alerts per day, across all trackers. */
const ALERT_DAILY_CAP = 6;
/** Word overlap above which two headlines are treated as the same story. */
const TOPIC_MATCH_RATIO = 0.6;
/**
 * Shared significant words above which two headlines are the same story
 * regardless of ratio.
 *
 * The ratio alone was too strict in practice. Measured against 242 real
 * headlines from a single day, the same story covered by three outlets scored
 * 0.38-0.40 -- just under the 0.6 bar -- so each outlet alerted separately:
 *
 *   "United Arab Emirates suspends trade with Iran after ..."   } shared:
 *   "UAE says it is suspending trade with Iran after missile"   } iran,
 *   "UAE cuts off trade with Iran after missiles land in water" } missile, trade
 *
 * Outlets write the same event at different lengths and with different framing,
 * which inflates the denominator; what actually identifies a story is the
 * entities it names. Three shared significant words is a strong signal, and
 * over-merging is the cheap direction to err in: the cost is one missed alert
 * in a 12h window, while the heavy scan still ingests every candidate into
 * tracker data. Under-merging spams a public channel with outside subscribers.
 */
const TOPIC_MIN_SHARED = 3;

const TOPIC_STOPWORDS = new Set([
  'the','and','for','with','from','that','this','after','over','into','says',
  'said','amid','new','breaking','update','live','report','reports','reported',
  'has','have','been','will','its','his','her','their','they','are','was','were',
  'more','than','who','what','when','where','why','how','about','out','off',
  // Weak verbs and qualifiers that survive the 3-char filter and pad the
  // denominator without saying anything about which story this is.
  'again','could','would','should','may','might','still','back','told','say',
  'make','made','take','took','get','got','via',
]);

/**
 * Outlet names, which arrive inside feed titles ("... - The Washington Post")
 * and are pure noise for topic identity: they are precisely the part that
 * differs when two outlets cover one story.
 */
const TOPIC_OUTLETS = new Set([
  'reuters','reut','jazeera','aljazeera','wsj','bbc','cnn','nyt','nytimes',
  'wapo','guardian','bloomberg','axios','cnbc','npr','afp','apnews','politico',
  'telegraph','independent','newsweek','forbes','thehill','hill',
]);

/**
 * Significant words of a headline, lowercased, singularised and sorted — the
 * topic key.
 *
 * The trailing-s trim is crude but it is what makes wire copy match: "Houthis
 * claim missile attack" and "Houthi rebels struck with missiles" otherwise
 * share only three words and slip past as separate stories.
 */
export function topicKeyOf(title: string): string {
  const words = (title.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])
    .filter((w) => !TOPIC_STOPWORDS.has(w) && !TOPIC_OUTLETS.has(w))
    // Drop mixed letter+digit tokens: these are tracking-slug fragments from
    // feed URLs ("4x9tv5m"), never topic words. Pure digits are kept -- years
    // and casualty counts do identify a story (subject to the tokeniser's
    // 3-char minimum, so "150" survives and "12" does not).
    .filter((w) => !(/\d/.test(w) && /[a-z]/.test(w)))
    .map((w) => (w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w));
  return [...new Set(words)].sort().join(' ');
}

/** True when two topic keys share enough significant words to be one story. */
export function sameTopic(a: string, b: string): boolean {
  const A = new Set(a.split(' ').filter(Boolean));
  const B = new Set(b.split(' ').filter(Boolean));
  if (A.size === 0 || B.size === 0) return false;
  let shared = 0;
  for (const w of A) if (B.has(w)) shared++;
  // Ratio against the shorter headline: a wire snippet and a longer writeup of
  // the same event should still match. The absolute floor catches the case the
  // ratio misses -- two long, differently-framed writeups naming the same
  // entities. See TOPIC_MIN_SHARED.
  if (shared >= TOPIC_MIN_SHARED) return true;
  return shared / Math.min(A.size, B.size) >= TOPIC_MATCH_RATIO;
}

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

/** Post a breaking alert to Telegram. Returns true on success — failures are
 *  recorded in state.telegramFailed so the next scan retries the alert. */
async function postTelegram(title: string, url: string, score: number, trackerSlug: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.warn('[light-scan] TELEGRAM_BOT_TOKEN/CHAT_ID missing; skipping post');
    return false;
  }
  // Use plain text instead of Markdown to avoid escaping headache — headlines
  // routinely contain `_`, `*`, `[`, `]`, `(`, `)` which Telegram's Markdown
  // parser treats as formatting. Plain text + URL preview gives the same UX
  // without the breakage risk.
  const text = `⚡ Breaking (${trackerSlug}, score ${score.toFixed(2)})\n${title}\n${url}`;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: false }),
    });
    if (!res.ok) {
      console.warn('[light-scan] telegram post failed:', await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[light-scan] telegram post failed:', (err as Error).message);
    return false;
  }
}

async function main() {
  const state = loadState();
  const seenUrls = new Set(state.seen.map((s) => s.url));

  // Retry Telegram alerts that failed on a previous scan (the candidate was
  // already queued to pending — only the alert was lost).
  if (state.telegramFailed?.length) {
    const stillFailed: typeof state.telegramFailed = [];
    for (const f of state.telegramFailed) {
      const ok = await postTelegram(f.title, f.url, f.score, f.tracker);
      if (ok) console.log(`[light-scan] retried telegram alert OK: ${f.url}`);
      else stillFailed.push(f);
    }
    state.telegramFailed = stillFailed;
  }

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

  // Prune stale pending entries (older than 7 days) to keep queue bounded.
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const beforePrune = pending.entries.length;
  pending.entries = pending.entries.filter((e) => e.recordedAt >= sevenDaysAgo);
  if (pending.entries.length < beforePrune)
    console.log(`[light-scan] pruned ${beforePrune - pending.entries.length} stale pending entries (>7 days)`);

  // Build a Set of URLs already in the queue to prevent duplicate entries.
  const pendingUrls = new Set(pending.entries.map((e) => e.candidate.url));

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

    // Substance gate: a single matched token is not evidence, whatever the
    // score says. It governs both the alert path and the defer path below.
    //
    // One specific hit scores 0.3167 at tier 2, which clears MODERATE_THRESHOLD
    // on its own. Measured against a full day of traffic, 143 of 170 deferred
    // candidates (84%) routed on exactly one token, and the token was routinely
    // a domain acronym colliding with an ordinary English word:
    //
    //   "car"    -> cancer-breakthroughs   (CAR-T cell therapy)
    //   "who"    -> covid-pandemic         (the WHO)
    //   "system" -> brics                  ("payment system")
    //
    // Tokenisation lowercases, so "WHO" and "who" are the same token — it
    // cannot carry evidence in either direction. That produced routes like
    // "Angélique Kidjo becomes first African musician with a Hollywood star"
    // -> sheinbaum-presidency, and "Watch: SpaceX rocket spotted off Christmas
    // Island" -> artemis-2.
    //
    // None of those 143 reached HIGH_THRESHOLD, so requiring substance to
    // route costs no alerts; it only stops the heavy scan's AI triage from
    // spending turns on noise.
    const hasSubstance = hasSubstanceFor(bestDetail);

    if (bestScore >= HIGH_THRESHOLD && bestSlug && hasSubstance) {
      cand.matchedTracker = bestSlug;

      // Suppress a repeat of a story already announced, and stop a busy day
      // from flooding the channel. Queuing for the heavy scan still happens
      // below either way — this only governs what gets *posted*.
      state.alerted = state.alerted ?? [];
      const key = topicKeyOf(cand.title);
      const cooldownFrom = new Date(Date.now() - TOPIC_COOLDOWN_HOURS * 3600_000).toISOString();
      const dupe = state.alerted.find(
        (a) => a.ts > cooldownFrom && a.tracker === bestSlug && sameTopic(a.topicKey, key),
      );
      const today = new Date().toISOString().slice(0, 10);
      const sentToday = state.alerted.filter((a) => a.ts.slice(0, 10) === today).length;

      let tgOk = true;
      if (dupe) {
        console.log(`[light-scan] skip alert (same story as earlier post): ${cand.title.slice(0, 70)}`);
      } else if (sentToday >= ALERT_DAILY_CAP) {
        console.log(`[light-scan] daily alert cap reached (${ALERT_DAILY_CAP}) — queued only`);
      } else {
        tgOk = await postTelegram(cand.title, cand.url, bestScore, bestSlug);
        if (tgOk) state.alerted.push({ tracker: bestSlug, topicKey: key, ts: new Date().toISOString() });
      }

      if (!tgOk) {
        // Record so the next scan retries the alert (URL is already in
        // state.seen, so without this the alert would be lost forever).
        state.telegramFailed = state.telegramFailed ?? [];
        state.telegramFailed.push({
          url: cand.url, title: cand.title, tracker: bestSlug,
          score: bestScore, ts: new Date().toISOString(),
        });
      }
      // Also queue for the next heavy scan: Telegram is just an alert channel,
      // it doesn't write to tracker data. Without this, high-confidence breaking
      // news posts to Telegram but the tracker's events file is never updated
      // (e.g. CJNG El Jardinero detention 2026-04-27 — detected 2× at 0.87,
      // posted to Telegram, but mencho-cjng/data/events/* unchanged).
      if (!pendingUrls.has(cand.url)) {
        pending.entries.push({ candidate: cand, score: bestScore, recordedAt: new Date().toISOString() });
        pendingUrls.add(cand.url);
        queued++;
      }
      posted++;
      logEntries.push({
        timestamp: new Date().toISOString(), candidate: cand,
        decision: 'update', reason: `light-scan posted directly + queued for heavy scan (score ${bestScore.toFixed(2)})`,
        confidence: bestScore, model: null, scanType: 'light',
      });
    } else if (bestScore >= MODERATE_THRESHOLD && hasSubstance) {
      cand.matchedTracker = bestSlug;
      if (!pendingUrls.has(cand.url)) {
        pending.entries.push({ candidate: cand, score: bestScore, recordedAt: new Date().toISOString() });
        pendingUrls.add(cand.url);
        queued++;
      }
      deferred++;
      logEntries.push({
        timestamp: new Date().toISOString(), candidate: cand,
        decision: 'defer', reason: `deferred to next heavy scan (score ${bestScore.toFixed(2)})`,
        confidence: bestScore, model: null, scanType: 'light',
      });
    } else {
      discarded++;
      // Separate the two discard reasons so the audit page can tell "nothing
      // matched" from "matched, but on a single token" — the latter is what
      // #149 was reporting as misrouting.
      const reason =
        bestScore >= MODERATE_THRESHOLD
          ? `matched ${bestSlug} on a single token — no substance (score ${bestScore.toFixed(2)})`
          : `low score (${bestScore.toFixed(2)})`;
      logEntries.push({
        timestamp: new Date().toISOString(), candidate: cand,
        decision: 'discard', reason,
        confidence: bestScore, model: null, scanType: 'light',
      });
    }

    state.seen.push({ url: cand.url, tracker: bestSlug || '', eventId: '', ts: new Date().toISOString() });
  }

  savePending(pending, PATHS.pendingCandidates);
  // Append + weekly partition + prune happen in one atomic pass; entries
  // older than the current+previous ISO week are archived to
  // triage-log-YYYY-Www.json files (incl. the one-time legacy migration).
  const archivedFromLog = appendTriageEntries(logEntries, PATHS.triageLog);
  if (archivedFromLog > 0) console.log(`[light-scan] archived ${archivedFromLog} log entries to weekly files`);
  state.lastScan = new Date().toISOString();
  saveState(state);

  console.log(`[light-scan] done: posted=${posted} deferred=${deferred} discarded=${discarded} queued=${queued}`);
}

// Only run when invoked directly (`npx tsx scripts/hourly-light-scan.ts`).
// This module is imported by tests/hourly-topic-dedup.test.ts for topicKeyOf
// and sameTopic; without this guard, importing it starts a real scan -- feed
// polling and the Telegram post path -- from inside the test suite.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => { console.error('[light-scan] fatal:', err); process.exit(1); });
}
