# Adaptive Update Frequency + Tracker Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace static `updateIntervalDays` with adaptive escalation-based frequency, and add weekly scout/prune automation via GitHub Issues.

**Architecture:** Feature 1 adds `updatePolicy` to tracker config schema, modifies the resolve phase to compute effective intervals from `consecutiveQuietRuns`, and tracks quiet runs in the finalize phase. Feature 2 adds a weekly GitHub Actions workflow with an AI-powered scout job and a shell-script prune job.

**Tech Stack:** Zod (schema), GitHub Actions YAML, Node.js inline scripts, `gh` CLI, `claude-code-action`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/tracker-config.ts` | Modify | Add `UpdatePolicySchema` to `AiConfigSchema` |
| `scripts/migrate-update-policy.ts` | Create | One-shot migration script for all tracker.json files |
| `.github/workflows/update-data.yml` | Modify | Adaptive resolve logic + quiet-run tracking in finalize |
| `.github/workflows/tracker-lifecycle.yml` | Create | Weekly scout + prune workflow |
| `trackers/*/tracker.json` | Modify (via script) | Add `updatePolicy`, keep `updateIntervalDays` as fallback |

---

### Task 1: Add UpdatePolicySchema to tracker config

**Files:**
- Modify: `src/lib/tracker-config.ts:58-71`

- [ ] **Step 1: Add UpdatePolicySchema before AiConfigSchema**

In `src/lib/tracker-config.ts`, insert after line 56 (after `GlobeConfigSchema`):

```typescript
// ── Adaptive update policy ──
const UpdatePolicySchema = z.object({
  escalation: z.array(z.number().int().positive()).min(1),
  quietThreshold: z.number().int().min(0).default(0),
});
```

- [ ] **Step 2: Add updatePolicy field to AiConfigSchema**

In the `AiConfigSchema` object (line 59-71), add after the `updateIntervalDays` line (line 69):

```typescript
  updateIntervalDays: z.number().int().positive().default(1),
  updatePolicy: UpdatePolicySchema.optional(),
```

- [ ] **Step 3: Export the UpdatePolicy type**

After the existing type exports at the bottom of the file (line 166), add:

```typescript
export type UpdatePolicy = z.infer<typeof UpdatePolicySchema>;
```

- [ ] **Step 4: Run build to verify schema compiles**

Run: `npm run build`
Expected: Build succeeds with no TypeScript errors. All 48 trackers validate (they don't have `updatePolicy` yet, which is fine since it's optional).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tracker-config.ts
git commit -m "feat(schema): add UpdatePolicySchema for adaptive update frequency"
```

---

### Task 2: Write migration script for tracker configs

**Files:**
- Create: `scripts/migrate-update-policy.ts`

- [ ] **Step 1: Create the migration script**

Create `scripts/migrate-update-policy.ts`:

```typescript
import fs from 'fs';
import path from 'path';

const PROFILES: Record<string, number[]> = {
  crisis:     [1, 1, 1, 7, 7, 30, 60, 90],
  steady:     [3, 3, 7, 14, 30, 60],
  historical: [30, 60, 90, 180],
};

const trackersDir = 'trackers';
let migrated = 0;
let skipped = 0;

for (const slug of fs.readdirSync(trackersDir)) {
  const configPath = path.join(trackersDir, slug, 'tracker.json');
  if (!fs.existsSync(configPath)) continue;

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (!config.ai) {
    console.log(`SKIP ${slug}: no ai config`);
    skipped++;
    continue;
  }

  if (config.ai.updatePolicy) {
    console.log(`SKIP ${slug}: already has updatePolicy`);
    skipped++;
    continue;
  }

  const interval = config.ai.updateIntervalDays ?? 1;
  let profile: string;
  if (interval <= 2) {
    profile = 'crisis';
  } else if (interval <= 7) {
    profile = 'steady';
  } else {
    profile = 'historical';
  }

  config.ai.updatePolicy = {
    escalation: PROFILES[profile],
    quietThreshold: 0,
  };

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
  console.log(`MIGRATED ${slug}: interval=${interval} → profile=${profile}`);
  migrated++;
}

console.log(`\nDone: ${migrated} migrated, ${skipped} skipped`);
```

- [ ] **Step 2: Run the migration in dry-run mode (manual review)**

Run: `npx tsx scripts/migrate-update-policy.ts`
Expected: Output listing each tracker with its assigned profile. Verify:
- `iran-conflict` (interval=1) → crisis
- `artemis-2` (interval=7) → steady
- `chernobyl-disaster` (interval=30) → historical

- [ ] **Step 3: Verify a few migrated tracker.json files**

Run: `node -e "const c=JSON.parse(require('fs').readFileSync('trackers/iran-conflict/tracker.json','utf8')); console.log(JSON.stringify(c.ai.updatePolicy, null, 2))"`
Expected: `{"escalation": [1, 1, 1, 7, 7, 30, 60, 90], "quietThreshold": 0}`

Run: `node -e "const c=JSON.parse(require('fs').readFileSync('trackers/chernobyl-disaster/tracker.json','utf8')); console.log(JSON.stringify(c.ai.updatePolicy, null, 2))"`
Expected: `{"escalation": [30, 60, 90, 180], "quietThreshold": 0}`

- [ ] **Step 4: Run build to validate all configs**

Run: `npm run build`
Expected: Build succeeds. All tracker configs pass Zod validation with the new optional field.

- [ ] **Step 5: Commit**

```bash
git add scripts/migrate-update-policy.ts trackers/
git commit -m "feat(config): migrate all trackers to adaptive updatePolicy"
```

---

### Task 3: Update resolve phase for adaptive intervals

**Files:**
- Modify: `.github/workflows/update-data.yml:62-65`

- [ ] **Step 1: Replace the static INTERVAL lookup with adaptive logic**

In `.github/workflows/update-data.yml`, replace lines 62-65:

```bash
            INTERVAL=$(node -e "
              const c = JSON.parse(require('fs').readFileSync('$config','utf8'));
              console.log(c.ai?.updateIntervalDays ?? 1);
            ")
```

With:

```bash
            INTERVAL=$(node -e "
              const c = JSON.parse(require('fs').readFileSync('$config','utf8'));
              const policy = c.ai?.updatePolicy;
              if (policy) {
                let quietRuns = 0;
                try {
                  const log = JSON.parse(require('fs').readFileSync('$LOG','utf8'));
                  quietRuns = log.consecutiveQuietRuns || 0;
                } catch {}
                const esc = policy.escalation;
                const idx = Math.min(quietRuns, esc.length - 1);
                console.log(esc[idx]);
              } else {
                console.log(c.ai?.updateIntervalDays ?? 1);
              }
            ")
```

- [ ] **Step 2: Also skip archived trackers**

In `.github/workflows/update-data.yml`, find line 67:

```bash
            [ "$STATUS" = "draft" ] && continue
```

Replace with:

```bash
            [ "$STATUS" != "active" ] && continue
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/update-data.yml
git commit -m "feat(pipeline): adaptive interval resolution from updatePolicy"
```

---

### Task 4: Add quiet-run tracking to finalize phase

**Files:**
- Modify: `.github/workflows/update-data.yml` (finalize job, after "Apply tracker changes" step)

- [ ] **Step 1: Add a new step after "Apply tracker changes" (after line 331)**

Insert a new step between "Apply tracker changes" and "Check for changes" in the finalize job:

```yaml
      - name: Update adaptive frequency state
        if: needs.resolve.outputs.has_trackers == 'true'
        run: |
          for dir in /tmp/artifacts/tracker-*; do
            [ ! -d "$dir" ] && continue
            SLUG=${dir##*/tracker-}
            LOG="trackers/$SLUG/data/update-log.json"
            CONFIG="trackers/$SLUG/tracker.json"
            [ ! -f "$LOG" ] || [ ! -f "$CONFIG" ] && continue

            node -e "
              const fs = require('fs');
              const config = JSON.parse(fs.readFileSync('$CONFIG', 'utf8'));
              const log = JSON.parse(fs.readFileSync('$LOG', 'utf8'));
              const threshold = config.ai?.updatePolicy?.quietThreshold ?? 0;

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
              const esc = config.ai?.updatePolicy?.escalation;
              const idx = esc ? Math.min(log.consecutiveQuietRuns, esc.length - 1) : -1;
              const nextInterval = esc ? esc[idx] : (config.ai?.updateIntervalDays ?? 1);
              console.log(
                '$SLUG: updatedSections=' + updatedCount +
                ', quietRuns=' + log.consecutiveQuietRuns +
                ', nextInterval=' + nextInterval + 'd'
              );
            "
          done
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/update-data.yml
git commit -m "feat(pipeline): track consecutiveQuietRuns in finalize phase"
```

---

### Task 5: Create tracker-lifecycle workflow

**Files:**
- Create: `.github/workflows/tracker-lifecycle.yml`

- [ ] **Step 1: Create the workflow file**

Create `.github/workflows/tracker-lifecycle.yml`:

```yaml
name: Tracker Lifecycle (Scout + Prune)

