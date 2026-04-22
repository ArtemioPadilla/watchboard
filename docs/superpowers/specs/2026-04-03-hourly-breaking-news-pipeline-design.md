# Hourly Breaking News Pipeline

**Date:** 2026-04-03
**Status:** Draft

## Problem

The nightly update pipeline (14:00 UTC) leaves up to 24 hours between data refreshes. Breaking news — new strikes, disasters, major political events — goes untracked until the next nightly run. There is also no mechanism to automatically create trackers when events happen outside the scope of existing trackers.

## Solution

A lightweight hourly workflow that detects breaking news via RSS/API polling, confirms relevance with a micro AI triage call, updates affected trackers, posts to X immediately, and can auto-create new trackers for out-of-scope events.

## Architecture: Two-Phase Workflow

Single workflow (`hourly-scan.yml`), two jobs:

1. **Scan** — deterministic RSS/API poll + 1-2 turn AI triage (only if candidates found)
2. **Act** — matrix job, parallel per affected tracker: update data + post to X + create new trackers

### Pipeline Flow

```
Every hour (cron: 0 * * * *)

JOB 1: SCAN
  Step 1: RSS/API Poll (scripts/hourly-scan.ts)
    - Per-tracker: fetch configured ai.rssFeeds + GDELT query by searchContext
    - Global: broad GDELT breaking news query (new-tracker detection)
    - Output: candidate headlines {title, url, source, timestamp, matchedTracker?}

  Step 2: URL Dedup (deterministic)
    - Check against public/_hourly/state.json (48h rolling cache)
    - Check against tracker events from last 3 days
    - Drop already-seen URLs

  Step 3: AI Triage (only if candidates remain)
    - 1-2 turn Claude Sonnet call
    - Input: candidates + last 48h event titles per tracker
    - Output per candidate:
        action: "update" | "new_tracker" | "discard"
        tracker: slug | null
        confidence: 0-1
        summary: string
        suggestedSlug/Domain/Region/Name (if new_tracker)

  Step 4: Build Action Plan
    - Updates: group by tracker, filter confidence >= 0.6
    - New trackers: filter confidence >= 0.8
    - Upload hourly-action-plan.json artifact

JOB 2: ACT (matrix, parallel — only if action plan non-empty)
  For existing tracker updates:
    - Claude Code action (10-15 turns) — update affected sections only
    - Validate (JSON + Zod on modified files, no build gate)
    - Post to X immediately (direct twitter-api-v2)
    - Append to public/_hourly/today-updates.json
    - Update tracker's update-log.json

  For new tracker creation:
    - Claude Code action (20-25 turns) — generate tracker.json + seed first event
    - Validate config against TrackerConfigSchema
    - Post to X (new tracker announcement)
    - Optionally trigger seed-tracker.yml for historical backfill
    - Log to hourly manifest
```

## Detection Layer: RSS/API Polling

### Per-Tracker Polling

New optional field in tracker config: `ai.rssFeeds` (array of RSS/Atom URLs). For trackers with feeds, fetch and parse items from the last 2 hours. For all active trackers, query GDELT API using existing `ai.searchContext` keywords.

All results normalized to: `{title, url, source, timestamp, matchedTracker, feedOrigin}`.

### Global Sweep (New-Tracker Detection)

Single GDELT query for high-impact breaking news. Filter: `theme:TERROR OR theme:MILITARY OR theme:NATURAL_DISASTER OR theme:POLITICAL_VIOLENCE`, sorted by tone intensity (most impactful first), limited to 50 results. Each result compared against all tracker `searchContext` keywords using token overlap. If no tracker matches with >= 2 keyword hits, marked as `matchedTracker: null` — potential new tracker candidate.

### GDELT API

- Endpoint: `https://api.gdeltproject.org/api/v2/doc/doc`
- Mode: `ArtList`, `timespan:120` (last 2 hours)
- Format: JSON (title, url, source, language, seendate)
- Free, no API key required
- One request per tracker batch + one global query

### URL Dedup

- Load `public/_hourly/state.json` — rolling set of seen URLs from last 48h
- Also scan `trackers/{slug}/data/events/` for last 3 days to extract source URLs
- Drop candidates with known URLs
- Prune state entries older than 48h each run

## AI Triage

Runs only when candidates survive URL dedup. Single 1-2 turn Claude Sonnet call.

### Prompt Structure

