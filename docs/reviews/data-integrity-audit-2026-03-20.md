# Data Integrity Audit: Future-Date Contamination
**Date**: 2026-03-20
**Reviewer**: Centinela (QA Agent)
**Scope**: All 48 trackers, 784 JSON files — triggered by user-reported December 2026 dates in iran-conflict

---

## Executive Summary

The iran-conflict tracker contains **no future-date contamination** in formal `date` fields or free text. The user report may have referenced content in another tracker. The system-wide scan found **17 future-date references across 8 trackers**, of which **3 are genuinely problematic** (fabricated or misleading) and 14 are legitimate forward references in analytical text. The **world-cup-2026 tracker is the most severe case**: the seed agent populated Era 4 with detailed match descriptions for games that have not yet occurred (June 2026), effectively fabricating sports journalism. The root cause is a systematic gap: neither the Zod schema layer, the update script, nor the seed workflow prompt enforces a "no future events" constraint.

---

## Scan Methodology

Scanned all 784 `.json` files under `trackers/*/data/` and `trackers/*/data/events/` for:
1. ISO date strings (`YYYY-MM-DD`) > 2026-03-20 in any field
2. "Month YYYY" text patterns (e.g., "December 2026") in all string values
3. Event filenames encoding future dates
4. `tracker.json` startDates beyond today

Tool: Python regex scan across all JSON values (not just top-level `date` fields).

---

## Iran-Conflict Deep Scan

**Result: CLEAN**

- No future ISO dates in any field (`date`, `lastUpdated`, `time`, `asOf`, etc.)
- No free-text mentions of future months (April 2026 or later) in any data file
- Event files span 2025-12-01 through 2026-03-20 (today) — correctly bounded
- `startDate` in `tracker.json`: 2026-02-28 (past)

The user-reported December 2026 dates are **not present** in the iran-conflict tracker as of this audit. They may have been in a different tracker, or may have been fixed before this audit ran.

---

## All-Trackers Scan Results

### Category A — PROBLEMATIC (fabricated or misleading future content)

These must be fixed before the next public data update.

**[A-1] world-cup-2026 — fabricated match results**
- File: `world-cup-2026/data/timeline.json`, Era index 4 ("Tournament Opens (June 2026)")
- Items:
  - `opening-match-mexico-south-africa` (year: `Jun 11, 2026`) — full match narrative written as if played
  - `usa-opens-sofi` (year: `Jun 12, 2026`) — full match narrative written as if played
  - `canada-opens-bmo` (year: `Jun 12, 2026`) — full match narrative written as if played
  - `curacao-vs-germany` (year: `Jun 2026`) — full match narrative written as if played
- Impact: **High**. These 4 events are entirely fabricated. No match has been played. The seed agent hallucinated match outcomes and wrote them as fact. If displayed to users, this is disinformation. The Curaçao vs. Germany "historic clash" description is particularly egregious — Curaçao's qualification and the exact group draw may also be fabricated.
- Fix: Delete `Era[4]` from `world-cup-2026/data/timeline.json`. Replace with an era covering the draw, host city announcements, and qualification — all verifiable past events. Add a note that tournament begins June 11, 2026 without fabricating results.

**[A-2] chernobyl-disaster — future anniversary framed as current**
- File: `chernobyl-disaster/data/kpis.json`, item `years-since-disaster`
- Field: `deltaNote`: "As of 26 April 2026 — the 40th anniversary. The NSC is designed to contain..."
- Impact: **Medium**. The phrase "As of 26 April 2026" frames a date 37 days in the future as if it has passed. The KPI value of `40` (years) is also not yet accurate — the explosion was 26 April 1986; today is 20 March 2026, so it has been 39 years, 328 days.
- Fix: Change `deltaNote` to "Approaching 40th anniversary — 26 April 2026" and `value` to `39` (or compute dynamically).

**[A-3] haiti-collapse — future election framed ambiguously**
- File: `haiti-collapse/data/timeline.json`, Era[5], event index 10
- Field: `id=elections-scheduled-august-2026`, `year=Mar 2026`, `title="First Elections in Years Scheduled for August 2026"`
- Detail: "Haiti's Provisional Electoral Council (CEP) confirmed elections for August 30, 2026 (first round) and December 6, 2026 (second round)."
- Impact: **Low-Medium**. The underlying fact (CEP confirmed elections) appears to be a real announcement made in early March 2026. The event year `Mar 2026` is appropriate for the announcement date. However, the phrasing "First Elections in Years" in the title sounds like a completed milestone rather than a scheduled future event. This could mislead users into thinking elections have already occurred. The detail text is factually accurate about the schedule.
- Fix: Rephrase the title to "CEP Confirms First Elections Since 2016, Scheduled August–December 2026" to make clear this is an announcement of a future event, not a completed one.

---

### Category B — BORDERLINE (real future scheduled events)

These are legitimate but should be reviewed for clarity.

