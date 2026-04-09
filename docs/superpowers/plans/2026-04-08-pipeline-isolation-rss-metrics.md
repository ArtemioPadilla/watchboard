# Pipeline Isolation (RSS + Metrics) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tag digests and metrics by pipeline source so RSS feeds support category filtering, a new `/rss/breaking.xml` serves hourly-only items, and the metrics dashboard tracks pipeline health independently.

**Architecture:** Add `source` field to DigestEntrySchema and `pipeline` field to MetricsIndexEntrySchema (both optional with defaults for backward compat). Modify the two existing RSS endpoints to emit `<category>` tags. Create one new RSS endpoint for breaking news. Update the hourly workflow prompt to write digest entries. Add pipeline filter to MetricsDashboard.

**Tech Stack:** Zod (schemas), Astro RSS (`@astrojs/rss`), React (MetricsDashboard), GitHub Actions (workflow prompts)

**Spec:** `docs/superpowers/specs/2026-04-08-pipeline-isolation-rss-metrics-design.md`

---

## File Structure

### New files

| File | Responsibility |
|---|---|
| `src/pages/rss/breaking.xml.ts` | Breaking-news-only RSS feed |

### Modified files

| File | Changes |
|---|---|
| `src/lib/schemas.ts:221-226,264-270` | Add `source` to DigestEntrySchema, `pipeline` to MetricsIndexEntrySchema |
| `src/pages/rss.xml.ts` | Add `<category>` from digest source, update GUID format |
| `src/pages/[tracker]/rss.xml.ts` | Add `<category>` from digest source, update GUID format |
| `src/layouts/BaseLayout.astro:72` | Add breaking RSS `<link rel="alternate">` |
| `.github/workflows/hourly-scan.yml` | Add digest writing + metrics collection to prompt |
| `.github/workflows/update-data.yml` | Add `pipeline: "nightly"` to metrics |
| `src/components/islands/MetricsDashboard.tsx` | Add pipeline filter toggle + pipeline column |

---

## Task 1: Schema — Add source and pipeline fields

**Files:**
- Modify: `src/lib/schemas.ts:221-226,264-270`

- [ ] **Step 1: Add source to DigestEntrySchema**

In `src/lib/schemas.ts`, find the `DigestEntrySchema` (line 221). Replace it:

```typescript
export const DigestEntrySchema = z.object({
  date: z.string(),
  title: z.string(),
  summary: z.string(),
  sectionsUpdated: z.array(z.string()).optional(),
  source: z.enum(['daily', 'breaking', 'seed']).optional().default('daily'),
});
```

- [ ] **Step 2: Add pipeline to MetricsIndexEntrySchema**

Find `MetricsIndexEntrySchema` (line 264). Replace it:

```typescript
export const MetricsIndexEntrySchema = z.object({
  file: z.string(),
  timestamp: z.string(),
  status: z.enum(['success', 'failure']),
  trackerCount: z.number(),
  errorCount: z.number(),
  pipeline: z.enum(['nightly', 'hourly', 'seed', 'init']).optional().default('nightly'),
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run 2>&1 | tail -5`
Expected: All tests pass (existing data files parse with defaults)

- [ ] **Step 4: Commit**

```bash
git add src/lib/schemas.ts
git commit -m "feat(pipeline): add source to DigestEntrySchema, pipeline to MetricsIndexEntrySchema"
```

---

## Task 2: Global RSS feed — add category tags

**Files:**
- Modify: `src/pages/rss.xml.ts`

- [ ] **Step 1: Read the current file**

Read `src/pages/rss.xml.ts` to understand its structure. It uses `@astrojs/rss` and maps digests to RSS items.

- [ ] **Step 2: Add category and update GUID**

The `@astrojs/rss` library supports `customData` on each item for arbitrary XML. Update the items mapping to include a `<category>` element and a source-aware GUID.

Find where items are mapped from digests. Each item currently has: `title`, `description`, `link`, `pubDate`. Add `customData` with the category tag, and update the `link` or add a unique GUID:

```typescript
items: allDigests.slice(0, 50).map((d, i) => ({
  title: d.title,
  description: d.summary,
  link: `${site}${d.trackerSlug}/`,
  pubDate: new Date(d.date),
  customData: `<category>${d.source || 'daily'}</category>`,
})),
```

