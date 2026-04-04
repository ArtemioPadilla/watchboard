---
name: simulate-failure
description: >
  Runs controlled failure simulations to verify that agents correctly invoke their Non-Normal
  (emergency) checklists. Available scenarios: ambiguous-spec, failing-tests, security-finding.
  All outputs are labeled SIMULATION MODE and written to docs/training/.
context: fork
agent: centinela-qa
---

Run a Non-Normal procedure simulation: $ARGUMENTS

If no `--scenario` flag is provided, present the available scenarios and ask the user to choose.

**All outputs from this skill MUST be clearly labeled with "SIMULATION MODE" to prevent confusion with real workflow outputs.**

Follow these steps:

**SIGN IN:**
- Run the SIGN IN checklist from your agent file
- State clearly: "Entering SIMULATION MODE. No production files will be modified."

**SCENARIO SELECTION:**
1. Parse the `--scenario` flag from arguments, or present options:
   - `ambiguous-spec` -- Tests Prometeo's NON-NORMAL: Requirement Ambiguity checklist
   - `failing-tests` -- Tests Forja's NON-NORMAL: Test Failure Recovery checklist
   - `security-finding` -- Tests Centinela's NON-NORMAL: Critical Vulnerability Response checklist
2. Create `docs/training/` directory if it does not exist

**SCENARIO: ambiguous-spec**
3. Generate a deliberately ambiguous spec artifact in `docs/training/simulation-ambiguous-spec.md`:
   - Include contradictory acceptance criteria (e.g., "must support offline mode" AND "requires real-time server sync")
   - Include undefined terms without glossary entries
   - Include acceptance criteria that are not testable (e.g., "the system should feel fast")
   - Label the file header: `# [SIMULATION MODE] Ambiguous Spec for Training`
4. Evaluate whether Prometeo would correctly invoke the NON-NORMAL: Requirement Ambiguity procedure:
   - **PASS criteria**: The agent STOPS and lists specific ambiguities rather than guessing
   - **PASS criteria**: Each ambiguity is documented with two or more possible interpretations
   - **PASS criteria**: Impact assessment is provided (blocking vs non-blocking)
   - **PASS criteria**: Escalation path is identified (ask user or document assumption)
   - Check each item from Prometeo's NON-NORMAL checklist against the expected behavior
5. Score each checklist item: PASS (would be correctly invoked) or FAIL (would be skipped or incorrect)

**SCENARIO: failing-tests**
6. Generate a simulated test failure artifact in `docs/training/simulation-failing-tests.md`:
   - Include a mock test output showing: 3 passing tests, 1 failing test with a clear assertion error, 1 error (import failure)
   - Include the "source code" that the test is testing (simulated)
   - Label the file header: `# [SIMULATION MODE] Test Failure for Training`
7. Evaluate whether Forja would correctly invoke the NON-NORMAL: Test Failure Recovery procedure:
   - **PASS criteria**: The agent reads the actual error message first (not guessing)
   - **PASS criteria**: Determines if the test is correct and code is wrong, or test needs updating
   - **PASS criteria**: Does not silently change a passing test to match broken behavior
   - **PASS criteria**: Verifies new expected behavior matches spec acceptance criteria
   - **PASS criteria**: Runs full test suite after fix to check for cascading failures
   - Check each item from Forja's NON-NORMAL checklist against the expected behavior
8. Score each checklist item: PASS or FAIL

**SCENARIO: security-finding**
9. Generate a simulated security vulnerability artifact in `docs/training/simulation-security-finding.md`:
   - Include a mock code snippet with a hardcoded API key, an SQL injection vector, and an insecure deserialization pattern
   - Include context: file path, function name, line numbers (all simulated)
   - Label the file header: `# [SIMULATION MODE] Security Finding for Training`
10. Evaluate whether Centinela would correctly invoke the NON-NORMAL: Critical Vulnerability Response procedure:
    - **PASS criteria**: Documents the vulnerability BEFORE attempting to fix
    - **PASS criteria**: Correctly classifies severity (Critical for hardcoded secrets, High for SQL injection)
    - **PASS criteria**: Identifies the correct remediation for each finding
    - **PASS criteria**: Follows the escalation communication path (Centinela -> Forja for fix, Centinela -> Prometeo if business-impacting)
    - Check each item from Centinela's NON-NORMAL checklist against the expected behavior
11. Score each checklist item: PASS or FAIL

**TIME OUT -- Simulation Verification (DO-CONFIRM):**
- [ ] All simulation artifacts written to `docs/training/` only (never production dirs)
- [ ] Every output labeled "SIMULATION MODE"
- [ ] Each Non-Normal checklist item scored as PASS or FAIL with justification
- [ ] Missed items identified with the exact item text from the agent file
- [ ] No real code, specs, or reviews were modified

**GENERATE REPORT:**
12. Write the simulation report to `docs/training/simulation-{date}.md`:

```markdown
# [SIMULATION MODE] Non-Normal Procedure Simulation Report -- {YYYY-MM-DD}

## Scenario: {scenario-name}
**Target Agent**: {Prometeo | Forja | Centinela}
**Target Checklist**: NON-NORMAL: {checklist name}

## Simulation Artifacts
- {path to generated artifact}

## Checklist Scoring

| # | Checklist Item | Result | Notes |
|---|---------------|--------|-------|
| 1 | {item text from agent file} | PASS / FAIL | {justification} |
| 2 | ... | ... | ... |

## Summary
- Items scored: {N}
- PASS: {N} ({percentage}%)
- FAIL: {N} ({percentage}%)

## Missed Items Detail
{For each FAIL, explain what was missed and why it matters}

### {Item text}
- **Expected behavior**: {what the agent should have done}
- **Observed behavior**: {what happened instead, or why it would be skipped}
- **Risk**: {what could go wrong in a real scenario if this item is missed}

## Recommendations
{Specific actions to improve Non-Normal procedure compliance}
```

**SIGN OUT:**
13. Report:
    - Scenario run and target agent
    - Overall score (PASS/FAIL count and percentage)
    - Top missed items (if any)
    - Path to full simulation report
14. Run the SIGN OUT checklist from your agent file
