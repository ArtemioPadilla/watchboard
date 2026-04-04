View, create, approve, or override approval gates between agents.

Gates enforce formal approval checkpoints in the Agent Triforce workflow:
- **plan-gate**: Prometeo approves Forja's implementation plan before coding begins
- **release-gate**: Centinela signs off before a feature is released

## Usage

### Check gate status
```
/gate check --feature {feature-name} --gate-type {plan-gate|release-gate}
```

### Create a new gate
```
/gate create --feature {feature-name} --gate-type {plan-gate|release-gate} --criteria "Criterion 1" --criteria "Criterion 2"
```

### Approve a gate
```
/gate approve --feature {feature-name} --gate-type {plan-gate|release-gate} --approved-by "{agent or user}"
```

### Override a gate (requires reason)
```
/gate override --feature {feature-name} --gate-type {plan-gate|release-gate} --override-reason "Reason for override"
```

## Gate Documents

Gate documents are stored at `docs/gates/{feature-name}-{gate-type}.md`. They are permanent artifacts (not gitignored) and serve as the audit trail.

## Behavior

Run the appropriate `gate-checker.py` subcommand based on the user's request. If no subcommand is clear from the user's message, run `check` to show the current gate status.

When the user asks to view or check a gate, run:
```bash
python3 ${CLAUDE_PLUGIN_ROOT}/tools/gate-checker.py check --feature {feature} --gate-type {type}
```

When the user asks to create, approve, or override a gate, run the corresponding subcommand.

Display the JSON output in a readable format. For check results, highlight whether the gate PASSED or is BLOCKED.