```
You are a breaking news triage analyst. Given candidate headlines and existing
tracker context, classify each candidate.

EXISTING TRACKERS (last 48h events):
- {slug}: [event titles...]
...

CANDIDATES:
1. {title, url, source, timestamp, matchedTracker}
...

Return JSON:
{ "candidates": [
    { "index": 1, "action": "update"|"new_tracker"|"discard",
      "tracker": "slug"|null, "confidence": 0-1,
      "summary": "...", "reason": "...",
      "suggestedSlug": "...", "suggestedDomain": "...",
      "suggestedRegion": "...", "suggestedName": "..." (if new_tracker) }
] }
```

### Filtering After AI Response

- `action: "update"` — accepted if confidence >= 0.6
- `action: "new_tracker"` — accepted if confidence >= 0.8
- `action: "discard"` — dropped
- Batch dedup: same event from multiple sources → keep highest confidence, merge sources

### Cost Estimate

~2,000-4,000 input tokens, ~500-1,000 output tokens per call. At Sonnet pricing: ~$0.005-0.01 per invocation. Typical day: 3-5 invocations = $0.02-0.05/day.

## Act Job: Existing Tracker Updates

Matrix entry per affected tracker slug.

### Claude Code Action (10-15 turns)

- Reads schemas, tracker config, triage summary + source URLs
- Scoped to breaking-relevant sections only: `events/`, `map-points`, `map-lines`, `kpis`, `meta`
- Does NOT touch deeper sections: `econ`, `political`, `claims`, `casualties` (nightly-only)
- Triage summary means Claude already knows what happened — structures data, doesn't re-search
- Same validation rules as nightly: year=string, no future dates, weaponType+time for strikes, coordinate bounds, tier sourcing
- Also generates tweet text for the X post

### Validation

- JSON syntax check on modified files only
- Zod schema validation on modified files only
- No build gate (too slow for hourly)
- Validation failure → skip tracker, log error. Nightly picks it up with fix agent.

### Immediate X Post

- Direct `twitter-api-v2` call (not queue system)
- Tweet text generated by the same Claude Code action
- 280 chars, tracker link with UTM: `utm_source=x&utm_medium=breaking_hourly&utm_campaign=YYYY-MM-DD`
- Budget: append to `public/_social/budget.json` ($0.01/tweet)
- History: append to `public/_social/history.json` (type: "breaking")

### Manifest + Log

Append to `public/_hourly/today-updates.json`:
```json
{
  "tracker": "iran-conflict",
  "action": "update",
  "eventIds": ["iaea-inspection-apr-2026"],
  "sections": ["events", "map-points", "kpis"],
  "tweetId": "204019...",
  "timestamp": "2026-04-03T15:00:00Z"
}
```

Update `trackers/{slug}/data/update-log.json`: bump lastRun, mark touched sections.

### Commit Strategy

Each matrix entry runs on a separate runner, so each commits independently:
- `git add trackers/{slug}/data/ public/_hourly/ public/_social/`
- Commit message: `chore(hourly): update {slug} TIMESTAMP`
- Git push retry: 3 attempts with jitter (same as nightly pattern) to handle concurrent pushes from parallel matrix entries

## Act Job: New Tracker Creation

Separate matrix entry per new tracker candidate (confidence >= 0.8).

### Claude Code Action (20-25 turns)

- Receives: suggestedSlug, domain, region, name, trigger event
- Reads `tracker-config.ts` + `schemas.ts` + auto-selects template tracker by matching domain
- Generates `tracker.json`:
  - `status: "active"`, `temporal: "live"`
  - Map bounds derived from region/event location
  - 3-4 map categories, 3-4 camera presets, basic nav sections
  - `searchContext` from trigger event
  - `updateIntervalDays: 1`
  - Conservative `backfillTargets` (timeline: 10, mapPoints: 5)
- Creates `trackers/{slug}/data/`:
  - `meta.json` — trigger event as heroHeadline
  - `events/YYYY-MM-DD.json` — trigger event as first entry
  - `map-points.json` — event location if known
  - All other data files as empty arrays
  - `update-log.json` — initialized
- Validates config against `TrackerConfigSchema`

### Seed Job

- Claude action outputs `shouldSeed: boolean`
- Sudden events (earthquake, attack) → no seed, tracker starts from now
- Ongoing situations (building crisis) → trigger `seed-tracker.yml` via `gh workflow run`

### X Post

