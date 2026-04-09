# Pipeline Isolation — RSS by Source, Metrics by Pipeline

**Date:** 2026-04-08
**Status:** Approved

## Summary

Extend the digest and metrics systems so each ingestion pipeline (nightly, hourly, seed) writes tagged entries. RSS feeds gain `<category>` tags for filtering, a new `/rss/breaking.xml` endpoint serves hourly-only items, and the metrics dashboard tracks pipeline health independently. No breaking changes to existing feeds or metrics.

## Motivation

The hourly breaking news pipeline writes events but no digest entries — hourly updates are invisible to RSS subscribers. Metrics are only collected for the nightly pipeline. By tagging data by source at the schema level, each pipeline can write to the same files while consumers (RSS feeds, metrics dashboard) can filter and group by pipeline type.

## Section 1: Digest Schema Extension

**File:** `src/lib/schemas.ts`

Add `source` field to `DigestEntrySchema`:

```typescript
source: z.enum(['daily', 'breaking', 'seed']).optional().default('daily'),
```

- `daily` — nightly pipeline (default, backward compatible)
- `breaking` — hourly breaking news pipeline
- `seed` — seed-tracker pipeline

All existing `digests.json` entries lack this field and default to `'daily'`. No migration needed.

## Section 2: Hourly Pipeline — Write Digests

**File:** `.github/workflows/hourly-scan.yml` (the Claude Code prompt for the "Update tracker data" step)

After writing event data, the hourly pipeline appends a digest entry to `trackers/{slug}/data/digests.json`:

```json
{
  "date": "2026-04-08",
  "title": "Breaking: Iranian missile barrage targets Haifa port",
  "summary": "Three-wave ballistic missile attack on northern Israel...",
  "sectionsUpdated": ["events", "map-points"],
  "source": "breaking"
}
```

### Dedup rule

If a `breaking` digest already exists for the same tracker on the same date, update the existing entry:
- Read `digests.json`, find the first entry with `source === 'breaking'` and `date === today`
- Merge `sectionsUpdated` arrays (deduplicate)
- Update `summary` to reflect the latest event (or append a count: "3 breaking events today")
- Write the updated array back to `digests.json`
- Do NOT create a second `breaking` entry for the same day

This is done by the Claude Code agent in the hourly workflow step (it already reads/writes JSON files). No special tooling needed.

This prevents RSS feeds from being spammed with multiple hourly entries per tracker per day.

### Digest text generation

The hourly AI agent already produces the event title and description. The digest fields map directly:
- `title` = event title (prefixed with "Breaking: " if not already)
- `summary` = first 200 characters of the event description
- No extra LLM call needed

## Section 3: RSS Feeds

### Existing endpoints (no breaking changes)

**`/rss.xml`** (`src/pages/rss.xml.ts`)
- Reads all digests from all non-draft trackers (unchanged)
- Now includes `breaking` and `seed` entries alongside `daily`
- Each `<item>` gains a `<category>` element from `digest.source`

**`/[tracker]/rss.xml`** (`src/pages/[tracker]/rss.xml.ts`)
- Same as above but filtered to one tracker
- Gains `<category>` element

### New endpoint

**`/rss/breaking.xml`** (`src/pages/rss/breaking.xml.ts`)
- Reads all digests from all non-draft trackers
- Filters to `source === 'breaking'` only
- Same RSS 2.0 format as the global feed
- Feed title: "Watchboard — Breaking News"
- Feed description: "Real-time breaking news updates from Watchboard intelligence trackers"

### RSS item format

```xml
<item>
  <title>Breaking: Iranian missile barrage targets Haifa port</title>
  <description>Three-wave ballistic missile attack on northern Israel...</description>
  <link>https://watchboard.dev/iran-conflict/</link>
  <pubDate>Tue, 08 Apr 2026 14:30:00 GMT</pubDate>
  <category>breaking</category>
  <guid isPermaLink="false">iran-conflict-2026-04-08-breaking-0</guid>
</item>
```

### GUID format

`{slug}-{date}-{source}-{index}` where index is the position of the entry in that tracker's digests for that date and source. Ensures uniqueness.

### Feed discovery

Add `<link rel="alternate">` tags in `BaseLayout.astro` for the breaking feed:

```html
<link rel="alternate" type="application/rss+xml" title="Watchboard Breaking News" href="/rss/breaking.xml" />
```

The existing daily feed link stays unchanged.

## Section 4: Metrics Extension

### Schema change

**File:** `src/lib/schemas.ts`

Add `pipeline` field to `MetricsRunSchema`:

```typescript
pipeline: z.enum(['nightly', 'hourly', 'seed', 'init']).optional().default('nightly'),
```

Optional with default — existing nightly metrics files stay valid.

### Hourly metrics writing

**File:** `.github/workflows/hourly-scan.yml` (finalize step)

After all tracker updates, write a metrics run file to `public/_metrics/runs/`:

```json
{
  "pipeline": "hourly",
  "timestamp": "2026-04-08T14:00:00Z",
  "status": "success",
  "trackerCount": 3,
  "errorCount": 0,
  "trackersUpdated": ["iran-conflict", "ukraine-war", "gaza-war"],
  "candidatesScanned": 45,
  "candidatesAccepted": 3,
  "tweetsPosted": 2
}
```

Append to `public/_metrics/index.json` with the same entry format as nightly, plus `pipeline` field.

### Nightly metrics tagging

**File:** `.github/workflows/update-data.yml` (finalize step)

Add `"pipeline": "nightly"` to the metrics run JSON. This is already the default, but making it explicit improves clarity.

### MetricsDashboard updates

**File:** `src/components/islands/MetricsDashboard.tsx`

- Add pipeline filter toggle at top: **ALL** | **NIGHTLY** | **HOURLY** (pills, same style as existing filters)
- Uptime calendar dots colored by pipeline: green = nightly, blue = hourly, both = split dot
- Run log table gains a "Pipeline" column with colored badge
- KPI cards show filtered totals when a pipeline is selected
- Default view: ALL (shows everything, same as current behavior)

## Files to Create or Modify

### New files

| File | Responsibility |
|---|---|
| `src/pages/rss/breaking.xml.ts` | Breaking-news-only RSS feed |

### Modified files

| File | Changes |
|---|---|
| `src/lib/schemas.ts` | Add `source` to DigestEntrySchema, `pipeline` to MetricsRunSchema |
| `src/pages/rss.xml.ts` | Add `<category>` element from digest source |
| `src/pages/[tracker]/rss.xml.ts` | Add `<category>` element from digest source |
| `src/layouts/BaseLayout.astro` | Add `<link rel="alternate">` for breaking RSS feed |
| `.github/workflows/hourly-scan.yml` | Add digest writing + metrics collection steps |
| `.github/workflows/update-data.yml` | Add explicit `pipeline: "nightly"` to metrics |
| `src/components/islands/MetricsDashboard.tsx` | Add pipeline filter toggle, colored dots, pipeline column |

## Backward Compatibility

- All schema changes use `.optional().default()` — existing files parse without modification
- Existing `/rss.xml` endpoint gains items (richer) but format is identical
- Existing `/[tracker]/rss.xml` same — more items, same format
- Existing metrics files parse with `pipeline: 'nightly'` default
- MetricsDashboard defaults to ALL view — same as current behavior
- No existing URLs change or break