**[B-1] artemis-program — KPI shows future mission date**
- File: `artemis-program/data/kpis.json`, item `artemis2-target-date`, `value: "Apr 2026"`
- Context: Artemis II launch target of April 2026 is a real NASA-announced schedule (Dec 2024 announcement). This is a known future target, not fabricated.
- Assessment: Acceptable. This is what the KPI is designed to show. No fix required, but consider adding `contestNote: "Subject to schedule changes"` given NASA's history of delays.

**[B-2] culiacanazo — future court sentencing date**
- File: `culiacanazo/data/claims.json`, `resolution` field: "Sentencing postponed to July 2026"
- Context: Real DOJ court scheduling order for Ovidio Guzmán's sentencing.
- Assessment: Acceptable. Legitimate forward reference in a resolution field.

---

### Category C — LEGITIMATE (appropriate forward references in analytical text)

**7 instances** across artemis-program (claims.json forward quote from NASA OIG), culiacanazo (political.json legal description), global-recession-risk (Powell term expiration), haiti-collapse (events[9] detail referencing scheduled elections), sheinbaum-presidency (DHS wall projected completion), somalia-conflict (WFP funding halt projection), world-cup-2026 (era label in timeline that predates the fabricated matches).

All are appropriate use of forward-looking language in analytical context. No action required.

---

## Root Cause Analysis

### Why did this happen?

**1. The Zod schema has no future-date validation (primary cause)**

`DateFieldSchema` in `src/lib/schemas.ts` (line 77):
```typescript
const DateFieldSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');
```

This validates format only, not value. There is no `z.refine(d => d <= today)` constraint. The schema will accept `2030-01-01` as a valid date.

**2. The seed workflow prompt allows future events (secondary cause)**

`seed-tracker.yml` line 126: "Organize into chronological eras covering the FULL timeline from startDate to present." The phrase "to present" is interpreted loosely. For world-cup-2026, the seed agent interpreted "full timeline" as including the scheduled June 2026 matches and wrote them as completed events.

The seed prompt does say "Only include information you can verify through web search results. Do NOT fabricate data." (line 119), but the AI violated this constraint for the world-cup-2026 tracker — likely because the draw and schedule are publicly available, so it rationalized the match descriptions as "based on real information" even though the matches have not occurred.

**3. The update script has no future-date guard in section updaters (tertiary cause)**

`update-data.ts` line 309: when `date` is missing, it defaults to `today`. But when the AI provides a future date string, `normalizeItems()` (line 300) will parse it and pass it through. There is no clamp: `obj.date = min(parsed.toISOString().split('T')[0], today)`.

**4. The seed workflow's Zod validation step does not catch semantic violations**

`seed-tracker.yml` lines 227-304: the schema validation step runs `safeParse()` using Zod schemas. Since `DateFieldSchema` only validates format (not value), a date of `2026-06-11` passes Zod validation even though it's a future date.

**5. No special guardrails for future-starting trackers**

`world-cup-2026` has `startDate: 2026-06-11`. The seed prompt and update script have no logic that says "if tracker.startDate is in the future, only populate data that is verifiable pre-tournament (draw, qualification, host cities) — do NOT fabricate tournament results."

---

## Specific File Inventory

| Tracker | File | Field | Value | Category | Action |
|---------|------|-------|-------|----------|--------|
| world-cup-2026 | timeline.json | Era[4], 4 events | Jun 11–12, 2026 | A-1 | Delete Era[4] |
| chernobyl-disaster | kpis.json | [7].deltaNote | "As of 26 April 2026" | A-2 | Fix wording + value |
| haiti-collapse | timeline.json | [5].events[10].title | "August 2026" | A-3 | Rephrase title |
| artemis-program | kpis.json | [2].value | Apr 2026 | B-1 | OK (real date) |
| culiacanazo | claims.json | [9].resolution | July 2026 | B-2 | OK (real court date) |
| artemis-program | timeline.json | events[2].title | April 2026 | C | OK |
| artemis-program | claims.json | [7].sideB.text | June 2027 | C | OK |
| culiacanazo | political.json | [0].quote | July 2026 | C | OK |
| global-recession-risk | political.json | [0].role | Jan 2028 | C | OK |
| haiti-collapse | timeline.json | [5].events[9].detail | Aug 2026 | C | OK |
| sheinbaum-presidency | political.json | [19].role | Jan 2028 | C | OK |
| somalia-conflict | kpis.json | [3].contestNote | Apr 2026 | C | OK |
| world-cup-2026 | timeline.json | [4].era | "June 2026" | C | Remove with A-1 |

---

## Iran-Conflict Tracker: Confirmed Clean

- `trackers/iran-conflict/data/events/`: 2025-12-01 through 2026-03-20 — all past dates
- All `date` fields in map-points.json, map-lines.json: past dates confirmed
- All `lastUpdated` fields: past timestamps confirmed
- timeline.json: all era events use display labels (not ISO dates) — no future labels found
- meta.json, kpis.json, claims.json, political.json, casualties.json, econ.json: clean

---

## Recommendations

### Immediate (before next data update)

**R-1: Delete fabricated world-cup-2026 Era[4] match data**
- Delete `timeline.json` Era[4] ("Tournament Opens (June 2026)") and its 4 fabricated match events
- Replace with a "Tournament Preview" era covering draw results (Dec 2025), squad announcements, and stadium readiness — all verifiable past/present facts

