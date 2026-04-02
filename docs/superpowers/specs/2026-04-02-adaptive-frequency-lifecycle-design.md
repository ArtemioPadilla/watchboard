# Adaptive Update Frequency + Tracker Lifecycle Automation

**Date**: 2026-04-02
**Status**: Draft
**Scope**: Two features that form a complete tracker lifecycle management system

---

## Problem

`updateIntervalDays` is static. A tracker like `artemis-2` should update daily during an active mission, then decay to weekly/monthly/quarterly once the mission ends. Currently this requires manual config edits. Additionally, there's no automated way to discover new topics worth tracking or to identify trackers that should be archived.

## Feature 1: Adaptive Update Frequency

### Overview

Replace the static `updateIntervalDays` integer with an `updatePolicy` object that defines an escalation schedule. After each update run, the system counts how many sections had meaningful changes. Consecutive "quiet" runs (no changes) advance through the escalation schedule, increasing the interval. Any run with meaningful changes resets the counter to 0, snapping back to the fastest rate.

### Config Change — `tracker.json`

Replace:
```json
"ai": {
  "updateIntervalDays": 7
}
```

With:
```json
"ai": {
  "updatePolicy": {
    "escalation": [1, 1, 1, 7, 7, 30, 60, 90],
    "quietThreshold": 0
  }
}
```

**Fields:**
- `escalation` — array of intervals (in days) indexed by `consecutiveQuietRuns`. When quiet runs exceed the array length, the last value is used indefinitely. Example: `[1, 1, 1, 7, 7, 30, 60, 90]` means daily for the first 3 quiet runs, then weekly for 2 more, then monthly, bi-monthly, quarterly.
- `quietThreshold` — minimum number of sections with status `"updated"` (excluding `meta`, which always updates `dayCount`) to count a run as "active" (0 means any single non-meta updated section resets the counter). Default: 0.

**Backward compatibility:** Trackers without `updatePolicy` continue using `updateIntervalDays` as-is. The resolve phase checks for `updatePolicy` first, falls back to `updateIntervalDays`, then defaults to 1.

### State Change — `update-log.json`

Add one field:
```json
{
  "lastRun": "2026-04-02T14:00:00Z",
  "tracker": "artemis-2",
  "consecutiveQuietRuns": 0,
  "sections": {
    "kpis": "updated",
    "timeline": "no-change",
    "events": "updated"
  }
}
```

- `consecutiveQuietRuns` — integer, initialized to 0. Incremented by the finalize phase when a run produces no meaningful changes. Reset to 0 when changes exceed `quietThreshold`.

### Schema Change — `src/lib/tracker-config.ts`

Add `UpdatePolicySchema` and make it optional alongside `updateIntervalDays`:

```typescript
const UpdatePolicySchema = z.object({
  escalation: z.array(z.number().int().positive()).min(1),
  quietThreshold: z.number().int().min(0).default(0),
});

// In AiConfigSchema:
updateIntervalDays: z.number().int().positive().default(1),
updatePolicy: UpdatePolicySchema.optional(),
```

Both fields can coexist. `updatePolicy` takes precedence when present.

### Resolve Phase Change — `update-data.yml` (lines 54-86)

Replace the current interval check with:

```bash
# Read updatePolicy if present, otherwise fall back to updateIntervalDays
POLICY=$(node -e "
  const c = JSON.parse(require('fs').readFileSync('$config','utf8'));
  const policy = c.ai?.updatePolicy;
  if (policy) {
    const log = (() => {
      try { return JSON.parse(require('fs').readFileSync('$LOG','utf8')); } catch { return {}; }
    })();
    const quietRuns = log.consecutiveQuietRuns || 0;
    const esc = policy.escalation;
    const idx = Math.min(quietRuns, esc.length - 1);
    console.log(esc[idx]);
  } else {
    console.log(c.ai?.updateIntervalDays ?? 1);
  }
")
INTERVAL=$POLICY
```

