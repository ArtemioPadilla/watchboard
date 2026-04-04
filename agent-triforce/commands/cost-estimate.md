---
description: Estimate token cost for an Agent Triforce workflow based on the routing configuration
---

Estimate the token cost for running an Agent Triforce workflow. Reads the routing configuration from `templates/agent-routing.json` to determine which model is assigned to each skill and calculates estimated costs.

**Step 1: Read routing configuration**

Read `templates/agent-routing.json` from the project. If the file does not exist, use the default routing assumptions:
- `code-health`: haiku
- `security-audit`: sonnet
- `feature-spec`: sonnet
- `implement-feature`: user's default model (assume sonnet for estimation)
- `release-check`: haiku
- `review-findings`: user's default model (assume sonnet for estimation)
- `generate-tests`: sonnet

**Step 2: Determine workflow type**

Ask the user (or infer from context) which workflow they want to estimate. Common workflows:

| Workflow | Skills Involved |
|----------|----------------|
| Full feature (PM -> Dev -> QA) | `feature-spec` + `implement-feature` + `security-audit` |
| Code health scan | `code-health` |
| Security audit only | `security-audit` |
| Release check | `release-check` |
| Implement + review | `implement-feature` + `review-findings` |
| Test generation | `generate-tests` |

**Step 3: Calculate estimate**

For each skill in the workflow:
1. Look up the assigned model from routing config
2. Look up average token counts from `averageTokensPerSkill` in the config
3. Calculate: `(input_tokens / 1M * inputPer1M) + (output_tokens / 1M * outputPer1M)`
4. Sum all skills for total estimated cost

**Step 4: Present results**

Display a table showing:

```
Workflow: [workflow type]

| Skill | Model | Est. Input | Est. Output | Est. Cost |
|-------|-------|-----------|------------|-----------|
| ...   | ...   | ...       | ...        | $X.XX     |

Total estimated cost: $X.XX - $X.XX (+/- 30% margin)
```

**Important notes:**
- Cost estimates use average token counts from benchmark runs, not real-time prediction
- Actual usage varies based on codebase size, spec complexity, and conversation length
- Estimates have a +/- 30% margin of error
- If a configured model is not available in the user's plan, the system falls back to the most capable available model
- Model override with `--model opus` applies to a single run only

**Configuration file**: `templates/agent-routing.json`
