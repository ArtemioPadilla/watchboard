# Ingestion Metrics Dashboard & Historical Event Review

**Date**: 2026-03-25
**Status**: Approved

## Problem

The nightly data update workflow has failed 4 consecutive days (March 23-25) due to Zod schema validation errors. There is no visibility into run history, error patterns, or data trends. Additionally, failed runs leave gaps in daily event files with no mechanism to backfill or verify historical event accuracy.

## Solution

Three components integrated into the existing workflow:

1. **Ingestion Metrics** — Deterministic bash/node step that records every run (pass or fail) as a JSON file with datetime filename
2. **Review Manifest** — Node script that generates a per-tracker inventory of event coverage, identifying gaps and sparse days
3. **AI Event Review** — Enhanced prompt that uses the manifest to verify, deduplicate, and backfill events with multi-source confirmation

## Architecture

```
update-data.yml pipeline:

  1. Resolve eligible trackers          (existing)
  2. Generate review manifests          (NEW - node script)
  3. Claude Code updates data           (ENHANCED - review + update)
  4. Validate JSON + Zod                (existing)
  5. If valid → Commit data             (existing)
  5b. If invalid → Fix Agent            (NEW - targeted schema fix, 1 attempt)
  5c. Re-validate JSON + Zod            (NEW)
  5d. If valid → Commit data            (NEW)
  6. Collect metrics                    (NEW - bash/node, runs always)
  7. Commit + push metrics              (NEW - runs always, with pull-rebase retry)
```

## Component 1: Metrics Collection

### Workflow Step

Runs on `if: always()` after validation, capturing both successes and failures.

A bash/node script that:
- Reads outputs from prior steps (resolved trackers, changes detected, JSON valid, schema valid)
- Captures validation errors from the Zod step output
- Counts data items per tracker (same logic as existing Job Summary)
- Writes per-run JSON file and updates the index
- Prunes index entries older than 90 days

### Per-Run File

Path: `public/_metrics/runs/YYYY-MM-DDTHH-MM-SSZ.json`

```json
{
  "timestamp": "2026-03-25T14:00:00Z",
  "status": "success|failure",
  "trigger": "schedule|workflow_dispatch",
  "trackersResolved": ["iran-conflict", "ayotzinapa"],
  "validation": {
    "jsonValid": true,
    "schemaValid": false,
    "errors": [
      {
        "tracker": "iran-conflict",
        "file": "map-lines.json",
        "field": "41.launched",
        "message": "Expected number, received boolean"
      }
    ]
  },
  "inventory": {
    "iran-conflict": {
      "kpis": 6,
      "timeline": 2,
      "mapPoints": 61,
      "mapLines": 103,
      "claims": 27,
      "political": 30,
      "casualties": 9,
      "events": 113
    }
  }
}
```

### Index File

Path: `public/_metrics/index.json`

```json
[
  {
    "file": "2026-03-25T14-00-00Z.json",
    "timestamp": "2026-03-25T14:00:00Z",
    "status": "failure",
    "trackerCount": 22,
    "errorCount": 19
  }
]
```

Retention: 90 days. The metrics collection step prunes entries older than 90 days from the index and deletes corresponding run files.

### Zod Schemas

Add to `src/lib/schemas.ts`:

```typescript
export const MetricsValidationErrorSchema = z.object({
  tracker: z.string(),
  file: z.string(),
  field: z.string(),
  message: z.string(),
});

export const MetricsRunSchema = z.object({
  timestamp: z.string(),
  status: z.enum(['success', 'failure']),
  trigger: z.enum(['schedule', 'workflow_dispatch']),
  trackersResolved: z.array(z.string()),
  validation: z.object({
    jsonValid: z.boolean(),
    schemaValid: z.boolean(),
    errors: z.array(MetricsValidationErrorSchema),
    fixAgentInvoked: z.boolean().optional(),
    fixAgentResult: z.enum(['success', 'failure']).optional(),
    errorsBeforeFix: z.number().optional(),
    errorsAfterFix: z.number().optional(),
  }),
  inventory: z.record(z.string(), z.object({
    kpis: z.number(),
    timeline: z.number(),
    mapPoints: z.number(),
    mapLines: z.number(),
    claims: z.number(),
    political: z.number(),
    casualties: z.number(),
    events: z.number(),
  })),
});

export const MetricsIndexEntrySchema = z.object({
  file: z.string(),
  timestamp: z.string(),
  status: z.enum(['success', 'failure']),
  trackerCount: z.number(),
  errorCount: z.number(),
});
```

### Commit Strategy

Metrics commit is separate from data commit. Runs on `if: always()` regardless of validation outcome.