The rest of the elapsed-days check remains identical — only the source of `INTERVAL` changes.

### Finalize Phase Change — `update-data.yml` (after artifact application, ~line 331)

After applying tracker artifacts but before commit, add a step that updates `consecutiveQuietRuns` in each tracker's `update-log.json`:

```bash
for dir in /tmp/artifacts/tracker-*; do
  [ ! -d "$dir" ] && continue
  SLUG=${dir##*/tracker-}
  LOG="trackers/$SLUG/data/update-log.json"
  [ ! -f "$LOG" ] && continue

  node -e "
    const fs = require('fs');
    const config = JSON.parse(fs.readFileSync('trackers/$SLUG/tracker.json', 'utf8'));
    const log = JSON.parse(fs.readFileSync('$LOG', 'utf8'));
    const threshold = config.ai?.updatePolicy?.quietThreshold ?? 0;

    // Count sections with 'updated' status (exclude 'meta' — it always updates dayCount)
    const EXCLUDED = new Set(['meta']);
    const updatedCount = Object.entries(log.sections || {}).filter(([key, v]) => {
      if (EXCLUDED.has(key)) return false;
      const status = typeof v === 'string' ? v : v?.status;
      return status === 'updated';
    }).length;

    if (updatedCount > threshold) {
      log.consecutiveQuietRuns = 0;
    } else {
      log.consecutiveQuietRuns = (log.consecutiveQuietRuns || 0) + 1;
    }

    fs.writeFileSync('$LOG', JSON.stringify(log, null, 2) + '\n');
    console.log('$SLUG: updatedCount=' + updatedCount + ', quietRuns=' + log.consecutiveQuietRuns);
  "
done
```

### Preset Escalation Profiles

Trackers can use common profiles. These are just conventions, not enforced:

| Profile | Escalation | Use case |
|---------|-----------|----------|
| **crisis** | `[1, 1, 1, 7, 7, 30, 60, 90]` | Active conflicts, live missions |
| **steady** | `[3, 3, 7, 14, 30, 60]` | Ongoing but slower topics |
| **historical** | `[30, 60, 90, 180]` | Concluded events, archival topics |

### Migration

No migration needed. Existing trackers keep working with `updateIntervalDays`. The `updatePolicy` field is optional. To adopt adaptive frequency for a tracker, add `updatePolicy` to its `tracker.json` and optionally remove `updateIntervalDays` (or keep it as fallback documentation).

Recommended: update all 48 trackers in a single commit, assigning profiles based on current `updateIntervalDays` values:
- `updateIntervalDays: 1-2` → crisis profile
- `updateIntervalDays: 3-7` → steady profile  
- `updateIntervalDays: 14+` → historical profile

---

## Feature 2: Tracker Lifecycle Automation (Scout + Prune)

### Overview

A weekly GitHub Actions workflow with two jobs:
1. **Scout** — AI searches the web for major developing stories, compares against existing tracker coverage, and creates GitHub Issues proposing new trackers.
2. **Prune** — reads all trackers' `consecutiveQuietRuns` (from Feature 1) and creates GitHub Issues proposing archival for dormant trackers.

### Workflow — `.github/workflows/tracker-lifecycle.yml`

```yaml
name: Tracker Lifecycle
on:
  schedule:
    - cron: '0 10 * * 0'  # Sundays 10:00 UTC
  workflow_dispatch:
    inputs:
      mode:
        type: choice
        options: [both, scout, prune]
        default: both
```

### Scout Job

**Execution**: Uses `claude-code-action` with web search capability.

**Inputs to the AI agent:**
1. All existing tracker slugs and their `searchContext` fields (extracted by a setup step)
2. Watchboard's domain categories: conflicts, disasters, space, politics, crises, history, culture
3. Instructions to search for 3-5 major developing stories not already covered