The exact shape depends on how the current code structures items. Read the file first, then apply the `customData` field to each item.

Also ensure the `d.source` field is available — it comes from `DigestEntrySchema` which now includes `source` with a default of `'daily'`.

- [ ] **Step 3: Verify build**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds. Check `dist/rss.xml` contains `<category>daily</category>` in items.

- [ ] **Step 4: Commit**

```bash
git add src/pages/rss.xml.ts
git commit -m "feat(rss): add <category> tags to global RSS feed"
```

---

## Task 3: Per-tracker RSS feed — add category tags

**Files:**
- Modify: `src/pages/[tracker]/rss.xml.ts`

- [ ] **Step 1: Add category to per-tracker feed**

Same change as Task 2 but for the per-tracker feed. Read the file, find the items mapping, and add `customData` with the category:

```typescript
customData: `<category>${digest.source || 'daily'}</category>`,
```

- [ ] **Step 2: Verify build**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add "src/pages/[tracker]/rss.xml.ts"
git commit -m "feat(rss): add <category> tags to per-tracker RSS feeds"
```

---

## Task 4: Breaking news RSS endpoint

**Files:**
- Create: `src/pages/rss/breaking.xml.ts`

- [ ] **Step 1: Create the breaking feed**

Create `src/pages/rss/breaking.xml.ts`. This is a filtered version of the global feed — only `source === 'breaking'` items:

```typescript
import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { loadAllTrackers } from '../../lib/tracker-registry';
import { loadTrackerData } from '../../lib/data';

export function GET(context: APIContext) {
  const trackers = loadAllTrackers().filter(t => t.status !== 'draft');
  const site = context.site?.href || 'https://watchboard.dev/';

  interface DigestWithSlug {
    title: string;
    summary: string;
    date: string;
    source?: string;
    trackerSlug: string;
    sectionsUpdated?: string[];
  }

  const breakingDigests: DigestWithSlug[] = [];

  for (const tracker of trackers) {
    try {
      const data = loadTrackerData(tracker.slug, tracker.eraLabel);
      for (const digest of data.digests) {
        if (digest.source === 'breaking') {
          breakingDigests.push({
            ...digest,
            source: digest.source,
            trackerSlug: tracker.slug,
          });
        }
      }
    } catch {
      // Skip trackers with no data
    }
  }

  breakingDigests.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return rss({
    title: 'Watchboard — Breaking News',
    description: 'Real-time breaking news updates from Watchboard intelligence trackers',
    site,
    items: breakingDigests.slice(0, 50).map(d => ({
      title: d.title,
      description: d.summary,
      link: `${site}${d.trackerSlug}/`,
      pubDate: new Date(d.date),
      customData: `<category>breaking</category>`,
    })),
    customData: `<language>en-us</language>`,
  });
}
```

- [ ] **Step 2: Create the rss directory**

Ensure `src/pages/rss/` directory exists (it will be created automatically when the file is written).

- [ ] **Step 3: Verify build**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds. Check `dist/rss/breaking.xml` exists.

- [ ] **Step 4: Commit**

```bash
git add src/pages/rss/breaking.xml.ts
git commit -m "feat(rss): add /rss/breaking.xml endpoint for hourly breaking news"
```

---

## Task 5: Add breaking RSS link to BaseLayout

**Files:**
- Modify: `src/layouts/BaseLayout.astro:72`

- [ ] **Step 1: Add the breaking feed link**

Find line 72 where the RSS `<link rel="alternate">` is defined. Add a second link for the breaking feed AFTER the existing one:

```astro
<link rel="alternate" type="application/rss+xml" title="Watchboard Breaking News RSS" href={`${basePath}rss/breaking.xml`} />
```

- [ ] **Step 2: Verify build**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/layouts/BaseLayout.astro
git commit -m "feat(rss): add breaking news RSS discovery link to BaseLayout"
```

---

## Task 6: Hourly workflow — add digest writing to prompt

**Files:**
- Modify: `.github/workflows/hourly-scan.yml`

- [ ] **Step 1: Update the hourly update prompt**

Find the "Update tracker data" step in `hourly-scan.yml` (around line 188). In the Claude Code prompt that instructs the AI to write tracker data, add instructions to write a digest entry.

Add to the prompt (after the existing instructions for writing events/meta):

