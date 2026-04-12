---
description: Show current workflow status, checklist progress, blockers, and session analytics
---

Display the current Agent Triforce workflow status. This command is read-only -- it never modifies state.

Read and present the following information:

## 1. Workflow State

Read `docs/workflow-state.json` (if it exists) and display:

- **Current Run**: Feature name, run ID, when it started
- **Active Agent**: Which agent is currently working (prometeo-pm, forja-dev, centinela-qa), or "none" if idle
- **Current Phase**: SIGN_IN, IN_PROGRESS, TIME_OUT, or SIGN_OUT
- **Phase History**: List all phases in the current run with their agent, phase, and completion status
- **Checklist Progress**: For each checklist in the current phase, show items completed vs pending vs failed
- **Blockers**: List any active blockers that are preventing progress

If no workflow state file exists, report "No active workflow. Start one with `python3 tools/workflow-tracker.py start <feature>`."

## 2. Most Recent Handoff

Check `docs/handoffs/` for the most recent handoff artifact (by filename timestamp). If found, show:
- From agent -> To agent
- Summary of "What was done"
- Any open questions

If no handoffs directory exists, skip this section.

## 3. Session Analytics

Read the most recent file in `docs/analytics/` (if any exist). Display running totals:
- Estimated tokens per agent
- Estimated session cost
- Number of checklists run
- Number of findings logged

If no analytics data exists, show "No session analytics available. Run `python3 tools/session-tracker.py report` after a workflow session."

## 4. System Health Summary

Provide a quick health check:
- Check if `TECH_DEBT.md` has any Critical/High severity active items
- Check if any review in `docs/reviews/` has verdict "CHANGES REQUIRED"
- Report overall status: HEALTHY, WARNING, or CRITICAL

Format the output clearly with section headers. Use plain text formatting suitable for terminal display.