Full sequence:
```bash
git add public/_metrics/
git commit -m "chore(metrics): ingestion run YYYY-MM-DDTHH:MM:SSZ [status]"
git pull --rebase origin main && git push  # with 3 retries, same as data commit
```

Since metrics live in `public/_metrics/`, they are outside the `trackers/` directory and will NOT be picked up by the existing Zod validation `find` command (`find trackers -name '*.json' -path '*/data/*'`).

## Component 2: Review Manifest

### Script

Path: `scripts/generate-review-manifest.ts`

Runs before the Claude Code step. For each eligible tracker:

1. Reads `update-log.json` to find last run date (note: this reflects the last time the AI step ran, not necessarily the last successful commit — used as a heuristic)
2. Computes review window: `min(max(days_since_last_run, 7), 30)` — at least 7 days, capped at 30
3. If `update-log.json` is missing or has no `lastRun` field, defaults to 7 days
4. Scans `data/events/` directory, counts events per day in the window
5. Writes `trackers/{slug}/data/review-manifest.json`

### Manifest Format

```json
{
  "tracker": "iran-conflict",
  "windowStart": "2026-03-18",
  "windowEnd": "2026-03-25",
  "days": [
    { "date": "2026-03-18", "eventCount": 5 },
    { "date": "2026-03-19", "eventCount": 3 },
    { "date": "2026-03-20", "eventCount": 0 },
    { "date": "2026-03-21", "eventCount": 0 },
    { "date": "2026-03-22", "eventCount": 4 },
    { "date": "2026-03-23", "eventCount": 0 },
    { "date": "2026-03-24", "eventCount": 0 },
    { "date": "2026-03-25", "eventCount": 0 }
  ],
  "totalEvents": 12,
  "gapDays": ["2026-03-20", "2026-03-21", "2026-03-23", "2026-03-24", "2026-03-25"]
}
```

### Lifecycle

- Generated fresh before each AI step
- Gitignored (temp artifact, not deployed)
- Cleanup is implicit: GitHub Actions uses ephemeral runners, so temp files are discarded when the job ends. No explicit cleanup step needed.

## Component 3: AI Event Review

### Prompt Enhancement

New STEP 2.5 added to the Claude Code prompt, between reading tracker config and updating data:

```
STEP 2.5 - REVIEW EXISTING EVENTS:
Read trackers/{slug}/data/review-manifest.json. For each day in the window:

A) GAP DAYS (eventCount = 0):
   - Search for what happened on that date related to this tracker's topic
   - Use at least 2 different search strategies (topic search, actor search, region search)
   - Create event file only if you find real events with 2+ sources

B) EXISTING DAYS (eventCount > 0):
   - Read the event file
   - Verify each event's date: is it actually from that day? If misplaced, move to correct day's file
   - Search for additional events that may have been missed

C) BEFORE ADDING ANY EVENT:
   - Check +/-2 neighboring days' event files for duplicates (same incident reported on different dates)
   - Confirm the date via at least 2 independent sources
   - If date is uncertain, use the earliest confirmed report date
```

## Component 4: Validation Fix Agent (Fallback)

### Purpose

When Zod validation fails, instead of losing all the AI's work, dispatch a lightweight fix agent that reads the exact errors and corrects them. One retry attempt only.

### Workflow Steps

**Step 5b — Fix Agent** (runs only if step 4 Zod validation fails):

```yaml
- name: Fix validation errors
  if: steps.validate.outputs.valid != 'true' && steps.changes.outputs.changed == 'true'
  uses: anthropics/claude-code-action@v1
  with:
    claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
    prompt: |
      You are a schema fix agent for the Watchboard platform.
      The nightly data update produced files that fail Zod validation.
      Fix the reported errors AND scan each affected file for other
      instances of the same pattern — the AI updater tends to repeat
      the same mistake across multiple entries.

      Do NOT add new data. Do NOT search the web. Do NOT remove entries.

      VALIDATION ERRORS:
      ${{ steps.validate.outputs.errors }}

      STEP 1 — Read src/lib/schemas.ts to understand the exact Zod schemas.

      STEP 2 — For each error, read the file and fix the specific field.

      STEP 3 — After fixing reported errors, scan the ENTIRE file for
      other entries with the same class of mistake. Common patterns:

      TYPE COERCIONS (wrong JS type):
        - year: 2026 → "2026" (number→string)
        - launched/intercepted: true/false → number (boolean→number)
        - tier: "1" → 1 (string→number)

      INVALID ENUM VALUES (value not in schema):
        - pole: "neutral","global","aes","viet","ph","spacex" → map to nearest valid: "western"|"middle_eastern"|"eastern"|"international"
        - direction: "stable","flat","unchanged" → pick "up" or "down" based on the value/change fields
        - status: free text like "Eid ceasefire pause" → "unknown"
        - weaponType: "airstrike" → "mixed", "jets and paramotors" → "mixed", "drone" → "drone_loitering"
        - confidence: "confirmed" → "high", "unconfirmed" → "low"
        - type (media): anything not "image"|"video"|"article" → "article"

      MISSING REQUIRED FIELDS:
        - event missing year → derive from filename date (events/2026-03-25.json → "2026")
        - event missing id → generate kebab-case from title
        - event missing sources → add empty array []
        - source missing tier → default to 4

      STRUCTURAL ISSUES:
        - event file is object instead of array → wrap in array
        - sparkData has fewer than 2 points → pad with duplicated value

      STEP 4 — Write corrected files. Verify valid JSON before writing.

      Do NOT commit. Do NOT modify files not listed in the errors or
      files that already pass validation.
    claude_args: "--max-turns 15 --dangerously-skip-permissions"
```

