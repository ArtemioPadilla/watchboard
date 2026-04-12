---
name: business-review
description: >
  Post-implementation business assessment by Prometeo (PM). Verifies success metrics
  achievement, scope compliance, acceptance criteria business interpretation, risk
  materialization, and product decision closure. Outputs structured report with
  verdict and confidence score.
context: fork
agent: prometeo-pm
---

Run a post-implementation business review for: $ARGUMENTS

This skill closes the product loop. After Dev implements and QA verifies, you assess whether the implementation delivers the **business value** promised in the spec.

Follow these steps:

**SIGN IN:**
- Run the SIGN IN checklist from your agent file
- Read the feature spec from `docs/specs/{feature-name}.md`
- Read Centinela's review from `docs/reviews/` if available (security audit, code review, or release check)
- Identify the acceptance criteria, success metrics, scope boundaries, and risks to assess
- Note any open product decisions flagged by Centinela

**BUSINESS ASSESSMENT:**

Evaluate each of the following 5 areas. For each one, record: status (MET/NOT MET), evidence, and notes.

**Area 1 -- Success Metrics**
1. Read the spec's `## Success Metrics` section
2. For each KPI: assess whether the implementation enables measurement and achievement
3. If KPIs cannot be measured with the current implementation, note what's missing
4. Record: MET if implementation enables all stated KPIs, NOT MET otherwise

**Area 2 -- Scope Compliance**
5. Read the spec's `## Scope` section (In Scope and Out of Scope)
6. Verify every In-Scope item has been addressed in the implementation
7. Verify no Out-of-Scope items were implemented (scope creep)
8. Note any In-Scope items that were descoped and whether the rationale was documented
9. Record: MET if scope was respected, NOT MET if items are missing or scope crept

**Area 3 -- Acceptance Criteria Business Validation**
10. Read the spec's acceptance criteria (GIVEN/WHEN/THEN)
11. For each AC: assess whether a technical pass actually delivers the stated business value
12. Flag any ACs that could pass technically but fail the business intent (e.g., "user can log in" passes but the UX is unusable)
13. Record: MET if all ACs deliver business value, NOT MET if any are technically passing but business-failing

**Area 4 -- Risk Review**
14. Read the spec's `## Risks & Rollback` section
15. For each identified risk: did it materialize? If yes, was the mitigation applied?
16. Are the rollback criteria still valid and actionable?
17. Note any new risks discovered during implementation that weren't in the spec
18. Record: MET if risks were properly managed, NOT MET if unmitigated risks remain

**Area 5 -- Product Decisions**
19. Check Centinela's review for "areas where product decisions are needed"
20. Check the spec's `## Open Questions` — are any still unresolved?
21. For each open decision: provide a recommendation or escalate to the user
22. Record: MET if all decisions are closed, NOT MET if blocking decisions remain open

**⏸️ TIME OUT — Business Verification (DO-CONFIRM):**
Run the Business Verification checklist from your agent file.

**CONFIDENCE SCORE CALCULATION:**

Calculate the business confidence score:
- For each of the 5 areas: 20 points if MET, 0 points if NOT MET
- Confidence score = sum of all area scores (integer, 0-100)

**VERDICT:**
- If ALL areas MET: **APPROVED** with confidence score
- If 1-2 non-critical areas NOT MET: **CONDITIONALLY APPROVED** with specific remediation steps
- If any critical area NOT MET (Success Metrics or AC Business Validation): **CHANGES REQUIRED** with required actions

**PROJECT TIMELINE & ROADMAP VISUALIZATION:**

After completing the assessment, generate visual representations of the project timeline and roadmap using Mermaid diagrams. These render natively on GitHub, VS Code, and most documentation platforms.

23. **Feature Timeline** — Generate a Mermaid Gantt chart showing the feature's lifecycle phases with actual dates:
    - Gather dates from: spec file (creation date), git log (first implementation commit, last commit), review files (review dates), and this business review date
    - Include phases: Spec Draft, Spec Approved, Implementation, QA Review, Business Review
    - Mark the current phase as active
    - Example format:
      ````
      ```mermaid
      gantt
          title Feature Timeline: {feature-name}
          dateFormat YYYY-MM-DD
          section Specification
              Spec Draft           :done, spec, {spec-start}, {spec-end}
              Spec Approved        :done, approve, {approve-date}, 1d
          section Implementation
              Development          :done, dev, {dev-start}, {dev-end}
          section Review
              QA Review            :done, qa, {qa-start}, {qa-end}
              Business Review      :active, biz, {biz-date}, 1d
      ```
      ````

