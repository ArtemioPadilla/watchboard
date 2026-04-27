# Breaking News Pipeline Redesign — Design Spec

**Date:** 2026-04-27
**Status:** Approved (brainstorm), pending implementation plan
**Supersedes (partially):** the existing `hourly-scan.yml` 6-hour-cron pipeline

## Problem

Three concrete user-reported pains with the current breaking-news pipeline:

1. **Latency.** A White House shooting overnight took >6 hours to appear (current cron is `0 */6 * * *`). The 6-hour gap is unacceptable for "breaking" news.
2. **Misses on regional / non-English news.** Mexico City protests and other LATAM domestic stories are absent because we have **no native Spanish-language local outlets** in the feed list — only Google News Mexico (aggregator) and BBC Mundo (UK perspective).
3. **Low yield.** Only 1 update per day across 4 scans on a typical day; the funnel is too narrow somewhere — sources, matching, triage thresholds, or all three.

Root cause is structural: the pipeline has one cadence (6h), one source set (a static RSS list maintained by hand), and no observability into what triage rejects. We are blind to where the funnel breaks.

## Goal

Deliver a redesigned pipeline that:

1. Detects major wire-service breaking news within **≤15 minutes** of publication (latency).
2. Auto-extends source coverage when a tracker is added — Mexican trackers pull Mexican feeds without anyone editing the scan script (regional misses).
3. Adds **real-time signal** from Bluesky and public Telegram OSINT channels alongside RSS + GDELT (volume + latency).
4. Persists every triage decision so we can **see why headlines were rejected** and tune thresholds with data instead of guesses (yield).

## Non-Goals (v1)

- X / Twitter API integration (cost prohibitive for the budget).
- Paid news aggregators (NewsAPI, Webhose, Eventregistry).
- Multi-language native UI for the audit page (English only).
- Replacing the existing 6h heavy scan — it stays, augmented.
- Per-tracker bespoke source overrides — region / domain registry only in v1.

## Architecture

### Two-tier scan cadence

```
0,15,30,45 * * * *   →  light-scan.yml   (96× per day, ~1-2 min runs)
0 */6 * * *          →  heavy-scan.yml   (4× per day, current ~10-15 min)
```

**Light scan** — `scripts/hourly-light-scan.ts`:
- Polls a curated subset of high-signal sources: Reuters wire, AP top stories, BBC top stories, GDELT high-priority themes, plus the realtime sources (Section *Real-time sources*).
- Tracker matching via **deterministic keyword index** (no LLM call) — built at scan time from each tracker's `searchContext`, `keywords`, `region`, `domain`.
- Posts to Telegram only on **HIGH confidence**: multi-signal score = `(keyword_match_strength × 0.5) + (tracker_liveness × 0.3) + (source_tier_weight × 0.2)`. Threshold ≥ 0.85.
- Anything ambiguous (0.5 ≤ score < 0.85) is appended to `public/_hourly/pending-candidates.json` for the next heavy scan to triage with full context.
- Anything below 0.5 is logged to the audit log and discarded.
- Cost: ~$0 (no LLM calls).

**Heavy scan** — modified `scripts/hourly-scan.ts`:
- Current pipeline kept, plus:
  - Resolves per-tracker dynamic feeds via the new feed registry.
  - Reads accumulated `pending-candidates.json` from light scans and merges with its own RSS sweep.
  - Persists every triage decision to `public/_hourly/triage-log.json`.
- Sonnet triage with full context unchanged.
- Posts moderate-confidence items deferred from light scans.

### Per-tracker dynamic feeds

New module `src/lib/tracker-feeds.ts` — typed registry:

```ts
export interface FeedSpec {
  url: string;
  tier: 1 | 2 | 3;
  lang: 'en' | 'es' | 'fr' | 'pt' | 'ar' | 'zh' | 'ja' | 'hi';
  /** When this feed first goes down, we keep polling for this many days
   *  before auto-disabling and warning in the audit log. */
  toleranceDays?: number;
}

const REGION_FEEDS: Record<string, FeedSpec[]> = {
  'mexico': [
    { url: 'https://www.animalpolitico.com/feed/',     tier: 2, lang: 'es' },
    { url: 'https://www.jornada.com.mx/rss/edicion.xml', tier: 2, lang: 'es' },
    { url: 'https://aristeguinoticias.com/feed/',      tier: 2, lang: 'es' },
    { url: 'https://www.eluniversal.com.mx/rss.xml',   tier: 2, lang: 'es' },
  ],
  'india': [/* The Hindu (already), Times of India, Indian Express */],
  'middle-east': [/* Al Jazeera (already), Al Arabiya, Times of Israel */],
  'latam': [/* Clarín, Folha, Globo */],
  // ... extensible
};

const DOMAIN_FEEDS: Record<string, FeedSpec[]> = {
  'space':   [{ url: 'https://www.nasa.gov/news/all/feed/', tier: 1 }, /* SpaceNews, ESA */],
  'science': [/* Nature news, Science Magazine */],
  // ... extensible
};

/** Walks loadAllTrackers(), unions REGION_FEEDS[tracker.region] +
 *  DOMAIN_FEEDS[tracker.domain] across all active trackers, dedupes by URL,
 *  returns the unioned FeedSpec[] for the scan to poll. */
export function resolveFeedsForActiveTrackers(): FeedSpec[];
```

`hourly-scan.ts` (heavy) and `hourly-light-scan.ts` both call `resolveFeedsForActiveTrackers()` and union with the existing `GENERAL_RSS_FEEDS` static list. **Adding a tracker auto-extends coverage** — no scan-script edits.

The `tracker.json` schema is unchanged. The existing `region` and `domain` fields drive the resolution. Trackers with no `region` / `domain` simply contribute nothing to the dynamic union (and the static list still polls).

### Real-time sources

New module `src/lib/realtime-sources.ts` — wraps two non-RSS signal sources behind the same `Candidate` interface used by RSS:

**Bluesky firehose:**
- Use `@atproto/api` (free, public API, no key required for read-only on the public firehose for specific accounts).
- Subscribe to a curated list of OSINT / breaking news accounts (BNO News, Disclose.tv, Reuters official, ANI, etc.).
- Each post → `Candidate` with `source: 'bluesky'`, tier derived from a per-account map.
- Polled at the same cadence as RSS in both light and heavy scans.

**Telegram public channels:**
- Use Telegram Bot API to read messages from public channels. The existing `TELEGRAM_BOT_TOKEN` may need a `getChatHistory` permission; if not, we add a lightweight `/scripts/telegram-poll.ts` that uses the public web preview (`t.me/s/{channel}`) as a fallback.
- Curated channel list: ~5 well-known public OSINT channels (Insider Paper, BNO News on TG, Reuters TG, etc.).
- Each message → `Candidate` with `source: 'telegram'`, tier derived from per-channel map.

Both sources share the same dedup-by-URL logic as RSS. Both have independent error isolation: Bluesky API down → only Bluesky fails, scan continues with RSS + GDELT + Telegram.

### Audit infrastructure

**Log file:** `public/_hourly/triage-log.json` — append-only, capped at 14 days:

```json
{
  "version": 1,
  "lastPruned": "2026-04-27T03:00:00Z",
  "entries": [
    {
      "timestamp": "2026-04-27T01:30:00Z",
      "candidate": { "title": "...", "url": "...", "source": "reuters", "feedOrigin": "..." },
      "decision": "discard",
      "reason": "no matched tracker; no breaking signal in title",
      "confidence": 0.32,
      "model": "claude-sonnet-4-6",
      "scanType": "heavy"
    }
  ]
}
```

