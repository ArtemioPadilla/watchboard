---
description: View and resolve cross-agent memory conflicts (detects when agents hold contradictory assessments of the same entity)
disable-model-invocation: true
---

Check for cross-agent memory conflicts by running the memory sync tool. This detects when two or more agents hold contradictory assessments of the same entity (e.g., one agent considers a module "stable" while another flagged it as "fragile").

Run: `python3 ${CLAUDE_PLUGIN_ROOT}/tools/memory-sync.py check`

For JSON output: `python3 ${CLAUDE_PLUGIN_ROOT}/tools/memory-sync.py check --json`

To resolve a conflict:
- `python3 ${CLAUDE_PLUGIN_ROOT}/tools/memory-sync.py resolve <conflict-id> a` -- Accept agent A's assessment
- `python3 ${CLAUDE_PLUGIN_ROOT}/tools/memory-sync.py resolve <conflict-id> b` -- Accept agent B's assessment
- `python3 ${CLAUDE_PLUGIN_ROOT}/tools/memory-sync.py resolve <conflict-id> investigate` -- Mark as under investigation

To view all memory entries: `python3 ${CLAUDE_PLUGIN_ROOT}/tools/memory-sync.py show`

Resolved conflicts are archived to `docs/memory-archive/` with full context for audit trail.
