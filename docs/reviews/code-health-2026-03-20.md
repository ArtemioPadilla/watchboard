# Code Health Report
**Date**: 2026-03-20
**Reviewer**: Centinela (QA Agent)
**Branch**: feat/unified-timeline-bar
**Scope**: Full codebase — `src/`, `scripts/`, `.github/workflows/`, `trackers/` data layer

---

## Summary

The codebase is in substantially good shape. Most previously identified tech debt has been resolved. Three open debt items remain (all P3). A new class of issues was discovered this session: **data integrity violations** in the AI-seeded data layer (world-cup-2026 fabricated match results, chernobyl deltaNote future framing). The primary systemic risk is the absence of a test framework (TD-014) and the lack of future-date validation in the Zod schema layer — two gaps that allowed the world-cup-2026 contamination to survive CI.

---

## Findings

### Critical (must fix before merge)

- **[C-1] world-cup-2026 timeline.json contains 4 fabricated future match results**
  - File: `trackers/world-cup-2026/data/timeline.json`, Era[4]
  - Impact: Disinformation — detailed match narratives written for games not yet played (June 2026)
  - Fix: Delete Era[4]; replace with verified pre-tournament data (draw, qualification, venues)
  - See: `docs/reviews/data-integrity-audit-2026-03-20.md` for full details

### Warning (should fix)

- **[W-1] DateFieldSchema has no future-date semantic validation**
  - File: `src/lib/schemas.ts:77`
  - Impact: Schema passes `2030-01-01` as valid. Allowed the world-cup contamination to survive Zod validation in CI.
  - Fix: Add `.refine(d => d <= new Date().toISOString().split('T')[0], { message: 'Date must not be in the future' })` — with a note that future-dated trackers (world-cup-2026) may need a separate `ScheduledDateFieldSchema`.

- **[W-2] normalizeItems() has no date upper-bound clamp**
  - File: `scripts/update-data.ts:314`
  - Impact: AI-provided future dates pass through normalization unchanged
  - Fix: After `parsed.toISOString().split('T')[0]`, clamp: `obj.date = min(parsed_date, today)`

- **[W-3] seed-tracker.yml has no future-tracker guardrail in prompt**
  - File: `.github/workflows/seed-tracker.yml:119`
  - Impact: Seed agent for trackers with future `startDate` writes events as if already completed
  - Fix: Add explicit instruction: "If tracker.startDate is in the future, DO NOT fabricate event outcomes. Only include verifiable pre-event data."

- **[W-4] 1 HIGH npm audit finding (lodash)**
  - Lodash 4.x prototype pollution (GHSA-xxjr-mmjv-4gpg) via `@astrojs/language-server` → `yaml-language-server` → `volar-service-yaml`
  - Severity: HIGH in npm audit, but this dependency chain is dev-only (language server for IDE support). It is NOT included in the production bundle.
  - Fix: `npm audit fix` — auto-fix available. Low urgency but should be resolved.

- **[W-5] chernobyl-disaster KPI framed as "As of 26 April 2026"**
  - File: `trackers/chernobyl-disaster/data/kpis.json:7.deltaNote`
  - Impact: Medium — implies data is current as of a future date; `value=40` is incorrect today (39 years elapsed)
  - Fix: Rephrase to "Approaching 40th anniversary (April 26, 2026)"; set `value=39`

### Suggestion

- **[S-1] CesiumGlobe.tsx (539 lines) and UnifiedTimelineBar.tsx (481 lines) exceed single-responsibility threshold**
  - These are the two largest components. Not blocking, but extraction of sub-hooks/components would improve maintainability.
  - Technique: Extract Method — e.g., `CesiumGlobe` could extract satellite, weather, and flight rendering into dedicated components.

- **[S-2] TECH_DEBT.md Active section contains 21 items marked "Resolved"**
  - These should be moved to the Resolved section. The table formatting makes the register hard to parse.
  - Quick fix: move all `| Resolved |` rows from Active to Resolved section.

- **[S-3] Outdated but non-vulnerable dependencies**
  - `openai`: 6.25.0 → 6.32.0, `resium`: 1.19.4 → 1.20.0, `@astrojs/react`: 4.4.2 → 5.0.1, `astro`: 5.18.0 (latest 6.0.8 — major version)
  - No known CVEs. Not urgent but astro 6 major version should be tracked.

---

## Dead Code Scan

- Unused imports: None found (no ruff/biome output; TypeScript builds cleanly)
- Unused functions: None new found this session
- Commented-out code: None found in src/
- `src/data/` directory: **14 files still present** — duplicate of `trackers/iran-conflict/data/`. TD-024 remains open.
- Unreachable code: None found
- TODO/FIXME: None found in src/ (zero hits)

