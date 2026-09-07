# Technical Debt Register

Last updated: 2026-03-09 by Forja (Dev Agent) — resolved TD-006, TD-007, TD-008, TD-010, TD-023

## Format

| ID | Severity | Title | File(s) | Impact | Effort | Status |
|---|---|---|---|---|---|---|

---

## Active Items

| ID | Severity | Title | File(s) | Impact | Effort | Status |
|---|---|---|---|---|---|---|
| TD-001 | P2 (Medium) | `tierClass` / `tierLabel` duplicated in 4 / 3 files | `TimelineSection.tsx`, `MilitaryTabs.tsx`, `map-helpers.ts`, `tier-utils.ts` | Logic drift on tier label changes | Low | Resolved |
| TD-002 | P2 (Medium) | `constants.ts` never imported — orphaned module | `src/lib/constants.ts` | Silent drift of NAV_SECTIONS and MIL_TABS | Low | Resolved |
| TD-003 | P2 (Medium) | `generateSparkline` division by zero with 1-element array | `src/lib/map-utils.ts:8` | Invisible sparkline SVG if AI returns single data point | Low | Resolved |
| TD-004 | P2 (Medium) | Deploy fires even on failed nightly update | `.github/workflows/deploy.yml:7–9` | Unnecessary build triggered; could expose partial data | Low | Resolved |
| TD-005 | P2 (Medium) | `set:html` on AI-generated `heroHeadline` — XSS risk | `src/components/static/Hero.astro:30` | Build-time XSS injection via compromised AI response | Medium | Resolved |
| TD-006 | P3 (Low) | `dotColor` field unused in `MapCategory` interface | `src/lib/map-utils.ts:20–27` | Dead data confuses contributors | Low | Resolved |
| TD-007 | P3 (Low) | `ACTIVE_IDS` hard-coded in LeafletMap — breaks if point IDs change | `src/components/islands/LeafletMap.tsx:38` | Silent regression when `map-points.json` IDs change | Low | Resolved |
| TD-008 | P3 (Low) | Hormuz blockade hard-coded — not updatable by AI script | `src/components/islands/LeafletMap.tsx:40–43` | Map feature can't be deactivated without code change | Medium | Resolved |
| TD-009 | P3 (Low) | MilitaryTabs date range label is hard-coded | `src/components/islands/MilitaryTabs.tsx:57` | Date shows "Feb 28 – Mar 2" forever regardless of data updates | Low | Resolved |
| TD-010 | P3 (Low) | `attributionControl={false}` violates Carto ToS | `src/components/islands/LeafletMap.tsx:56` | Legal/ToS compliance risk | Low | Resolved |
| TD-011 | P3 (Low) | `.env` not in `.gitignore` | `.gitignore` | Risk of accidental credential commit | Low | Resolved |
| TD-012 | P3 (Low) | `EconItemSchema.sparkData` has no `min(2)` constraint | `src/lib/schemas.ts:144` | Invalid sparkline data passes Zod but breaks SVG rendering | Low | Resolved |
| TD-013 | P3 (Low) | `writeFileSync` in update script is non-atomic | `scripts/update-data.ts:67` | Partial write on crash leaves corrupt JSON | Medium | Resolved |
| TD-014 | P3 (Low) | No test framework or test coverage | Entire codebase | Regressions undetected; blocks release readiness | High | Open |
| TD-024 | P3 (Low) | Duplicate data in `src/data/` and `trackers/iran-conflict/data/` | `src/data/`, `trackers/iran-conflict/data/` | Two copies of same data; update script still writes to `src/data/`; delete `src/data/` after update script migration completes | Low | Open — the sibling duplication of overlay arrays (NFZ / GPS jamming / blackouts) between `CesiumGlobe/*.ts` and `MapOverlayData.ts` was resolved 2026-09-07 into `src/data/snapshots/` (plan E2.H5); the `src/data/` vs `trackers/iran-conflict/data/` copy remains |
| TD-025 | P3 (Low) | GitHub Actions workflows still reference `src/data/` paths | `.github/workflows/update-data.yml`, `.github/workflows/backfill.yml` | Workflows will need path updates when `src/data/` is removed | Low | Open |
| TD-015 | P3 (Low) | No CHANGELOG.md | Root | Release tracking impossible | Low | Resolved |

