---
name: systematic-debugging
description: >
  4-phase root cause debugging process. Use when encountering any bug, test failure,
  or unexpected behavior BEFORE proposing fixes. Prevents guess-and-check thrashing.
  Includes root-cause tracing, defense-in-depth, and architecture questioning.
---

# Systematic Debugging

Debug: $ARGUMENTS

## The Iron Law

```
NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
```

If you haven't completed Phase 1, you cannot propose fixes.

## When to Use

Use for ANY technical issue: test failures, bugs, unexpected behavior, performance problems, build failures, integration issues.

**Use ESPECIALLY when:**
- Under time pressure (emergencies make guessing tempting)
- "Just one quick fix" seems obvious
- You've already tried multiple fixes
- You don't fully understand the issue

## Phase 1: Root Cause Investigation

**BEFORE attempting ANY fix:**

1. **Read error messages carefully**
   - Don't skip past errors or warnings
   - Read stack traces completely
   - Note line numbers, file paths, error codes

2. **Reproduce consistently**
   - Can you trigger it reliably?
   - What are the exact steps?
   - If not reproducible, gather more data — don't guess

3. **Check recent changes**
   - `git diff`, recent commits
   - New dependencies, config changes
   - Environmental differences

4. **Gather evidence in multi-component systems**
   ```
   For EACH component boundary:
     - Log what data enters component
     - Log what data exits component
     - Verify environment/config propagation
   
   Run once to gather evidence showing WHERE it breaks
   THEN analyze evidence to identify failing component
   THEN investigate that specific component
   ```

5. **Trace data flow (root-cause tracing)**
   - Where does the bad value originate?
   - What called this with the bad value?
   - Keep tracing backward until you find the source
   - Fix at source, not at symptom

## Phase 2: Pattern Analysis

1. **Find working examples** — locate similar working code in the same codebase
2. **Compare against references** — read reference implementations COMPLETELY, don't skim
3. **Identify differences** — list every difference between working and broken, however small
4. **Understand dependencies** — what components, settings, config, environment does this need?

## Phase 3: Hypothesis and Testing

1. **Form single hypothesis** — "I think X is the root cause because Y" — be specific
2. **Test minimally** — smallest possible change, one variable at a time
3. **Verify before continuing** — worked? proceed. Didn't work? new hypothesis. Don't stack fixes.
4. **When you don't know** — say "I don't understand X" — don't pretend

## Phase 4: Implementation

1. **Create failing test case** — simplest reproduction, automated if possible. Use TDD skill.
2. **Implement single fix** — address root cause, ONE change at a time, no "while I'm here" improvements
3. **Verify fix** — test passes? no other tests broken? issue actually resolved?
4. **If fix doesn't work** — STOP. Count: how many fixes have you tried?
   - If < 3: return to Phase 1 with new information
   - **If >= 3: STOP and question the architecture (see below)**

## After 3+ Failed Fixes: Question Architecture

**Pattern indicating architectural problem:**
- Each fix reveals new shared state/coupling in different places
- Fixes require "massive refactoring" to implement
- Each fix creates new symptoms elsewhere

**STOP and question fundamentals:**
- Is this pattern fundamentally sound?
- Are we sticking with it through inertia?
- Should we refactor architecture vs. continue fixing symptoms?

**Discuss with the user before attempting more fixes.**

This is NOT a failed hypothesis — this is a wrong architecture.

## Defense in Depth

After finding and fixing the root cause, add validation at multiple layers:

1. **Input validation** — catch bad data at the boundary where it enters
2. **Internal assertions** — verify invariants at key checkpoints
3. **Output validation** — confirm results before returning/persisting
4. **Monitoring** — add logging/metrics to detect recurrence

Not all layers are needed for every fix — apply proportionally to severity.

## Condition-Based Waiting

When debugging timing/async issues, replace arbitrary timeouts with condition polling:

```
INSTEAD OF: sleep(5)  # hope it's ready
USE:        poll until condition is true, with timeout
```

Arbitrary timeouts mask root causes and create flaky tests.

## Rationalization Red Flags

| Thought | Reality |
|---|---|
| "Quick fix for now, investigate later" | Symptom fixes mask root causes |
| "Just try changing X and see if it works" | That's guess-and-check, not debugging |
| "Add multiple changes, run tests" | Can't isolate what worked |
| "Skip the test, I'll manually verify" | Untested fixes don't stick |
| "It's probably X, let me fix that" | "Probably" means you haven't investigated |
| "Pattern says X but I'll adapt differently" | Partial understanding guarantees bugs |
| "One more fix attempt" (after 2+ failures) | 3+ failures = architectural problem |
| "Here are the main problems: [lists fixes]" | Listing fixes before investigation = guessing |

**ALL of these mean: STOP. Return to Phase 1.**

## Quick Reference

| Phase | Key Activities | Gate |
|---|---|---|
| 1. Root Cause | Read errors, reproduce, check changes, trace data | Understand WHAT and WHY |
| 2. Pattern | Find working examples, compare, identify differences | Know what's different |
| 3. Hypothesis | Form theory, test minimally, one variable | Confirmed or new hypothesis |
| 4. Implementation | Create test, fix root cause, verify | Bug resolved, tests pass |
