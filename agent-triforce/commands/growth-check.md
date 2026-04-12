---
description: Check growth phase, pre-launch readiness gates, and milestone-gated actions
---

Display the current Agent Triforce growth status. This command is read-only -- it never modifies state.

Run the growth tracker tool and present results from all three subcommands.

## 1. Current Growth Phase

Run `python3 tools/growth-tracker.py status` and display:

- **Current Phase**: Pre-Launch, Soft Launch, Content Momentum, or Community
- **Stars**: Current GitHub star count from growth log
- **Forks**: Current fork count
- **Repo Age**: Days since repository creation

## 2. Pre-Launch Readiness Gates

Run `python3 tools/growth-tracker.py check` and display:

- **Overall Status**: PASS or FAIL
- **Gate Results**: Each gate with pass/fail status and detail message
- If any gate fails, highlight it prominently with the specific failure reason

The gates checked are:
- README exists
- README methodology keywords above the fold (first 200 words)
- CHANGELOG current and complete
- Growth log baseline entry exists

## 3. Milestone Actions

Run `python3 tools/growth-tracker.py milestones` and display:

- **Unlocked Actions**: Milestones already reached, with the next action to take
- **Locked Milestones**: What's still needed (stars, repo age) to unlock each action

Milestones from the growth plan (Appendix E):
- Pre-launch readiness (always unlocked)
- Repo 30 days + 10 stars: hesreallyhim resubmission
- 50 stars: Show HN submission
- 100 stars: Demo video production
- 200 stars: hesreallyhim second attempt
- 300 stars: Product Hunt preparation
- 500 stars: GitHub Discussions launch

## 4. Weekly Logging Reminder

If the most recent growth log entry is more than 7 days old, display a reminder:

> "Growth log is stale. Record this week's metrics with:
> `python3 tools/growth-tracker.py log --stars <count> --forks <count> --visitors <count> --clones <count>`"

Format the output clearly with section headers. Use plain text formatting suitable for terminal display.
