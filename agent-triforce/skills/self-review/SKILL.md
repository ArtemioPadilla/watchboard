---
name: self-review
description: >
  Inline verification for any written artifact — specs, plans, reviews, docs.
  Runs 4 checks in under 60 seconds. Use on demand outside the triforce flow,
  or rely on TIME OUT checklists during normal agent operations.
---

# Self-Review

Run 4 checks on the artifact at: $ARGUMENTS

## The Protocol (under 60 seconds)

1. **Placeholder scan** — Search for "TBD", "TODO", incomplete sections, vague requirements, `{placeholder}` tokens. Fix each one.
2. **Internal consistency** — Do sections contradict each other? Do names/types match across references? Does architecture match feature descriptions? Fix contradictions.
3. **Scope check** — Is this focused enough for its purpose? Does it try to do too much? If it needs decomposition, flag it.
4. **Ambiguity check** — Could any requirement be interpreted two ways? Pick one interpretation and make it explicit.

## Rules

- **Fix inline, don't re-review.** When you find issues, fix them immediately. Don't run self-review again after fixing. The purpose is "catch the obvious," not "iterate to perfection."
- **This is NOT a subagent dispatch.** Read your own output with fresh eyes. Multi-agent review is a separate concern.
- **Report what you fixed.** After running all 4 checks, briefly state what was found and fixed (or "clean — no issues found").

## Output Format

```
Self-review of {artifact path}:
- Placeholder scan: {clean | fixed N items: list}
- Consistency: {clean | fixed: list}
- Scope: {focused | flagged: reason}
- Ambiguity: {clean | resolved N items: list}
```