**AI agent outputs** (structured JSON):
```json
[
  {
    "slug": "india-heat-wave-2026",
    "name": "India Heat Wave 2026",
    "topic": "Record-breaking heat wave across northern India",
    "domain": "disaster",
    "region": "south-asia",
    "country": "IN",
    "startDate": "2026-05-15",
    "rationale": "200+ deaths, government emergency, international aid. Multiple Tier 1-2 sources.",
    "sourceDensity": "high",
    "expectedDuration": "weeks",
    "confidence": 0.85,
    "suggestedProfile": "crisis",
    "overlappingTrackers": []
  }
]
```

**Post-processing step** (shell script, not AI):
- For each candidate with `confidence >= 0.6`, create a GitHub Issue via `gh issue create`
- Issue title: `[Scout] Proposed tracker: {slug}`
- Issue body: formatted markdown with all fields from the AI output
- Labels: `scout`, `auto-triage`, `domain:{domain}`
- For candidates with `confidence >= 0.9`, also add label `auto-approve` (optional future automation)

**Scout criteria the AI evaluates:**

| Signal | Description |
|--------|-------------|
| Source density | 5+ Tier 1-2 sources in recent 48h = high |
| Geographic spread | Multi-country coverage |
| Expected duration | Not a one-day story |
| Domain gap | No existing tracker covers it |
| Data richness | KPIs, map points, political actors identifiable |
| Overlap check | Compare `searchContext` keywords against existing trackers |

### Prune Job

**Execution**: Pure shell script — no AI needed.

**Logic:**
```bash
for config in trackers/*/tracker.json; do
  SLUG=$(basename $(dirname "$config"))
  LOG="trackers/$SLUG/data/update-log.json"

  # Read adaptive state
  QUIET_RUNS=$(node -e "
    try {
      const log = JSON.parse(require('fs').readFileSync('$LOG','utf8'));
      console.log(log.consecutiveQuietRuns || 0);
    } catch { console.log(0); }
  ")

  ESC_LENGTH=$(node -e "
    const c = JSON.parse(require('fs').readFileSync('$config','utf8'));
    const esc = c.ai?.updatePolicy?.escalation;
    console.log(esc ? esc.length : 0);
  ")

  # Archival threshold: quiet runs exceeded escalation length + 4 cycles at max interval
  if [ "$ESC_LENGTH" -gt 0 ] && [ "$QUIET_RUNS" -ge $((ESC_LENGTH + 4)) ]; then
    EXISTING=$(gh issue list --search "[Prune] Archive candidate: $SLUG" --state open --json number --jq 'length')
    [ "$EXISTING" -gt 0 ] && continue

    LAST_RUN=$(node -e "try{console.log(JSON.parse(require('fs').readFileSync('$LOG','utf8')).lastRun||'unknown')}catch{console.log('unknown')}")
    NAME=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$config','utf8')).name)")

    gh issue create \
      --title "[Prune] Archive candidate: $SLUG" \
      --body "$(cat <<EOFBODY
## Archive Candidate: $NAME

| Field | Value |
|-------|-------|
| Slug | \`$SLUG\` |
| Consecutive quiet runs | $QUIET_RUNS |
| Escalation length | $ESC_LENGTH |
| Last run | $LAST_RUN |

**Recommendation:** Set \`\"status\": \"archived\"\` in \`tracker.json\`. Dashboard remains accessible (read-only). No further data updates.

To archive, approve this issue and update \`trackers/$SLUG/tracker.json\`.
EOFBODY
)" \
      --label "prune,auto-triage"
  fi
done
```

