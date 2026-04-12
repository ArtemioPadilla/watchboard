---
name: traceability
description: >
  Generates a spec-to-implementation traceability matrix linking acceptance
  criteria from specs to implementation files, test cases, and review findings.
  Supports IEEE 830 compliance audits.
context: fork
agent: centinela-qa
---

Generate a traceability matrix for a feature spec.

**Input**: The user provides a spec file path (e.g., `docs/specs/auth-feature.md`) or feature name.

Follow these steps:

**SIGN IN:**
- Run the SIGN IN checklist from your agent file
- Read the specified spec file

**EXTRACT:**
1. Parse the spec for acceptance criteria in GIVEN/WHEN/THEN format
2. Assign stable criterion IDs in format `{feature-id}-AC-{NNN}` if not already present
3. Extract: criterion ID, criterion text, any referenced modules or components

**TRACE:**
4. For each acceptance criterion, scan `src/` for implementation files:
   - Search for comments referencing the criterion ID (e.g., `Implements: {feature}-AC-001`)
   - Fall back to keyword matching from criterion text (function names, module names)
   - Use `tools/traceability.py` if available for automated scanning
5. For each acceptance criterion, scan `tests/` for test cases:
   - Search for explicit `Verifies: {criterion_id}` references in test docstrings → mark as **Explicit** link
   - Fall back to keyword matching from criterion text → mark as **Implicit** link
   - Extract `TC-{feature}-{NNN}` test case IDs from matching test files
6. For each acceptance criterion, scan `docs/reviews/` for findings:
   - Search review files for references to the criterion or its subject
   - Link findings by severity

**BI-DIRECTIONAL VERIFICATION:**
7. Scan `tests/` for orphaned tests:
   - Find all `TC-{feature}-{NNN}` IDs and `Verifies: {AC-ID}` references across test files
   - Cross-reference against extracted criterion IDs
   - Mark any test referencing a deleted or renamed AC as "Orphaned"
8. Identify unlinked tests:
   - Tests without any `Verifies:` reference or TC-ID — may be valid infrastructure tests
   - List separately for human review

**GENERATE MATRIX:**
9. Create the traceability matrix at `docs/traceability/{feature-name}-matrix.md`:
   ```markdown
   # Traceability Matrix: {Feature Name}
   **Spec**: {spec_file_path}
   **Generated**: {YYYY-MM-DD}
   **Status**: {X covered / Y partial / Z missing}

   | ID | Criterion | Implementation | Tests | Test IDs | Findings | Link Type | Status |
   |----|-----------|---------------|-------|----------|----------|-----------|--------|
   | {id} | {text} | {files} | {test files} | {TC-IDs} | {findings} | Explicit/Implicit/None | Covered/Partial/Missing |

   ## Coverage Summary
   - **Explicit**: {N} ACs with direct TC-ID links
   - **Implicit**: {N} ACs matched by keyword only
   - **Uncovered**: {N} ACs with no test found
   - **Orphaned tests**: {N} test references to non-existent ACs
   ```
10. Status determination:
    - **Covered**: has implementation file(s) AND at least one test with Explicit or Implicit link
    - **Partial**: has implementation but no test, or has test but unclear implementation link
    - **Missing**: no implementation or test found

**TIME OUT — Traceability Verification (DO-CONFIRM):**
- [ ] All acceptance criteria extracted from spec
- [ ] Criterion IDs assigned (stable, format: `{feature}-AC-{NNN}`)
- [ ] `src/` scanned for implementation links
- [ ] `tests/` scanned for test coverage links (both TC-ID references and keyword matches)
- [ ] Bi-directional check complete: orphaned tests identified, unlinked tests listed
- [ ] `docs/reviews/` scanned for finding references
- [ ] Each criterion has a status (Covered/Partial/Missing) and link type (Explicit/Implicit/None)
- [ ] Missing criteria flagged with `/generate-tests` recommendation

**SIGN OUT:**
9. Report matrix summary (covered/partial/missing counts)
10. If any criteria are Missing, suggest running `/generate-tests` on the relevant modules
11. Run the SIGN OUT checklist from your agent file
