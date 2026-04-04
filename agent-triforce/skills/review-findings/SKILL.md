---
name: review-findings
description: >
  Addresses and fixes findings from a QA code review. Reads the review report,
  fixes critical and warning issues, and prepares for re-verification.
context: fork
agent: forja-dev
---

Fix the findings from the QA review: $ARGUMENTS

If no specific review is mentioned, look for the most recent review in `docs/reviews/`.

Follow these steps:

**SIGN IN:**
- Run the SIGN IN checklist from your agent file
- Surface any concerns about the findings — complexity, risk, dependencies

### Defect Severity Classification

Every finding in the review report must have a severity:
- **Critical**: Security vulnerability, data loss, system crash
- **Major**: Feature broken, workaround exists but painful
- **Medium**: Incorrect behavior, easy workaround
- **Minor**: Cosmetic, style, naming

### Defect Status Lifecycle

Each finding tracks its status through the Centinela > Forja > Centinela loop:

```
Open (Centinela identifies in review)
  > Assigned (handoff to Forja via review-findings)
    > Implemented (Forja completes fix)
      > Verified (Centinela re-verifies)
        > Closed
```

When reading the review report, update each finding's status from `Open` to `Assigned`.
When fixing is complete, update status to `Implemented`.
Centinela re-verification updates to `Verified` then `Closed`.

### Entry/Exit Criteria

**Entry criteria** (must be true before starting fixes):
- Implementation is complete and all existing tests pass
- Forja's Pre-Delivery checklist has been passed
- Review report exists at `docs/reviews/{feature-name}-review.md`

**Exit criteria** (must be true before handoff back to Centinela):
- All Critical and Major findings have status `Implemented`
- Remaining Minor findings are documented in `TECH_DEBT.md` with justification
- Fix order was respected: Critical > Major > Medium > Minor

### Review Report Finding Format

Each finding in the review report must include:

| Field | Description |
|-------|-------------|
| ID | `F-{NNN}` sequential |
| Severity | Critical / Major / Medium / Minor |
| Status | Open / Assigned / Implemented / Verified / Closed |
| Category | Code Quality / Architecture / Spec Compliance |
| Description | What the issue is |
| Location | `file:line` reference |
| Recommendation | How to fix |
| Verified-By | Agent that verified the fix (populated during re-verification) |

Reference: O'Regan (2019), Ch. 7, sections 7.3-7.5

**⏸️ TIME OUT — Pre-Fix Preparation (READ-DO):**
1. Read the review report in `docs/reviews/`
2. Understand each finding's root cause BEFORE writing any fix
3. Plan the fix order: Critical first, then Warnings
4. Identify if any fixes could conflict with each other

**FIX (using Clean Code principles):**
5. For each finding:
   - Understand root cause (don't just fix the symptom)
   - Apply appropriate refactoring technique: Extract Method, Rename, Move, Inline, Replace Conditional with Polymorphism
   - Write or update tests to prevent recurrence (Arrange-Act-Assert)
   - Verify the fix doesn't introduce new code smells
6. Scan for dead code after all fixes — apply Boy Scout Rule

**⏸️ TIME OUT — Run Implementation Complete + Pre-Delivery Checklists (DO-CONFIRM):**
7. Run the Implementation Complete checklist from your agent file
8. Run the Pre-Delivery checklist from your agent file
Additionally verify:
- [ ] Every Critical finding addressed
- [ ] Every Warning addressed (or explicitly deferred with justification)
- [ ] No new code smells introduced by the fixes

**SIGN OUT:**
9. Write a Fix Report using the Fix Report checklist from your agent file
10. Run the SIGN OUT checklist from your agent file