| TD-017 | P2 (Medium) | `dayToDate()` uses local timezone but `dateToDay()` uses UTC — off-by-one on UTC± boundaries | `CesiumTimelineBar.tsx:45–49` | Users in UTC+N timezones get wrong date on slider scrub near midnight | Low | Resolved |
| TD-018 | P2 (Medium) | `activeCount` return from `useMissiles` is dead — hook returns a value never consumed | `useMissiles.ts:208`, `CesiumGlobe.tsx:296` | Silent API contract violation; count is always stale | Low | Resolved |
| TD-019 | P2 (Medium) | `null as any` type coercion in `MissileAnimation` init — type safety gap | `useMissiles.ts:115–116` | If exception between init and assign, null entity enters animationsRef | Low | Resolved |
| TD-020 | P3 (Low) | `creditDiv` and `Camera.DEFAULT_VIEW_RECTANGLE` set at module scope — breaks SSR and multi-viewer | `CesiumGlobe.tsx:44,54` | Would throw in SSR context; affects all Cesium viewers globally | Low | Resolved |
| TD-021 | P3 (Low) | Prev/next navigation buttons give no feedback at timeline boundaries | `CesiumTimelineBar.tsx:129–148` | Silent no-op confuses users at first/last event date | Low | Resolved |
| TD-022 | P3 (Low) | Magic number `43_200_000` (noon offset) duplicated in CesiumGlobe | `CesiumGlobe.tsx:112,187` | DRY violation; easy to update one but miss the other | Low | Resolved |
| TD-023 | P3 (Low) | Arc geometry duplicated between LeafletMap and MapArcAnimator | `LeafletMap.tsx:32-53`, `MapArcAnimator.tsx:37-48` | Same sine-curve arc logic in two places; extract to shared util | Low | Resolved |

---

## Resolved Items

