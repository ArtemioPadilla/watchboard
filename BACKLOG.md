# Feature Backlog

Last updated: 2026-04-26

Reviewed by: Prometeo (PM), Forja (Dev), Centinela (QA) — second-pass consensus applied

---

## P0 — Critical / Foundation

| ID | Title | Description | Effort | Notes |
|---|---|---|---|---|
| BL-009 | Commit unstaged hardening changes | Schema hardening, cross-field validation, midnight-offset fix sitting uncommitted — nightly update runs against pre-hardening code | XS | QA: immediate action needed. Verified existing data passes new validation |
| BL-010 | Zod validation in CI workflow | Nightly update workflow only runs `JSON.parse()`, not Zod schema checks — schema-valid-but-corrupt data can break the build. Add Zod validation inside the update script itself (before writing to disk), not just at build time | S | QA: prevents silent deploy failures |
| BL-011 | Build failure alerting | No notification when nightly update or deploy fails — site silently serves stale data indefinitely | S | QA + PM: operational reliability gap |
| BL-012 | Data freshness indicator | Visible per-section "last updated" timestamps — spec already written and approved | S | PM: spec exists, never shipped |
| BL-013 | Mobile responsive nav | Header overflows on mobile; hamburger/collapsible layout — prior assessment graded mobile UX a D | M | PM: blocks large audience segment |

## P1 — High Priority

| ID | Title | Description | Effort | Notes |
|---|---|---|---|---|
| BL-001 | Search & filter across events | Keyword search + filter chips (weapon type, region, date). Requires cross-island state (nanostores). Build search index at build time. **Needs ADR before coding** | H | Dev: biggest arch decision; do after tests. Requires nanostores ADR |
| BL-008 | Accessibility audit | Keyboard nav on maps, ARIA attributes, screen reader support. WCAG 2.1 AA target. **Risk: scope may expand to H if SVG map + CesiumJS screen reader support is included — spec should define which components get full a11y vs text alternatives** | M-H | PM: upgraded from P2 — legal/ethical for public product. Dev: scope risk flagged |
| BL-014 | OG meta tags / social sharing | Twitter/X card previews, Open Graph meta — highest effort-to-impact ratio for organic reach | S | PM: only growth vector for open-source project |
| BL-015 | "What changed today" view | Diff/changelog view for returning users showing what updated since last visit. Uses daily event partitions + localStorage last-visit timestamp — does NOT require nanostores | M | PM: primary retention driver for live tracker. Moved from Phase 4 to Phase 2 |
| BL-016 | Globe discoverability | "View 3D Globe" CTA in hero or header — the showpiece feature is currently invisible from main entry | XS | PM: trivial effort, high visibility |
| BL-017 | React error boundaries | Wrap each island with fallback UI — CesiumJS/WebGL failures currently show white screen | S | Dev: low effort, high value |

## P2 — Medium Priority