**Audit page** — `/breaking-news-audit/`:
- New Astro page that fetches `triage-log.json` at runtime (same pattern as `/metrics/` for ingestion runs).
- Filter chips by decision: `update` / `new_tracker` / `defer` / `discard`.
- Filter by source, by date range, by score range.
- Each entry expandable to show full reason text.
- A small "rejected but flagged for review" view: entries where `decision === 'discard'` but `confidence > 0.5` (would-be borderline rejections worth eyeballing).

After ~1 week of data the maintainer adjusts thresholds via the constants in `hourly-triage.ts` based on what's actually being lost.

## Components & files

### New

- `.github/workflows/light-scan.yml` — 15-min cron, fast path, calls `hourly-light-scan.ts`.
- `scripts/hourly-light-scan.ts` — keyword-only scanner, posts to Telegram on HIGH score, defers ambiguous.
- `src/lib/tracker-feeds.ts` — region/domain → feeds registry + `resolveFeedsForActiveTrackers()`.
- `src/lib/realtime-sources.ts` — Bluesky + Telegram pollers behind shared `Candidate` interface.
- `src/lib/triage-log.ts` — append + prune helpers for the audit log.
- `src/lib/keyword-match.ts` — pure function: build keyword index from a tracker; score a candidate against the index. Deterministic, testable.
- `src/pages/breaking-news-audit.astro` — public audit page.
- `src/components/islands/TriageLogBoard.tsx` — interactive board for the audit log.
- Tests:
  - `src/lib/tracker-feeds.test.ts`
  - `src/lib/triage-log.test.ts`
  - `src/lib/keyword-match.test.ts`

### Modified

- `.github/workflows/hourly-scan.yml` — kept as the heavy scan; reads `pending-candidates.json`, writes `triage-log.json`.
- `scripts/hourly-scan.ts` — uses `tracker-feeds.ts` + `realtime-sources.ts` for the source union.
- `scripts/hourly-triage.ts` — writes to `triage-log.json` after every decision.
- `scripts/hourly-types.ts` — extend `Candidate` with `source: 'rss' | 'gdelt' | 'bluesky' | 'telegram'` and add `pending-candidates` types.
- `src/pages/about.astro` — link to the new audit page.
- `docs/posthog-setup.md` — note the audit-page traffic pattern.

### Deleted

- None.

## Data flow

```
┌──────────────────┐
│  Tracker config  │  (region, domain, searchContext, keywords)
└────────┬─────────┘
         │
         ▼
┌──────────────────┐    ┌────────────────────┐    ┌────────────────┐
│  tracker-feeds   │ ─► │  feeds union       │ ─► │  RSS poller    │
│  + static list   │    │  (deduped FeedSpec) │    │                │
└──────────────────┘    └────────────────────┘    └────┬───────────┘
                                                       │
                                                       ▼
                                               ┌──────────────┐
                                               │  Candidate[] │
                                               └─────┬────────┘
                                                     │
              ┌──────────────────┬──────────────────┘
              ▼                  ▼
     ┌────────────────┐    ┌─────────────────┐
     │ Bluesky poller │    │ Telegram poller │
     └────────┬───────┘    └────────┬────────┘
              │                     │
              └──────────┬──────────┘
                         ▼
                  ┌────────────────┐
                  │  Candidate[]   │  (unified)
                  └────────┬───────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
    ┌──────────────────┐    ┌─────────────────────┐
    │ LIGHT SCAN       │    │ HEAVY SCAN          │
    │ (every 15 min)   │    │ (every 6 hours)     │
    │                  │    │                     │
    │ keyword-match.ts │    │ pending-candidates  │
    │ score ≥ 0.85?    │    │ + own poll union    │
    │ → Telegram       │    │ → Sonnet triage     │
    │ score 0.5-0.85?  │    │ → tracker dispatch  │
    │ → pending        │    │ → triage-log.json   │
    │ score < 0.5?     │    │                     │
    │ → triage-log     │    │                     │
    └──────────────────┘    └─────────────────────┘
                                     │
                                     ▼
                            ┌────────────────────┐
                            │ /breaking-news-    │
                            │  audit/  page      │
                            └────────────────────┘
```

