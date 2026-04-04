View and manage context loading profiles for Agent Triforce skills.

Context profiles control which sections of CLAUDE.md, agent files, and memory are loaded for each skill invocation, reducing token usage for routine tasks.

## Steps

1. Read `templates/context-profiles.json`
2. Display the profiles in a readable table:

| Skill | Agent | Token Reduction | Memory | Skipped Sections |
|-------|-------|----------------|--------|-----------------|
| {skill} | {agent} | {estimated_reduction} | {memory_setting} | {skipped sections list} |

3. If the user wants to customize a profile:
   - Ask which skill to modify
   - Show current sections loaded vs skipped
   - Allow adding/removing sections from the skip list
   - Save changes to `templates/context-profiles.json`

4. Explain that `--full-context` flag on any skill overrides the profile and loads everything

## Notes

- Profiles are suggestions — they define what CAN be skipped, not enforcement
- `implement-feature` and `release-check` always load full context (0% reduction)
- `checklist-health` has the highest reduction (45%) since it only needs checklist definitions
- Memory settings: `all` (full MEMORY.md), `last_5_entries` (recent only), `none` (skip memory)