on:
  schedule:
    - cron: '0 10 * * 0'  # Sundays 10:00 UTC
  workflow_dispatch:
    inputs:
      mode:
        description: 'Which jobs to run'
        type: choice
        options:
          - both
          - scout
          - prune
        default: both

permissions:
  contents: read
  issues: write

jobs:
  # ── Scout: discover new tracker candidates ──
  scout:
    if: inputs.mode != 'prune'
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Extract existing tracker coverage
        id: coverage
        run: |
          COVERAGE=$(node -e "
            const fs = require('fs');
            const trackers = [];
            for (const slug of fs.readdirSync('trackers')) {
              const configPath = 'trackers/' + slug + '/tracker.json';
              if (!fs.existsSync(configPath)) continue;
              const c = JSON.parse(fs.readFileSync(configPath, 'utf8'));
              trackers.push({
                slug: c.slug,
                name: c.name,
                domain: c.domain || 'unknown',
                searchContext: c.ai?.searchContext || '',
                status: c.status,
              });
            }
            console.log(JSON.stringify(trackers));
          ")
          echo "coverage=$COVERAGE" >> $GITHUB_OUTPUT

      - name: Scout for new tracker candidates
        id: scout
        uses: anthropics/claude-code-action@main
        with:
          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          allowed_tools: "WebSearch"
          timeout_minutes: 10
          prompt: |
            You are a news intelligence analyst for Watchboard, a multi-topic intelligence dashboard.

            EXISTING TRACKER COVERAGE (do NOT propose topics already covered):
            ${{ steps.coverage.outputs.coverage }}

            WATCHBOARD DOMAINS: conflict, security, governance, disaster, human-rights, science, space, economy, culture, history

            TASK: Search the web for 3-5 major developing stories that are NOT already covered by existing trackers. Focus on stories with:
            - High source density (5+ Tier 1-2 sources in recent 48h)
            - Expected duration of at least 1 week
            - Clear geographic scope
            - Identifiable KPIs, political actors, map-plottable locations

            Output ONLY a JSON array (no markdown, no explanation) with this structure per candidate:
            [
              {
                "slug": "kebab-case-slug",
                "name": "Human Readable Name",
                "topic": "One-sentence description",
                "domain": "one of the domains above",
                "region": "north-america|central-america|south-america|europe|middle-east|africa|central-asia|south-asia|east-asia|southeast-asia|oceania|global",
                "country": "ISO 2-letter code",
                "startDate": "YYYY-MM-DD",
                "rationale": "Why this merits tracking — source density, impact, duration",
                "confidence": 0.0-1.0,
                "suggestedProfile": "crisis|steady|historical",
                "overlappingTrackers": ["slug-of-any-partial-overlap"]
              }
            ]

            Max 5 candidates. Only include candidates with confidence >= 0.6.

      - name: Create GitHub Issues for candidates
        if: steps.scout.outputs.result != ''
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          echo '${{ steps.scout.outputs.result }}' | node -e "
            const readline = require('readline');
            let input = '';
            process.stdin.on('data', d => input += d);
            process.stdin.on('end', async () => {
              // Extract JSON array from output (may have surrounding text)
              const match = input.match(/\[[\s\S]*\]/);
              if (!match) { console.log('No JSON array found in scout output'); process.exit(0); }
              let candidates;
              try { candidates = JSON.parse(match[0]); } catch(e) { console.error('Failed to parse:', e); process.exit(0); }

              const { execSync } = require('child_process');
              for (const c of candidates) {
                if (c.confidence < 0.6) continue;

                // Check for existing open issue
                try {
                  const existing = execSync(
                    'gh issue list --search \"[Scout] Proposed tracker: ' + c.slug + '\" --state open --json number --jq length',
                    { encoding: 'utf8' }
                  ).trim();
                  if (parseInt(existing) > 0) {
                    console.log('Skipping ' + c.slug + ': open issue already exists');
                    continue;
                  }
                } catch {}

                const labels = ['scout', 'auto-triage', 'domain:' + c.domain];
                if (c.confidence >= 0.9) labels.push('auto-approve');

                const body = [
                  '## Proposed Tracker: ' + c.name,
                  '',
                  '| Field | Value |',
                  '|-------|-------|',
                  '| Slug | \`' + c.slug + '\` |',
                  '| Domain | ' + c.domain + ' |',
                  '| Region | ' + (c.region || 'unknown') + ' |',
                  '| Country | ' + (c.country || 'unknown') + ' |',
                  '| Start Date | ' + c.startDate + ' |',
                  '| Confidence | ' + c.confidence + ' |',
                  '| Suggested Profile | ' + c.suggestedProfile + ' |',
                  '| Overlapping Trackers | ' + (c.overlappingTrackers?.join(', ') || 'none') + ' |',
                  '',
                  '### Topic',
                  c.topic,
                  '',
                  '### Rationale',
                  c.rationale,
                  '',
                  '---',
                  'To create this tracker, dispatch \`init-tracker.yml\` with slug \`' + c.slug + '\`.',
                ].join('\n');

                try {
                  execSync(
                    'gh issue create' +
                    ' --title \"[Scout] Proposed tracker: ' + c.slug + '\"' +
                    ' --label \"' + labels.join(',') + '\"' +
                    ' --body \"' + body.replace(/"/g, '\\\\"').replace(/\n/g, '\\n') + '\"',
                    { stdio: 'inherit' }
                  );
                  console.log('Created issue for: ' + c.slug);
                } catch(e) {
                  console.error('Failed to create issue for ' + c.slug + ':', e.message);
                }
              }
            });
          "

  # ── Prune: detect dormant trackers ──
  prune:
    if: inputs.mode != 'scout'
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Detect archive candidates
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          CANDIDATES=0
          for config in trackers/*/tracker.json; do
            DIR=$(dirname "$config")
            SLUG=$(basename "$DIR")
            LOG="$DIR/data/update-log.json"

            # Only check active trackers with updatePolicy
            STATUS=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$config','utf8')).status)")
            [ "$STATUS" != "active" ] && continue

            ESC_LENGTH=$(node -e "
              const c = JSON.parse(require('fs').readFileSync('$config','utf8'));
              const esc = c.ai?.updatePolicy?.escalation;
              console.log(esc ? esc.length : 0);
            ")
            [ "$ESC_LENGTH" -eq 0 ] && continue

            QUIET_RUNS=$(node -e "
              try {
                const log = JSON.parse(require('fs').readFileSync('$LOG','utf8'));
                console.log(log.consecutiveQuietRuns || 0);
              } catch { console.log(0); }
            ")

            THRESHOLD=$((ESC_LENGTH + 4))
            if [ "$QUIET_RUNS" -ge "$THRESHOLD" ]; then
              # Check for existing open issue
              EXISTING=$(gh issue list --search "[Prune] Archive candidate: $SLUG" --state open --json number --jq 'length' 2>/dev/null || echo 0)
              [ "$EXISTING" -gt 0 ] && { echo "Skipping $SLUG: open issue exists"; continue; }

              LAST_RUN=$(node -e "try{console.log(JSON.parse(require('fs').readFileSync('$LOG','utf8')).lastRun||'unknown')}catch{console.log('unknown')}")
              NAME=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$config','utf8')).name)")

              gh issue create \
                --title "[Prune] Archive candidate: $SLUG" \
                --label "prune,auto-triage" \
                --body "$(cat <<EOFBODY
          ## Archive Candidate: $NAME

          | Field | Value |
          |-------|-------|
          | Slug | \`$SLUG\` |
          | Consecutive quiet runs | $QUIET_RUNS |
          | Escalation length | $ESC_LENGTH |
          | Threshold | $THRESHOLD |
          | Last run | $LAST_RUN |

          **Recommendation:** Set \`\"status\": \"archived\"\` in \`tracker.json\`. Dashboard remains accessible (read-only). No further data updates.

          To archive, update \`trackers/$SLUG/tracker.json\` and set \`\"status\": \"archived\"\`.
          EOFBODY
          )"

              echo "Created archive issue for: $SLUG"
              CANDIDATES=$((CANDIDATES + 1))
            else
              echo "OK $SLUG: quietRuns=$QUIET_RUNS, threshold=$THRESHOLD"
            fi
          done

          echo "Prune complete: $CANDIDATES archive candidates found"
```

- [ ] **Step 2: Validate the workflow YAML syntax**

Run: `node -e "require('fs').readFileSync('.github/workflows/tracker-lifecycle.yml', 'utf8'); console.log('YAML file is valid UTF-8')"`

Also verify no tabs (YAML requires spaces):
Run: `grep -P '\t' .github/workflows/tracker-lifecycle.yml && echo 'TABS FOUND' || echo 'No tabs - OK'`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/tracker-lifecycle.yml
git commit -m "feat(lifecycle): add weekly scout + prune workflow"
```

---

### Task 6: Final build validation and cleanup

**Files:**
- Modify: `scripts/migrate-update-policy.ts` (delete after use)

- [ ] **Step 1: Run full build**

Run: `npm run build`
Expected: Build succeeds. All tracker pages generated. No schema validation errors.

- [ ] **Step 2: Spot-check adaptive state in a few update-log.json files**

Verify that existing update-log.json files don't have `consecutiveQuietRuns` yet (expected — it gets added by the finalize phase on next nightly run):

Run: `node -e "const l=JSON.parse(require('fs').readFileSync('trackers/iran-conflict/data/update-log.json','utf8')); console.log('consecutiveQuietRuns:', l.consecutiveQuietRuns ?? 'not set (expected)')"`
Expected: `consecutiveQuietRuns: not set (expected)`

- [ ] **Step 3: Delete the migration script (one-shot, no longer needed)**

Run: `rm scripts/migrate-update-policy.ts`

- [ ] **Step 4: Commit cleanup**

```bash
git add -A
git commit -m "chore: remove one-shot migration script"
```