**Step 5c — Re-validate** (same Zod validation script as step 4):

Runs the identical Zod validation logic. If this passes, proceed to commit.

**Step 5d — Commit** (if re-validation passes):

Same commit logic as the existing step 5.

### Error Passing

The Zod validation step (step 4) must capture its error output to a step output variable so the fix agent can receive the exact errors. Modify the validation script to write errors to `$GITHUB_OUTPUT`:

```bash
echo "errors<<EOF" >> $GITHUB_OUTPUT
# ... validation errors ...
echo "EOF" >> $GITHUB_OUTPUT
```

### Constraints

- **1 retry only** — if the fix agent fails or introduces new errors, the run is recorded as failed in metrics
- **No web search** — the fix agent only reads/writes local files
- **Max 15 turns** — type corrections should be fast
- **Scoped changes** — only touches files listed in the error output

### Metrics Integration

The metrics run file records whether the fix agent was invoked and whether it succeeded:

```json
{
  "validation": {
    "schemaValid": false,
    "fixAgentInvoked": true,
    "fixAgentResult": "success|failure",
    "errorsBeforeFix": 22,
    "errorsAfterFix": 0
  }
}
```

## Component 5: Metrics Page

### Route

Path: `src/pages/metrics.astro`

Uses the existing `BaseLayout.astro` wrapper with site-level navigation for discoverability.

### React Island

Path: `src/components/islands/MetricsDashboard.tsx`

### Behavior

1. Page loads, island fetches `/{base}/_metrics/index.json` (served as static asset from `public/`)
2. Renders run timeline: green/red indicators for pass/fail
3. Click a run: lazy-fetches individual run JSON, shows:
   - Trackers updated
   - Validation errors (tracker, file, field, message)
   - Per-tracker inventory table
4. SVG trend charts: total events over time, error count over time

### Data Access

Metrics JSON lives in `public/_metrics/` which Astro copies directly to `dist/_metrics/` at build time. The React island fetches these at runtime via `fetch()`. Since the nightly workflow commits metrics to `public/_metrics/` and the deploy workflow triggers on push to main, new metrics are available after each run's deploy cycle.

### No New Dependencies

Charts built with SVG, extending the existing sparkline pattern from `src/lib/map-utils.ts`. No charting library added.

## Files

### New
- `scripts/generate-review-manifest.ts` — manifest generator
- `src/pages/metrics.astro` — metrics page
- `src/components/islands/MetricsDashboard.tsx` — metrics dashboard React island

### Modified
- `.github/workflows/update-data.yml` — new steps (manifest gen, metrics collection, metrics commit) + enhanced AI prompt
- `.gitignore` — add `review-manifest.json`
- `src/lib/schemas.ts` — add MetricsRunSchema, MetricsIndexEntrySchema, MetricsValidationErrorSchema

### Generated (committed)
- `public/_metrics/index.json` — metrics index (90-day retention)
- `public/_metrics/runs/*.json` — per-run metric files

### Generated (gitignored)
- `trackers/*/data/review-manifest.json` — temp manifest per tracker

## Verification

1. Run `npm run build` to confirm the metrics page builds and `_metrics/` is in `dist/`
2. Manually dispatch `update-data.yml` and verify:
   - Review manifest is generated correctly for each eligible tracker
   - AI reads the manifest and reviews events in the window
   - Metrics JSON is written and committed even on failure
   - Metrics page loads and displays run history
3. Verify a failed run still produces a metrics entry with error details
4. Verify gap days get backfilled with properly sourced events
5. Verify no duplicate events are created across neighboring days
6. Verify index.json pruning removes entries older than 90 days
7. Verify `public/_metrics/` files are NOT picked up by the Zod validation step