24. **Roadmap Status** — If `docs/specs/feature-roadmap.md` exists, generate a Mermaid timeline showing the broader project roadmap with this feature's position highlighted:
    - Read the roadmap for phase information and feature statuses
    - Show phases (P0, P1, P2, P3) with their features grouped
    - Mark completed, in-progress, and planned features
    - Example format:
      ````
      ```mermaid
      timeline
          title Project Roadmap Status
          section P0 - Foundation
              Feature A : Done
              Feature B : Done
          section P1 - Core
              Feature C : Done
              {current-feature} : In Review
              Feature D : Planned
          section P2 - Growth
              Feature E : Planned
      ```
      ````

25. **Confidence Score Visualization** — Generate a visual summary of the 5 assessment areas:
    ````
    ```mermaid
    pie title Business Confidence Score: {score}/100
        "Success Metrics" : {20 if MET, 0 if NOT}
        "Scope Compliance" : {20 if MET, 0 if NOT}
        "AC Validation" : {20 if MET, 0 if NOT}
        "Risk Review" : {20 if MET, 0 if NOT}
        "Product Decisions" : {20 if MET, 0 if NOT}
    ```
    ````
    Only include MET areas in the pie chart. If all 5 are MET, all slices show. If some are NOT MET, add a "Gaps" slice for the missing points.

26. **Risk & Dependency Map** (if applicable) — If the feature has dependencies on other features or external systems, generate a Mermaid flowchart showing:
    - Feature dependencies (from spec `## Dependencies` section)
    - Risk status (green for mitigated, yellow for monitoring, red for unmitigated)
    - Example format:
      ````
      ```mermaid
      flowchart LR
          A[Dependency A] -->|done| F[{feature-name}]
          B[Dependency B] -->|done| F
          F -->|blocks| C[Downstream Feature]
          style F fill:#F59E0B,color:#000
      ```
      ````

**SIGN OUT:**

Write the structured business review report to `docs/reviews/business-review-{feature}-{date}.md` using this format:

```markdown
# Business Review: {feature}
**Date**: {YYYY-MM-DD}
**Spec**: docs/specs/{feature}.md
**Confidence Score**: {score}/100
**Verdict**: APPROVED | CONDITIONALLY APPROVED | CHANGES REQUIRED

## Assessment Summary

| Area | Status | Notes |
|------|--------|-------|
| Success Metrics | MET/NOT MET | {notes} |
| Scope Compliance | MET/NOT MET | {notes} |
| AC Business Validation | MET/NOT MET | {notes} |
| Risk Review | MET/NOT MET | {notes} |
| Product Decisions | MET/NOT MET | {notes} |

## Feature Timeline

{Mermaid Gantt chart from step 23}

## Roadmap Status

{Mermaid timeline from step 24, or "No roadmap file found — skipped." if docs/specs/feature-roadmap.md does not exist}

## Confidence Breakdown

{Mermaid pie chart from step 25}

## Dependency & Risk Map

{Mermaid flowchart from step 26, or "No dependencies — skipped." if the feature has none}

## Detailed Assessment

### Success Metrics
{Narrative: KPI assessment, measurement readiness, gaps}

### Scope Compliance
{Narrative: In-Scope delivery, Out-of-Scope adherence, any descoping}

### Acceptance Criteria Business Validation
{Narrative: AC-by-AC business value assessment}

### Risk Review
{Narrative: risk materialization, mitigation effectiveness, new risks}

### Product Decisions
{Narrative: decisions made, decisions pending, recommendations}

## Required Changes
{If CHANGES REQUIRED or CONDITIONALLY APPROVED — specific actionable items}

## Recommendations
{Product recommendations, follow-up features, lessons learned for future specs}
```

Provide the final verdict and confidence score prominently.

Run the SIGN OUT checklist from your agent file.

A business review that catches value gaps here prevents shipping features that technically work but miss the mark for users.