| ID | Severity | Title | File(s) | Resolution | Date |
|---|---|---|---|---|---|
| TD-016 | P1 (High) | Re-render storm at max playback speed (86400x) | `CesiumGlobe.tsx:113,148-154` | Throttled `setCurrentDate` to max 5Hz (200ms) via `lastDateUpdateRef` | 2026-03-07 |
| TD-017 | P2 (Medium) | `dateToDay()` local TZ vs `dayToDate()` UTC | `CesiumTimelineBar.tsx` | Normalized `dateToDay` to use `'T00:00:00Z'` suffix; `formatDate` now uses UTC with `timeZone: 'UTC'` | 2026-03-09 |
| TD-018 | P2 (Medium) | `activeCount` from `useMissiles` never consumed | `useMissiles.ts`, `CesiumGlobe.tsx` | Already resolved in prior session — hook returns `void`, no `activeCount` exists | 2026-03-09 |
| TD-019 | P2 (Medium) | `null as any` in MissileAnimation init | `useMissiles.ts` | Already resolved in prior session — fields typed as `Entity \| null`, initialized as `null` | 2026-03-09 |
| TD-020 | P3 (Low) | Module-scope Cesium globals | `CesiumGlobe.tsx` | Already resolved — `creditDiv` behind `typeof document` guard, `Camera.DEFAULT_VIEW_RECTANGLE` in callback | 2026-03-09 |
| TD-021 | P3 (Low) | No feedback at timeline boundaries | `CesiumTimelineBar.tsx` | Already resolved — `disabled` attribute on prev/next buttons, CSS `:disabled` rule at 0.25 opacity | 2026-03-09 |
| TD-022 | P3 (Low) | Magic number `43_200_000` duplicated | `CesiumGlobe.tsx` | Extracted `NOON_OFFSET_MS` constant, replaced both occurrences | 2026-03-09 |
| TD-003 | P2 (Medium) | `generateSparkline` division by zero with 1-element array | `src/lib/map-utils.ts` | Early return for arrays with fewer than 2 elements — returns flat line at midpoint | 2026-03-09 |
| TD-005 | P2 (Medium) | `set:html` on AI-generated `heroHeadline` — XSS risk | `src/components/static/Hero.astro` | Replaced `set:html` with safe text interpolation `{meta.heroHeadline}` | 2026-03-09 |
| TD-011 | P3 (Low) | `.env` not in `.gitignore` | `.gitignore` | Added `.env`, `.env.local`, `.env.*.local` entries | 2026-03-09 |
| TD-012 | P3 (Low) | `EconItemSchema.sparkData` has no `min(2)` constraint | `src/lib/schemas.ts` | Added `.min(2)` to sparkData array schema | 2026-03-09 |
| TD-004 | P2 (Medium) | Deploy fires even on failed nightly update | `.github/workflows/deploy.yml`, `update-data.yml` | Added JSON validation step in update-data.yml; deploy.yml now checks `workflow_run.conclusion == 'success'` | 2026-03-09 |
| TD-013 | P3 (Low) | `writeFileSync` in update script is non-atomic | `scripts/update-data.ts` | Introduced `atomicWriteFile()` helper (write-to-temp-then-rename); all JSON writes use it | 2026-03-09 |
| TD-001 | P2 (Medium) | `tierClass`/`tierLabel` duplicated in 4/3 files | `tier-utils.ts` (canonical), 4 consumer files | Consolidated all tier helpers into `tier-utils.ts`; consumers import or re-export from there. Added `tierLabelFull` and `tierLabelShort` variants. | 2026-03-09 |
| TD-002 | P2 (Medium) | `constants.ts` never imported — orphaned module | `Header.astro`, `MilitaryTabs.tsx` | `Header.astro` now imports `NAV_SECTIONS` from `constants.ts`; `MilitaryTabs.tsx` now imports `MIL_TABS` from `constants.ts`. Inline redefinitions removed. | 2026-03-09 |
| TD-009 | P3 (Low) | MilitaryTabs date range label hard-coded | `MilitaryTabs.tsx` | Replaced hard-coded "Feb 28 -- Mar 4" with `computeDateRange()` that parses `time` fields from strike/retaliation data to derive min/max dates dynamically | 2026-03-09 |
| TD-006 | P3 (Low) | `dotColor` field unused in `MapCategory` | `src/lib/map-utils.ts` | Removed `dotColor` from `MapCategory` interface and all 4 `MAP_CATEGORIES` entries | 2026-03-09 |
| TD-007 | P3 (Low) | Hard-coded `majorLabels` in LeafletMap | `LeafletMap.tsx`, `schemas.ts`, `map-points.json` | Added `showLabel` optional boolean to `MapPointSchema`; set `showLabel: true` on 10 key points in data; `showPermanentLabel()` now checks `pt.base` or `pt.showLabel` | 2026-03-09 |
| TD-008 | P3 (Low) | Hormuz blockade radius hard-coded | `LeafletMap.tsx`, `schemas.ts`, `map-points.json`, `cesium-helpers.ts`, `useConflictData.ts` | Added `zoneRadius` optional number to `MapPointSchema`; hormuz point has `zoneRadius: 60000` in data; both 2D and 3D components use `pt.zoneRadius ?? 40000` | 2026-03-09 |
| TD-010 | P3 (Low) | `attributionControl={false}` violates Carto ToS | `LeafletMap.tsx` | Already resolved in prior refactor — prop no longer present; attribution renders via TileLayer with dark-theme CSS | 2026-03-09 |
| TD-023 | P3 (Low) | Arc geometry duplicated | `LeafletMap.tsx`, `MapArcAnimator.tsx`, `map-helpers.ts` | Extracted `computeArcPositions()` and `interpolateArcPosition()` to `map-helpers.ts`; both components import shared functions | 2026-03-09 |
