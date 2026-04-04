---
name: implement-feature
description: >
  Implements a feature from its specification. Reads the spec, designs architecture,
  writes code, tests, and documentation. Use after a feature spec has been approved.
context: fork
agent: forja-dev
---

Implement the feature: $ARGUMENTS

Follow these steps:

**SIGN IN:**
- Run the SIGN IN checklist from your agent file
- Run the Receiving-from-Prometeo checklist to verify the spec handoff
- If significant architecture decisions are needed, create an ADR in `docs/adr/`

**DESIGN:**
1. Define interfaces/contracts first — program to interfaces, not implementations
2. Plan the layer structure: entities → use cases → adapters → frameworks (Clean Architecture)
3. Identify which business logic needs TDD (test-first) vs infrastructure glue (test-after acceptable)

**BUILD (TDD Cycle):**
4. For each piece of business logic:
   a. **Red**: Write a failing test that describes the expected behavior (Arrange-Act-Assert)
   b. **Green**: Write minimal code to make the test pass
   c. **Refactor**: Clean up — extract methods, improve names, remove duplication
   d. Verify each acceptance criterion from the spec has at least one test — if not, write one before proceeding
5. Implement infrastructure/adapters and write integration tests for critical paths
6. Scan for and remove any dead code you introduced or found

**⏸️ TIME OUT — Run Implementation Complete Checklist (DO-CONFIRM):**
7. Run through every item in the Implementation Complete checklist from your agent file
8. Fix any failures BEFORE proceeding

**REFACTORING PASS:**
9. Review all new code for code smells: long methods, feature envy, data clumps, primitive obsession
10. Apply Extract Method, Rename, Move as needed — leave code better than you found it

**⏸️ TIME OUT — Run Pre-Delivery Checklist (DO-CONFIRM):**
11. Run through every item in the Pre-Delivery checklist from your agent file
12. Fix any failures BEFORE proceeding

**SIGN OUT:**
13. Write the Handoff-to-Centinela using the communication checklist
14. Run the SIGN OUT checklist from your agent file
