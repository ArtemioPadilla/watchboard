---
name: verification-before-completion
description: >
  Verify work is actually done before claiming completion. Run verification
  commands, see passing output, confirm behavior. Evidence before assertions.
  Use before committing, creating PRs, or claiming a fix works.
---

# Verification Before Completion

Verify: $ARGUMENTS

## The Rule

**You MUST see evidence before claiming success.** "It should work" is not evidence. A passing test run is evidence. A working command output is evidence.

## When to Use

- Before claiming a bug is fixed
- Before claiming implementation is complete
- Before committing
- Before creating a PR
- Before telling the user "it's done"
- Before marking a task as completed

## The Checklist

Before ANY completion claim, run through these:

1. **Run the tests** — see them pass with your own eyes
   ```
   Run: {project test command}
   Expected: ALL tests pass
   Actual: {paste actual output}
   ```

2. **Verify the specific change** — does it do what was requested?
   ```
   Test: {specific verification for this change}
   Expected: {expected behavior}
   Actual: {paste actual output}
   ```

3. **Check for regressions** — did you break anything else?
   ```
   Run: {full test suite or broader test}
   Expected: No new failures
   Actual: {paste actual output}
   ```

4. **Verify the claim you're about to make** — is it actually true?
   - "Tests pass" — did you run them? did you see them pass?
   - "Bug is fixed" — did you reproduce the bug, apply the fix, verify it's gone?
   - "Feature works" — did you exercise the feature and see correct behavior?

## Anti-Patterns

**"It should work because..."**
Not evidence. Run it.

**"I made the change so it will pass now"**
Not evidence. Run the tests.

**"The logic is correct"**
Not evidence. See it work.

**"I fixed the same kind of bug before"**
Not evidence for this bug. Verify this fix.

**"Tests were passing before my change"**
They might not be now. Run them again.

## Evidence Format

When reporting completion, include actual evidence:

```
Verification:
- Tests: {N} passing, {0} failing (command: {what you ran})
- Specific: {what you verified and what you saw}
- Regressions: none (full suite passing)
```

## Integration with Agent Workflow

This skill reinforces the SIGN OUT checklist item "Stated build/test results (all passing, or documented what's failing and why)." The difference: this skill requires you to ACTUALLY RUN the verification and SHOW the output, not just state a claim.
