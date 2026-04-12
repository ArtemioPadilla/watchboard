---
name: subagent-orchestration
description: >
  Execute an implementation plan by dispatching fresh subagents per task with
  two-stage review (spec compliance, then code quality). Use for ad-hoc plan
  execution outside the full triforce ceremony.
---

# Subagent Orchestration

Execute the plan at: $ARGUMENTS

## Process

1. **Read the plan file** — extract all tasks with full text
2. **Create task tracking** — one todo per task
3. **For each task:**
   a. Select model tier based on task complexity (see Model Selection below)
   b. Dispatch implementer subagent using `.claude/agents/forja-prompts/implementer-prompt.md`
   c. Handle implementer status (DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED)
   d. Dispatch spec-reviewer subagent using `.claude/agents/forja-prompts/spec-reviewer-prompt.md`
   e. If spec review fails: implementer fixes, re-review (loop until PASS)
   f. Dispatch code-quality-reviewer subagent using `.claude/agents/forja-prompts/code-quality-reviewer-prompt.md`
   g. If quality review fails: implementer fixes Critical/Important issues, re-review
   h. Mark task complete
4. **After all tasks:** run full test suite, verify everything works together

## Model Selection

| Task Signals | Model | Examples |
|---|---|---|
| 1-2 files, complete spec, mechanical | `haiku` | Add a field, write a test, rename |
| Multi-file, integration, judgment needed | `sonnet` | Wire up endpoint, refactor module |
| Architecture, design, broad codebase | `opus` | Design subsystem, complex debug |

## Subagent Dispatch Rules

- **Sequential only** for implementation subagents (avoids file conflicts)
- **Spec review before code quality review** (order matters)
- **Review loops repeat until approved** — no "close enough"
- **Never make subagents read the plan file** — provide full task text in the prompt
- **If implementer asks questions:** answer clearly, then re-dispatch
- **If implementer is BLOCKED:** assess and escalate (don't retry blindly)

## Red Flags

- Starting code quality review before spec compliance passes
- Dispatching multiple implementers in parallel
- Ignoring DONE_WITH_CONCERNS status
- Skipping re-review after implementer fixes
- Forcing retry without changing context, model, or task scope