**R-2: Fix chernobyl-disaster KPI**
- `deltaNote`: change "As of 26 April 2026" to "Approaching 40th anniversary (April 26, 2026)"
- `value`: change `40` to `39` (not yet the anniversary)

**R-3: Rephrase haiti-collapse election event title**
- From: "First Elections in Years Scheduled for August 2026"
- To: "CEP Confirms First Elections Since 2016, Scheduled August 2026"

### Schema Layer (prevent recurrence)

**R-4: Add future-date validation to DateFieldSchema**
```typescript
// In src/lib/schemas.ts
const DateFieldSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
  .refine(d => d <= new Date().toISOString().split('T')[0], {
    message: 'Date must not be in the future'
  });
```

Note: This would reject world-cup-2026 event dates at Zod validation time, catching the issue in CI.

Caveat: Some trackers (world-cup-2026, artemis-program) legitimately need to reference future scheduled dates. Consider a two-tier approach:
- `DateFieldSchema`: past-only (for `date` and `lastUpdated` fields on events that have occurred)
- `ScheduledDateFieldSchema`: allows future (for `targetDate`, `scheduledFor` fields)

**R-5: Add future-date guard in `normalizeItems()` in update-data.ts**
```typescript
// After parsing date, clamp to today at latest
if (typeof obj.date === 'string') {
  const clamped = Math.min(
    new Date(obj.date).getTime(),
    new Date(today).getTime()
  );
  obj.date = new Date(clamped).toISOString().split('T')[0];
}
```

**R-6: Add "future tracker" awareness to seed prompt**

In `seed-tracker.yml`, add conditional logic before "STEP 3 — RESEARCH AND POPULATE":
```
If tracker.startDate is in the future: DO NOT populate events with dates on or after startDate.
Only include verifiable pre-event data: qualification results, draw outcomes, organizational announcements, venue preparations.
DO NOT fabricate game results, scores, or outcomes for events that have not yet occurred.
```

**R-7: Add future-date check to CI validation step**

In the `Validate Zod schemas` step of `seed-tracker.yml` and `update-data.yml`, add a post-schema check:
```bash
# After Zod validation, check for future event dates
node -e "
  import fs from 'fs';
  const today = new Date().toISOString().split('T')[0];
  let failures = 0;
  // Walk all date fields in map-points, map-lines, events
  // Flag any date > today
"
```

---

## Dead Code Scan

No new dead code found in this audit's scope (data files). Existing open items:
- TD-014: No test framework (open, P3)
- TD-024: Duplicate data in `src/data/` (open, P3)
- TD-025: Workflows still reference `src/data/` (open, P3)

---

## Code Quality Notes (related to root cause)

- `normalizeItems()` in `update-data.ts` (line 300, 53 lines): handles date coercion but has no upper-bound clamp. Refactoring opportunity: add `clampDateToToday()` helper.
- `DateFieldSchema` in `schemas.ts` (line 77): format-only validation. Should be extended with semantic validation.
- Seed prompt (seed-tracker.yml lines 56-186): 130 lines of instruction with no explicit future-date prohibition for events. This is a prompt engineering gap that caused the world-cup-2026 contamination.

---

## Verdict

**CHANGES REQUIRED** for world-cup-2026, chernobyl-disaster, and haiti-collapse (A-1, A-2, A-3).

Iran-conflict is clean. No blocking issues for iran-conflict data integrity.

The prevention recommendations (R-4 through R-7) are architectural improvements that would prevent recurrence across all 48 trackers. R-4 (schema validation) and R-6 (seed prompt future-tracker guardrail) are the highest-leverage fixes.

---

## Handoff to Forja

Review report: `docs/reviews/data-integrity-audit-2026-03-20.md`

**Verdict**: CHANGES REQUIRED (3 data fixes + schema hardening)

Priority order:
1. **[C-1] world-cup-2026**: Delete `timeline.json` Era[4] (4 fabricated match events). This is disinformation — must fix before next public build.
2. **[C-2] chernobyl-disaster**: Fix `kpis.json [7].deltaNote` and `value` field.
3. **[C-3] haiti-collapse**: Rephrase `timeline.json [5].events[10].title`.

Schema hardening (fix together, one PR):
4. Add `z.refine()` future-date guard to `DateFieldSchema` in `schemas.ts`
5. Add date clamping to `normalizeItems()` in `update-data.ts`
6. Add future-tracker section to seed prompt in `seed-tracker.yml`

**Open question**: Should `world-cup-2026` have any Era[4] content at all? Options: (a) replace with "Tournament Preview" era with verifiable pre-match data; (b) remove Era[4] entirely and add it after the tournament starts in June 2026. Recommend option (a) — preserve the era structure but replace fabricated match results with real qualification/draw data.

**Re-verification criteria**:
- Run python future-date scan: zero Category A findings
- Run `npm run build` — build passes with no Zod validation errors
- Confirm `world-cup-2026/data/timeline.json` has no events with dates >= 2026-06-11
