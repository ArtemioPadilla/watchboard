---
name: receiving-code-review
description: >
  Handle code review feedback with technical rigor — verify before implementing,
  push back when reviewer is wrong, no performative agreement. Use when receiving
  feedback from Centinela, external reviewers, or PR comments.
---

# Receiving Code Review

Handle feedback on: $ARGUMENTS

## The Response Pattern

```
WHEN receiving code review feedback:

1. READ: Complete feedback without reacting
2. UNDERSTAND: Restate requirement in own words (or ask)
3. VERIFY: Check against codebase reality
4. EVALUATE: Technically sound for THIS codebase?
5. RESPOND: Technical acknowledgment or reasoned pushback
6. IMPLEMENT: One item at a time, test each
```

## Forbidden Responses

**NEVER say:**
- "You're absolutely right!"
- "Great point!" / "Excellent feedback!"
- "Thanks for catching that!"
- "Let me implement that now" (before verification)

**INSTEAD:**
- Restate the technical requirement
- Ask clarifying questions
- Push back with technical reasoning if wrong
- Just start working (actions > words)

## Handling Unclear Feedback

```
IF any item is unclear:
  STOP — do not implement anything yet
  ASK for clarification on ALL unclear items

WHY: Items may be related. Partial understanding = wrong implementation.
```

**Example:**
```
Reviewer: "Fix items 1-6"
You understand 1,2,3,6. Unclear on 4,5.

WRONG: Implement 1,2,3,6 now, ask about 4,5 later
RIGHT: "I understand items 1,2,3,6. Need clarification on 4 and 5 before proceeding."
```

## Source-Specific Handling

### From Centinela (QA Agent)
- **Trusted but verified** — Centinela's findings are systematic, but verify the fix won't break something else
- **Check severity** — Critical findings are non-negotiable. Warnings deserve verification. Suggestions are optional.
- **No performative agreement** — skip to action or technical acknowledgment

### From External Reviewers (PR comments, human reviewers)
```
BEFORE implementing:
  1. Technically correct for THIS codebase?
  2. Breaks existing functionality?
  3. Reason for current implementation?
  4. Works on all platforms/versions?
  5. Does reviewer understand full context?

IF suggestion seems wrong:
  Push back with technical reasoning

IF conflicts with existing architectural decisions:
  Check ADRs in docs/adr/ first, then discuss
```

## YAGNI Check

```
IF reviewer suggests "implementing properly" or adding features:
  Check: Is this actually used?

  IF unused: "This isn't called anywhere. Remove it (YAGNI)?"
  IF used: Then implement properly
```

## Implementation Order

```
FOR multi-item feedback:
  1. Clarify anything unclear FIRST
  2. Then implement in this order:
     - Blocking issues (breaks, security)
     - Simple fixes (typos, imports)
     - Complex fixes (refactoring, logic)
  3. Test each fix individually
  4. Verify no regressions
```

## When to Push Back

Push back when:
- Suggestion breaks existing functionality
- Reviewer lacks full context
- Violates YAGNI (unused feature)
- Technically incorrect for this stack
- Conflicts with existing ADRs or architectural decisions
- Legacy/compatibility reasons exist

**How to push back:**
- Use technical reasoning, not defensiveness
- Reference working tests/code
- Ask specific questions
- Cite ADRs if applicable

## Acknowledging Correct Feedback

When feedback IS correct:
```
"Fixed. [Brief description of what changed]"
"Good catch — [specific issue]. Fixed in [location]."
[Just fix it and show in the code]
```

Actions speak. The code itself shows you heard the feedback.

## Gracefully Correcting Your Pushback

If you pushed back and were wrong:
```
"You were right — I checked [X] and it does [Y]. Implementing now."
"Verified and you're correct. My initial understanding was wrong because [reason]. Fixing."
```

State the correction factually and move on. No long apology.

## Rationalization Red Flags

| Thought | Reality |
|---|---|
| "The reviewer is probably right" | Verify first. Reviewers can be wrong too |
| "Just implement it to move forward" | Bad fixes create more work later |
| "I'll push back later" | Push back now with reasoning, or implement now |
| "This is just a style thing" | If it's just style, say so. Don't silently comply |
| "I don't want to seem difficult" | Technical correctness > social comfort |
