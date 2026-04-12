---
name: code-health
description: >
  Scans the codebase for dead code, tech debt, outdated dependencies, and code quality
  issues. Use periodically or before releases to maintain code hygiene.
context: fork
agent: centinela-qa
---

Run a comprehensive code health scan on the codebase.

Follow these steps:

**SIGN IN:**
- Run the SIGN IN checklist from your agent file
- Note any areas of concern based on past scans

**SCAN -- Quality Attribute Assessment (FURPS):**

Organize findings by quality attribute category (FURPS model, Hewlett-Packard):

**F -- Functionality:**
1. Scan for dead code:
   - Unused imports: `ruff check --select F401 src/` or `biome lint src/`
   - Unused variables/functions: grep for definitions not referenced elsewhere
   - Commented-out code blocks: search for patterns spanning 3+ lines
   - Unreachable code after return/throw/break/continue
   - Files not imported by any other file

**R -- Reliability:**
2. Scan for flaky test indicators:
   - Tests depending on timing (`sleep`, `setTimeout`, fixed delays)
   - Tests sharing mutable state between test cases
   - Tests making real network calls without mocking
   - Tests depending on filesystem paths or system-specific state
   - Non-deterministic assertions (floating point equality without tolerance, random data without seeding)
3. Check for outdated dependencies:
   - `pip list --outdated` or `npm outdated`
   - Known vulnerabilities: `pip audit` or `npm audit`

**P -- Performance (complexity proxies):**
4. Scan for Clean Code violations:
   - Functions longer than 30 lines
   - Files longer than 300 lines
   - Deeply nested code (>3 levels of indentation)
   - Duplicated logic blocks (DRY violations)
   - Primitive obsession (raw strings/ints where a domain type belongs)
   - Feature envy (methods that use another class's data more than their own)
   - God classes (classes with too many responsibilities)

**S -- Supportability:**
5. Verify architecture compliance:
   - Dependency direction: does business logic depend on frameworks or infrastructure?
   - Layer leakage: are there imports that cross architectural boundaries incorrectly?
   - Screaming Architecture: does folder structure reveal intent?
6. Check TODO/FIXME comments — do they have issue references?
7. Check for missing docstrings on public API functions: any function or class without a leading underscore in `src/` files that lacks a docstring. Excludes test files and internal helpers (functions starting with `_`).

Note: **U (Usability)** is not assessed at code-health level -- this is a product concern owned by Prometeo.

### Cost of Quality (COPQ) Classification

Categorize each finding by cost type (Feigenbaum 1956, O'Regan 2019):

- **Prevention cost**: Items that prevent defects if addressed (test coverage gaps, missing type hints, missing docstrings)
- **Appraisal cost**: Items that affect defect detection capability (flaky tests, weak assertions, inadequate test isolation)
- **Internal failure cost**: Defects already present, found internally (dead code, broken imports, architecture violations)
- **External failure cost**: Issues that could escape to users if not addressed (security vulnerabilities, missing error handling, unvalidated inputs)

In the code-health report, tag each finding with its FURPS category and COPQ type. Reports heavy on "external failure" items are more urgent than those with mostly "prevention" items.

References: FURPS (Hewlett-Packard), cited in Callejas-Cuervo et al. (2017). COPQ (Feigenbaum 1956), presented in O'Regan (2019) Ch. 9.3.5.

**⏸️ TIME OUT — Scan Complete Checklist (DO-CONFIRM):**
- [ ] All source directories scanned (not just `src/` — also `tests/`, config files)
- [ ] Dead code findings verified (not false positives from dynamic imports or plugins)
- [ ] Dependency vulnerabilities checked with automated tools
- [ ] Flaky test indicators checked (timing, shared state, network, non-determinism)
- [ ] Findings prioritized: Critical > Warning > Suggestion
- [ ] Previous scan findings compared — are old issues resolved or recurring?

**SIGN OUT:**
6. Write findings to `docs/reviews/code-health-{date}.md`
7. Write the Findings Handoff-to-Forja using the communication checklist
8. Run the SIGN OUT checklist from your agent file