Special format: "BREAKING: New tracker launched — {name}. {summary}. Follow live: {link}"

## Nightly Pipeline Integration

Two changes to `update-data.yml`:

### Change 1: Resolve Phase Reads Hourly Manifest

After determining eligible trackers, read `public/_hourly/today-updates.json`:
- Tracker fully covered by hourly (all enabled sections) → skip entirely
- Tracker partially covered → scope nightly to untouched sections only

### Change 2: Update Phase Prompt Includes Hourly Event IDs

Extra prompt block per tracker:
```
ALREADY INGESTED TODAY (by hourly pipeline — do NOT re-add these):
- Event IDs: ["iaea-inspection-apr-2026", ...]
- Sections already updated: ["events", "map-points", "kpis"]
Focus on sections NOT listed above.
```

Same injection pattern as existing sibling brief.

### Manifest Lifecycle

- `public/_hourly/today-updates.json` — one file per day, date-keyed by UTC date
- Date rollover: each hourly run computes today's UTC date. If `today-updates.json` has a different `date` field, archive it to `public/_hourly/archive/YYYY-MM-DD.json` and start fresh. This handles midnight cleanly.
- Nightly finalize cleans up archive entries older than 3 days
- `public/_hourly/state.json` — pruned to 48h by hourly scan
- Nightly social queue generator sees hourly posts in `history.json`, avoids duplicating

## File Layout

### New Files

```
.github/workflows/hourly-scan.yml           — the workflow
scripts/hourly-scan.ts                       — RSS/API polling + URL dedup
scripts/hourly-triage.ts                     — AI triage prompt builder + response parser
scripts/hourly-post.ts                       — direct X posting for breaking news
public/_hourly/state.json                    — rolling URL/headline cache (48h)
public/_hourly/today-updates.json            — daily manifest for nightly dedup
```

### Modified Files

```
src/lib/tracker-config.ts                    — add optional ai.rssFeeds to AiConfigSchema
.github/workflows/update-data.yml            — resolve + update phases read hourly manifest
social-config.json                           — add hourly cost tracking category
```

### Config Addition

```typescript
// in AiConfigSchema:
rssFeeds: z.array(z.string().url()).optional()
```

### State File Shape

```json
{
  "lastScan": "2026-04-03T15:00:00Z",
  "seen": [
    { "url": "https://reuters.com/...", "tracker": "iran-conflict", "eventId": "...", "ts": "..." }
  ]
}
```

### Manifest File Shape

```json
{
  "date": "2026-04-03",
  "updates": [
    {
      "tracker": "iran-conflict",
      "action": "update",
      "eventIds": ["iaea-inspection-apr-2026"],
      "sections": ["events", "map-points", "kpis"],
      "tweetId": "204019...",
      "timestamp": "2026-04-03T15:00:00Z"
    },
    {
      "tracker": "turkey-earthquake-2026",
      "action": "new_tracker",
      "eventIds": ["initial-quake-report"],
      "sections": ["events", "map-points", "meta"],
      "tweetId": "204020...",
      "timestamp": "2026-04-03T15:00:00Z",
      "seeded": false
    }
  ]
}
```

## Error Handling

### Quiet Hours (most common)
Poll returns nothing or all deduped → exit early, no AI, no Job 2. Runtime: ~30s.

### RSS/API Failures
- Per-feed timeout: 5s → skip feed, continue
- GDELT down → continue with RSS feeds only
- All sources fail → exit cleanly, next hour retries

### AI Triage Failures
- Unparseable response → skip triage, log error. Candidates reappear next hour (URLs not added to seen cache until processed).
- Timeout: 60s max

### Tracker Update Failures
- Zod validation fails → skip tracker, log. Nightly picks up with fix agent.
- Claude Code fails → same, skip and log.
- Matrix isolation: one tracker failing doesn't block others.

### X Posting Failures
- API error → data still commits, tweet marked `failed` in manifest. No retry.
- Rate limit → same graceful failure.

### New Tracker Failures
- Config validation fails → don't create directory, log candidate to state for retry.
- Partial creation → `rm -rf trackers/{slug}/` before commit.

### Concurrency
- Overlap with nightly: git push retry (3 attempts, jitter)
- Two hourly runs overlap: `concurrency: { group: hourly-scan, cancel-in-progress: true }`

### Manifest Corruption
- Unparseable JSON → reset to empty, log warning. Append-only data means worst case is one hour of reprocessing.