## Error handling

- **Per-feed isolation** — existing pattern in `hourly-scan.ts` is preserved. One feed failing does not abort the scan.
- **Realtime source isolation** — Bluesky API timeout or rate-limit → only Bluesky candidates skipped, RSS + Telegram + GDELT unaffected.
- **Triage-log writes are best-effort** — wrapped in try/catch, never crash the run.
- **Light scan crash does not block heavy scan** — they are separate cron schedules with separate `concurrency` groups.
- **Auto-disable of dead feeds** — feeds in the registry have an optional `toleranceDays` field; after N consecutive failures the feed is skipped and warned in the audit log. (v1: log-only, no auto-disable; flag for v2.)

## Testing

### Unit (Vitest)
- `tracker-feeds.test.ts` — resolver returns correct union for sample trackers, dedupes by URL, handles missing region/domain gracefully.
- `triage-log.test.ts` — append, prune at 14 days, idempotent prune, schema validation.
- `keyword-match.test.ts` — known matches score high, irrelevant headlines score low, edge cases (empty title, missing tracker keywords).

### Integration smoke
- Run `scripts/hourly-light-scan.ts --dry-run` against a snapshot of recent feeds → verify it produces sensible decisions.
- Run `scripts/hourly-scan.ts` end-to-end in a worktree → verify `triage-log.json` is written with the expected shape.

### Manual
- Visit `/breaking-news-audit/` after a deploy → see the latest entries.
- Force-dispatch the light-scan workflow → confirm a Telegram post for a known breaking event within 5 minutes.
- Force-dispatch with a known historical tracker that should NOT match → confirm it lands in the discard bucket.

## Rollout

**Single PR, no feature flag.** Reasons:
- Light scan is additive — does not change the existing heavy scan's behavior except for reading `pending-candidates.json` (gracefully handles missing file).
- The new audit page is a new route; no existing page changes.
- The new feeds are additive on top of the static list; if every new feed fails, the pipeline degrades to current behavior.

**Pre-merge checklist:**
- `npx tsc --noEmit` clean for new + modified files
- `npx vitest run` all tests pass
- `npm run build` succeeds
- Smoke-dispatch the light scan workflow on the PR branch (via `workflow_dispatch`) to confirm it runs

**Post-merge signal:**
- Within 24 hours, audit-page should show ≥50 triage decisions
- Within 1 week, the maintainer reviews `discard but confidence > 0.5` entries to tune thresholds
- Mobile / desktop Web Vitals (already enabled) confirm the audit page is fast (<2s LCP)

## Cost projection

| Source | Per run | Runs/day | Daily cost |
|---|---|---|---|
| Light scans (keyword-match, no LLM) | ~$0 | 96 | ~$0 |
| Heavy scans (Sonnet triage) | ~$0.05 | 4 | ~$0.20 |
| Realtime polling (free APIs) | $0 | continuous | $0 |
| Audit page hosting (GH Pages static) | $0 | — | $0 |
| **Total** | | | **~$6/month** |

vs current ~$5/month. ~$1/month marginal cost for the latency + coverage win.

## Open questions tracked outside this spec

- **Telegram Bot API permissions**: confirm whether the existing `TELEGRAM_BOT_TOKEN` can read public channels; if not, the fallback is the `t.me/s/{channel}` web scraper.
- **Bluesky account list**: needs a one-time curation pass (~10 accounts). Maintainer to provide or accept defaults from the implementation plan.
- **Threshold tuning**: explicitly deferred to post-launch, based on real audit-log data.

## Related work

- Builds on the existing 3-stage pipeline in `scripts/hourly-{scan,triage,post}.ts` and the `claude-code-action`-based dispatch.
- Mirrors the design philosophy of the nightly `update-data.yml` (resolve → matrix → finalize).
- Audit page reuses the `/metrics/` pattern (static page reads JSON at runtime, no build dependency).