---

## Code Quality

**Clean Code:**
- Naming: Good. Functions and variables are descriptive and follow conventions.
- Function size: Many functions exceed 30 lines, particularly in `CesiumGlobe.tsx` (539 lines), `IntelMap.tsx` (254 lines), `LeafletMap.tsx` (329 lines), `UnifiedTimelineBar.tsx` (481 lines), `update-data.ts` section updaters (35–131 lines each). These are complex interactive components — length is partly justified by domain complexity, but extraction opportunities exist.
- DRY: Previously identified violations (TD-001, TD-002) resolved. No new DRY violations found.

**Code smells found:**
- God function: `CesiumGlobe()` at 539 lines handles rendering, effects, refs, satellite data, earthquake data, weather, and ship tracking. Should be decomposed.
- `update-data.ts` `main()` at 130 lines manages tracker enumeration, section dispatch, and log writing — reasonable for a script, but Extract Method for the per-tracker loop body would help.

---

## Architecture Compliance

- Dependency direction: Clean. React islands do not import from Astro static components. Schemas flow from `src/lib/schemas.ts` inward only.
- Layer separation: Good. Business logic (schemas, data loading) is isolated from presentation.
- Data layer: `src/data/` duplicate still present (TD-024). Two sources of truth for iran-conflict data.
- Screaming Architecture: Folder structure reveals intent clearly (`islands/`, `static/`, `lib/`, `trackers/`).

---

## Security Assessment

**OWASP Top 10 Quick Scan:**
- A01 Broken Access Control: Static site — no auth surface. N/A.
- A02 Cryptographic Failures: No crypto operations. Cesium Ion token loaded from `PUBLIC_` env var (intentionally public). OK.
- A03 Injection: No database. No user input passed to queries. AI-generated content is validated through Zod before being written to JSON. `set:html` usage in `BaseLayout.astro:34` wraps `JSON.stringify()` — safe (serialized, not raw HTML from user/AI input).
- A04 Insecure Design: AI data injection path is the primary concern. The `diffGuard()` function protects against hallucination floods (>200% growth blocked). Future-date contamination is a data integrity risk, not a security vector per se.
- A05 Security Misconfiguration: `.env` is in `.gitignore` (TD-011 resolved). No verbose error pages (static site).
- A06 Vulnerable Components: 1 HIGH, 5 MODERATE in npm audit. HIGH is dev-only dependency chain (lodash via language server). Not in production bundle.
- A07 Auth Failures: N/A (no auth).
- A08 Data Integrity: **Active risk** — world-cup-2026 fabricated data is the current instance. Systemic gap: no future-date validation prevents AI from writing predictions as facts.
- A09 Logging Failures: Update script logs to stdout/Actions. Adequate for current scale.
- A10 SSRF: GitHub Actions workflow fetches from `anthropics/claude-code-action@v1`. Fixed version tag used — acceptable.

**Secrets:**
- No hardcoded secrets found in `src/`. Cesium Ion token uses `PUBLIC_` prefix (correct for client-side public token).

---

## Test Quality

- **No test framework installed** (TD-014, open)
- Zero test files anywhere in the codebase
- No coverage data available
- FIRST principles: Cannot assess — no tests exist
- This is the single largest quality gap in the codebase

---

## Security Verification Checklist (DO-CONFIRM)

- [x] No hardcoded secrets, API keys, or credentials in code
- [x] All user input validated and sanitized (no user input — static site)
- [x] Database queries parameterized (no database)
- [x] Authentication enforced (no auth surface)
- [x] Dependencies: 1 HIGH in npm audit (dev-only, not in production bundle). PASS with caveat.

## Quality Verification Checklist (DO-CONFIRM)

- [ ] Tests exist and pass — FAIL (TD-014: no test framework)
- [ ] AC traceability — N/A (no spec for this session's scope)
- [x] Clean Code: No egregious violations; long components are domain-justified
- [x] Architecture: Dependencies point inward; layer separation maintained
- [x] Acceptance criteria met — N/A
- [ ] No dead code — PARTIAL (src/data/ duplicate open, TD-024)

---

## Overall Verdict

**APPROVED WITH CONDITIONS**

The code is architecturally sound and previously identified critical issues are resolved. The world-cup-2026 data contamination (C-1) must be fixed before the next public build, but it does not block the current feat/unified-timeline-bar work in progress. The schema validation gap (W-1, W-2, W-3) should be addressed as a batch fix.

The complete data-integrity audit is at: `/Users/artemiopadilla/Documents/repos/GitHub/personal/iran-conflict-tracker/docs/reviews/data-integrity-audit-2026-03-20.md`