**Archival thresholds:**
- Trackers with `updatePolicy`: archive when `consecutiveQuietRuns >= escalation.length + 4`
- Trackers without `updatePolicy` (legacy): skip (they're manually managed)
- Never auto-archive — always create an issue for human review

**Issue body includes:**
- Current `consecutiveQuietRuns` count
- Current effective interval
- Date of last meaningful update (computed from `lastRun` minus quiet runs)
- Total data inventory (event count, timeline items, etc.)
- Recommendation: archive (set `status: "archived"`)

### Archival Mechanics

When a tracker is archived (manually, by updating `tracker.json`):
- Set `"status": "archived"` in `tracker.json`
- The resolve phase already skips non-active trackers (`[ "$STATUS" = "draft" ] && continue` — extend to also skip `"archived"`)
- Dashboard pages continue to build and serve (read-only, historical data intact)
- Tracker card on homepage shows an "Archived" badge
- No data updates, no review manifests, no sibling brief inclusion

### Duplicate Prevention

Both scout and prune jobs must avoid creating duplicate issues:
- Before creating an issue, check for existing open issues with the same title via `gh issue list --search`
- Skip if an open issue already exists for that slug

### Rate Limiting

- Scout: max 5 proposed trackers per week (AI instruction)
- Prune: no limit needed (bounded by tracker count, currently 48)

---

## Data Flow Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                    WEEKLY (Sundays 10:00 UTC)                │
│                                                              │
│  Scout Job                        Prune Job                  │
│  ┌─────────────┐                  ┌──────────────┐           │
│  │ AI searches  │                  │ Read all      │          │
│  │ for topics   │                  │ update-logs   │          │
│  │ not covered  │                  │ check quiet   │          │
│  └──────┬──────┘                  │ run counts    │          │
│         │                         └──────┬───────┘           │
│         ▼                                ▼                   │
│  GitHub Issues                    GitHub Issues               │
│  [Scout] new tracker              [Prune] archive candidate   │
│  proposals                        proposals                   │
└──────────────────────────────────────────────────────────────┘
         │                                │
         ▼ (human approves)               ▼ (human approves)
┌─────────────────┐              ┌─────────────────┐
│ init-tracker.yml │              │ Set status:      │
│ (creates tracker │              │ "archived" in    │
│  + seeds data)   │              │ tracker.json     │
└────────┬────────┘              └─────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────┐
│                    DAILY (14:00 UTC)                          │
│                                                              │
│  Resolve Phase                                               │
│  ┌──────────────────────────────────────┐                    │
│  │ For each tracker:                     │                   │
│  │ 1. Skip if status != "active"         │                   │
│  │ 2. Read updatePolicy.escalation       │                   │
│  │ 3. Read consecutiveQuietRuns          │                   │
│  │ 4. Compute effectiveInterval          │                   │
│  │ 5. Compare vs daysSinceLastRun        │                   │
│  └──────────────┬───────────────────────┘                    │
│                 ▼                                            │
│  Update Phase (matrix, 1 job per eligible tracker)           │
│                 │                                            │
│                 ▼                                            │
│  Finalize Phase                                              │
│  ┌──────────────────────────────────────┐                    │
│  │ For each updated tracker:             │                   │
│  │ 1. Count sections with "updated"      │                   │
│  │ 2. If > quietThreshold: reset to 0    │                   │
│  │ 3. If <= quietThreshold: increment    │                   │
│  │ 4. Write consecutiveQuietRuns to log  │                   │
│  └──────────────────────────────────────┘                    │
└──────────────────────────────────────────────────────────────┘
```

---

## Files to Create or Modify

| File | Action | Description |
|------|--------|-------------|
| `src/lib/tracker-config.ts` | Modify | Add `UpdatePolicySchema`, add to `AiConfigSchema` |
| `.github/workflows/update-data.yml` | Modify | Update resolve phase interval logic, add quiet-run tracking to finalize |
| `.github/workflows/tracker-lifecycle.yml` | Create | Weekly scout + prune workflow |
| `trackers/*/tracker.json` | Modify | Migrate to `updatePolicy` (batch, all 48 trackers) |

---

## Out of Scope

- Auto-approve for scout (future enhancement — add `/approve` comment trigger)
- Auto-archive for prune (always human-reviewed)
- UI for managing update policies (edit `tracker.json` directly)
- Changing the nightly cron schedule (stays at 14:00 UTC daily)
- Modifying the update phase AI prompts (they remain unchanged)