```
STEP 6 — WRITE DIGEST ENTRY FOR RSS:
Read trackers/{slug}/data/digests.json (create if missing, default to []).
Check if a "breaking" digest already exists for today's date (source === "breaking" AND date === today YYYY-MM-DD).
If YES: update the existing entry — merge sectionsUpdated arrays, update summary to reflect latest event.
If NO: prepend a new entry:
{
  "date": "YYYY-MM-DD",
  "title": "Breaking: {event title}",
  "summary": "{first 200 chars of event description}",
  "sectionsUpdated": [{sections you modified}],
  "source": "breaking"
}
Write the updated array back to digests.json.
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/hourly-scan.yml
git commit -m "feat(hourly): add digest entry writing for RSS visibility"
```

---

## Task 7: Nightly workflow — tag metrics with pipeline

**Files:**
- Modify: `.github/workflows/update-data.yml`

- [ ] **Step 1: Add pipeline field to metrics**

Find the "Collect metrics" step in `update-data.yml` (around line 742). Find where it constructs the index entry JSON (the object with `file`, `timestamp`, `status`, `trackerCount`, `errorCount`). Add `"pipeline": "nightly"` to the object:

```json
{
  "file": "$FILENAME",
  "timestamp": "$TIMESTAMP",
  "status": "$STATUS",
  "trackerCount": $TRACKER_COUNT,
  "errorCount": $ERROR_COUNT,
  "pipeline": "nightly"
}
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/update-data.yml
git commit -m "feat(metrics): tag nightly runs with pipeline field"
```

---

## Task 8: Hourly workflow — add metrics collection

**Files:**
- Modify: `.github/workflows/hourly-scan.yml`

- [ ] **Step 1: Add metrics step to hourly workflow**

After the hourly scan's commit step, add a new step that writes metrics. This mirrors the nightly finalize's metrics collection but simpler:

Add a new step after the existing commit/push step:

```yaml
- name: Collect hourly metrics
  if: always()
  run: |
    TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    FILENAME=$(echo "$TIMESTAMP" | tr ':' '-').json
    UPDATED_COUNT=$(cat /tmp/hourly-updated-slugs.txt 2>/dev/null | wc -l | tr -d ' ')
    ERROR_COUNT=0
    
    mkdir -p public/_metrics/runs
    
    # Write run file
    cat > "public/_metrics/runs/$FILENAME" <<METRICS_EOF
    {
      "pipeline": "hourly",
      "timestamp": "$TIMESTAMP",
      "status": "success",
      "trackersUpdated": $(cat /tmp/hourly-updated-slugs.txt 2>/dev/null | jq -R -s 'split("\n") | map(select(length > 0))' || echo '[]'),
      "candidatesScanned": $(cat /tmp/hourly-candidates-count.txt 2>/dev/null || echo 0),
      "candidatesAccepted": $UPDATED_COUNT
    }
    METRICS_EOF
    
    # Append to index
    INDEX_ENTRY="{\"file\":\"$FILENAME\",\"timestamp\":\"$TIMESTAMP\",\"status\":\"success\",\"trackerCount\":$UPDATED_COUNT,\"errorCount\":$ERROR_COUNT,\"pipeline\":\"hourly\"}"
    
    if [ -f public/_metrics/index.json ]; then
      node -e "
        const fs = require('fs');
        const idx = JSON.parse(fs.readFileSync('public/_metrics/index.json','utf8'));
        idx.push($INDEX_ENTRY);
        const cutoff = Date.now() - 90*24*3600*1000;
        const pruned = idx.filter(e => new Date(e.timestamp).getTime() > cutoff);
        fs.writeFileSync('public/_metrics/index.json', JSON.stringify(pruned, null, 2));
      "
    else
      echo "[$INDEX_ENTRY]" > public/_metrics/index.json
    fi
```

Note: The exact shell commands depend on what temp files the hourly workflow already writes. Read the workflow to find what intermediate files exist (like `/tmp/hourly-updated-slugs.txt`) and adapt accordingly.

- [ ] **Step 2: Add metrics commit to hourly workflow**

Ensure the hourly workflow's final commit step includes metrics files:

```yaml
git add public/_metrics/ || true
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/hourly-scan.yml
git commit -m "feat(metrics): add hourly pipeline metrics collection"
```

---

## Task 9: MetricsDashboard — pipeline filter

**Files:**
- Modify: `src/components/islands/MetricsDashboard.tsx`

