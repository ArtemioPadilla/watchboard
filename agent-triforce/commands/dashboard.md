---
description: Generate the Agent Triforce system dashboard (HTML overview of specs, reviews, tech debt, checklists, and workflow status)
disable-model-invocation: true
---

Generate the Agent Triforce dashboard by running the dashboard tool in HTML mode. The dashboard provides a comprehensive overview of:

- System health and what's next
- Feature pipeline (specs in progress)
- Quality gate (review verdicts)
- Tech debt register
- Workflow status
- Communication schedule
- Architecture decisions
- Recent activity
- Checklist inventory

Run: `python3 ${CLAUDE_PLUGIN_ROOT}/tools/dashboard.py --html`

If Python 3.9+ is not available, inform the user. The HTML dashboard is zero-dependency and opens automatically in the browser.