| ID | Title | Description | Effort | Notes |
|---|---|---|---|---|
| BL-002 | RSS/Atom feed | Auto-generated `/feed.xml` via `@astrojs/rss`. Must use proper XML encoding for AI-generated content | S | QA: plan XML injection prevention from start |
| BL-003 | Shareable deep links | URL params for date/event/view state. Depends on BL-001's cross-island state infrastructure | M-H | Dev: underestimated — do after BL-001 |
| BL-004 | Data export (CSV/JSON) | Download buttons on military, casualty, econ sections. Escape formula-injection chars for Excel | S | QA: check CSV formula injection |
| BL-018 | Bundle analysis & performance baseline | Add rollup-plugin-visualizer, Lighthouse CI budget. CesiumJS + Leaflet + React likely >500KB gzipped | S | Dev: missing technical hygiene item |
| BL-019 | Content Security Policy | CSP meta tag allowlisting Cesium Ion, Carto, OpenSky, USGS, Open-Meteo. Ship before/alongside OG meta and RSS | S | QA: defense-in-depth for AI-generated content. PM: moved earlier in build order |
| BL-020 | API health indicator | Client-side data source status (green/yellow/red) for OpenSky, USGS, Open-Meteo, Cesium Ion. Pairs with BL-012 as trust signal | S | Dev + PM: moved earlier — trust signal, not polish |
| BL-021 | Political section source chips | Every section has tier badges except Political — credibility consistency gap | XS | PM: low effort, closes visible inconsistency |
| BL-024 | KPI trend deltas | Add optional `delta` field to `KpiSchema` showing change direction/magnitude on each KPI card | S | PM: flagged from March 4 assessment, was silently dropped |
| BL-025 | Migrate from GitHub Pages to Cloudflare Pages | Lighthouse measured 1.8-2.5s TTFB on GH Pages; Cloudflare Pages typically 200-400ms + automatic Brotli (~15-25% smaller than gzip) + better LATAM/EU edge presence. No code changes — DNS swap. Highest ROI/hour of any remaining perf lever. | S | Dev: deferred 2026-04-26 after defer-cesium + SSR-carousel didn't move LCP enough. Confirms with PostHog Web Vitals before/after |
| BL-026 | Cut homepage HTML payload | `serializedTrackers` includes all 95 trackers' headlines, KPIs, eventImages, digestSummary in initial HTML (157 KB document). Lazy-load detail fields per tracker; keep only what's needed for first paint of cards/sidebar. Estimated -500-800ms LCP via download-time savings. | M | Dev: highest-ROI single code change for perf. Touches `src/pages/index.astro` serialization + relevant island prop shapes |
| BL-027 | Tree-shake Cesium bundle | Migrate from monolithic `cesium` package import to `@cesium/engine` + `@cesium/widgets` modular imports. Bundle 4.3 MB → ~1.5-2 MB; mobile parse 5s → 2s. Bigger refactor — affects every Cesium import site. | L | Dev: deferred until BL-025 + BL-026 are measured. Pairs with BL-018 (bundle analysis) for verification |

## P3 — Low Priority / Deferred

| ID | Title | Description | Effort | Notes |
|---|---|---|---|---|
| BL-006 | Print-friendly view | `@media print` styles for analyst briefings | S | All: correct tier, do after P1s |
| BL-022 | E2E smoke tests (Playwright) | 5-10 smoke tests: page loads, timeline expands, map renders, globe loads | M | Dev: follow-on to unit tests |
| BL-023 | Event partition scaling plan | 85+ daily JSON files growing linearly — consider Astro content collections with pagination | M | Dev: not urgent, ~1 year horizon. Effort upgraded from S to M per Dev review |

## Deferred Indefinitely

| ID | Title | Description | Reason |
|---|---|---|---|
| BL-005 | PWA / offline support | Service worker + manifest for offline access | All three agents: complexity vs. value mismatch — CesiumJS 7.5MB assets, live API feeds, nightly-updating data makes offline support architecturally expensive for marginal benefit |

---

## Moved to TECH_DEBT.md

| ID | Title | Reason |
|---|---|---|
| BL-007 | Test framework (TD-014) | Not a product feature — belongs exclusively in tech debt register. Already tracked as TD-014 |

---

## Recommended Build Order

```
Phase 1 — Foundation (this week)
  BL-009  Commit unstaged changes          [XS]  ← DO THIS NOW
  TD-014  Test framework + pure fn tests   [M]   (in TECH_DEBT)
  BL-010  Zod validation in CI             [S]
  BL-011  Build failure alerting           [S]

Phase 2 — Trust & Navigation
  BL-012  Data freshness indicator         [S]
  BL-013  Mobile responsive nav            [M]
  BL-014  OG meta / social sharing         [S]
  BL-015  "What changed today"             [M]   ← moved here from Phase 4
  BL-016  Globe discoverability CTA        [XS]
  BL-017  React error boundaries           [S]
  BL-019  CSP headers                      [S]   ← moved here from Phase 3
  BL-020  API health indicator             [S]   ← moved here from Phase 5

Phase 3 — Quick Wins
  BL-002  RSS/Atom feed                    [S]
  BL-004  Data export                      [S]
  BL-021  Political source chips           [XS]
  BL-024  KPI trend deltas                 [S]

Phase 4 — Architecture
  BL-001  Search & filter (nanostores ADR) [H]
  BL-003  Deep links (reuses BL-001 state) [M-H]

Phase 5 — Polish & Quality
  BL-008  Accessibility audit              [M-H]
  BL-018  Bundle analysis                  [S]
  BL-006  Print-friendly view              [S]
  BL-022  E2E smoke tests                  [M]
  BL-023  Event partition scaling           [M]
```

Effort key: XS (<2h), S (half day), M (1-2 days), H (3-5 days)