- [ ] **Step 1: Add pipeline to the index entry type**

Find the `MetricsIndexEntry` interface (around line 5). Add `pipeline`:

```typescript
interface MetricsIndexEntry {
  file: string;
  timestamp: string;
  status: 'success' | 'failure';
  trackerCount: number;
  errorCount: number;
  pipeline?: 'nightly' | 'hourly' | 'seed' | 'init';
}
```

- [ ] **Step 2: Add pipeline filter state**

Find where state is declared. Add:

```typescript
const [pipelineFilter, setPipelineFilter] = useState<'all' | 'nightly' | 'hourly'>('all');
```

- [ ] **Step 3: Add filter logic**

Find where `entries` (the metrics index array) is used. Add a filtered version:

```typescript
const filteredEntries = useMemo(() => {
  if (pipelineFilter === 'all') return entries;
  return entries.filter(e => (e.pipeline || 'nightly') === pipelineFilter);
}, [entries, pipelineFilter]);
```

Use `filteredEntries` instead of `entries` for all downstream rendering (table, calendar, KPIs).

- [ ] **Step 4: Add filter toggle UI**

Find the header area of the dashboard. Add a pill toggle before the existing content:

```tsx
<div style={{ display: 'flex', gap: '4px', marginBottom: '12px' }}>
  {(['all', 'nightly', 'hourly'] as const).map(p => (
    <button
      key={p}
      onClick={() => setPipelineFilter(p)}
      style={{
        padding: '4px 12px',
        borderRadius: '4px',
        border: `1px solid ${pipelineFilter === p ? 'var(--accent-blue)' : 'var(--border)'}`,
        background: pipelineFilter === p ? 'rgba(88,166,255,0.12)' : 'transparent',
        color: pipelineFilter === p ? 'var(--accent-blue)' : 'var(--text-muted)',
        fontSize: '0.7rem',
        fontFamily: "'DM Sans', sans-serif",
        fontWeight: 600,
        cursor: 'pointer',
        textTransform: 'uppercase',
      }}
    >
      {p === 'all' ? 'ALL' : p === 'nightly' ? '🌙 NIGHTLY' : '⚡ HOURLY'}
    </button>
  ))}
</div>
```

- [ ] **Step 5: Add pipeline column to run log table**

Find the table that lists individual runs. Add a "Pipeline" column header and cell:

Header: `<th>Pipeline</th>`

Cell:
```tsx
<td>
  <span style={{
    fontSize: '0.6rem',
    padding: '1px 6px',
    borderRadius: '3px',
    background: entry.pipeline === 'hourly' ? 'rgba(88,166,255,0.12)' : 'rgba(46,204,113,0.12)',
    color: entry.pipeline === 'hourly' ? '#58a6ff' : '#2ecc71',
  }}>
    {(entry.pipeline || 'nightly').toUpperCase()}
  </span>
</td>
```

- [ ] **Step 6: Verify build**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 7: Commit**

```bash
git add src/components/islands/MetricsDashboard.tsx
git commit -m "feat(metrics): add pipeline filter toggle to MetricsDashboard"
```

---

## Task 10: Integration test

**Files:** None (verification only)

- [ ] **Step 1: Run all tests**

Run: `npx vitest run 2>&1 | tail -10`
Expected: All tests pass

- [ ] **Step 2: Full build**

Run: `npm run build 2>&1 | tail -10`
Expected: Build succeeds

- [ ] **Step 3: Verify RSS outputs**

```bash
# Global feed should exist
ls dist/rss.xml

# Breaking feed should exist
ls dist/rss/breaking.xml

# Check global feed has category tags
grep '<category>' dist/rss.xml | head -3

# Check breaking feed title
grep '<title>' dist/rss/breaking.xml | head -2

# Per-tracker feed should have category
grep '<category>' dist/iran-conflict/rss.xml | head -3
```

- [ ] **Step 4: Verify metrics schema**

```bash
# Check current index still parses (backward compat)
node -e "
  const {MetricsIndexEntrySchema} = require('./src/lib/schemas');
  const idx = require('./public/_metrics/index.json');
  idx.slice(0,3).forEach(e => console.log(MetricsIndexEntrySchema.parse(e)));
  console.log('OK — existing metrics parse with pipeline default');
"
```

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat(pipeline): pipeline isolation — integration complete"
```
