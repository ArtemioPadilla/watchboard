---
name: feature-spec
description: >
  Creates a complete product feature specification. Use when defining new features,
  writing user stories, or planning product work. Generates structured specs in docs/specs/.
context: fork
agent: prometeo-pm
---

Create a feature specification for: $ARGUMENTS

Follow these steps:

**SIGN IN:**
- Run the SIGN IN checklist from your agent file
- Surface any initial concerns about this feature request

**TIER SELECTION:**
1. Ask the user which spec tier to use:
   - **S (Small)**: Bug fix, tweak, minor enhancement (~10 min)
   - **M (Medium)**: Standard feature — default choice (~30-60 min)
   - **L (Large)**: Epic, multi-phase, API-heavy (~60-90 min)
2. If the user does not specify, default to M

**RESEARCH (READ-DO):**
3. Read existing specs in `docs/specs/` to understand current patterns and avoid conflicts
4. Identify dependencies on existing features or systems

**BUILD:**
5. Create the spec at `docs/specs/{feature-name}.md` using the tier-appropriate template from your system prompt
6. For each user story, validate against INVEST:
   - **I**ndependent: can be delivered separately
   - **N**egotiable: not a rigid contract, allows discussion
   - **V**aluable: delivers value to user or business
   - **E**stimable: Dev can estimate effort
   - **S**mall: fits in one iteration
   - **T**estable: has clear acceptance criteria
7. For M/L tiers, verify IEEE 830 quality attributes: completeness, consistency, unambiguity, verifiability
8. For M/L tiers, fill in testing considerations: identify the 2-3 highest-risk acceptance criteria, recommend a test design technique for each (BVA for bounded inputs, EP for categorical inputs, Decision Table for complex branching, State Transition for lifecycle objects), note test data needs, and flag non-functional test requirements

**TIME OUT -- Run Spec Completion Checklist (DO-CONFIRM):**
8. Run through every item in the Spec Completion checklist from your agent file
9. Fix any gaps BEFORE proceeding

**SIGN OUT:**
10. Write the Handoff-to-Forja using the communication checklist
11. Run the SIGN OUT checklist from your agent file
