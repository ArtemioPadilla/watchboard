---
name: checklist-health
description: >
  Analyzes checklist effectiveness by tracking hit rates, identifying stale items, and finding
  coverage gaps. Generates evolution suggestions following Boorman's principles. Use periodically
  to keep checklists field-tested and relevant.
context: fork
agent: centinela-qa
---

Run a checklist health analysis across the Agent Triforce system.

Follow these steps:

**SIGN IN:**
- Run the SIGN IN checklist from your agent file
- Note any recent workflow runs or known checklist issues

**READ CHECKLIST DEFINITIONS:**
1. Read all checklist definitions from the 3 agent files:
   - `.claude/agents/prometeo-pm.md` -- extract all checklist sections (SIGN IN, TIME OUT, SIGN OUT, NON-NORMAL)
   - `.claude/agents/forja-dev.md` -- extract all checklist sections
   - `.claude/agents/centinela-qa.md` -- extract all checklist sections
2. For each checklist, record: agent name, checklist name, type (DO-CONFIRM or READ-DO), item count, and each item's text

**READ EVENT HISTORY:**
3. Read `docs/checklist-health/events.jsonl` if it exists
   - If the file does not exist, create `docs/checklist-health/` directory and an empty `events.jsonl` file
   - Each line in events.jsonl follows this schema:
     ```json
     {
       "checklist": "string (e.g., 'forja-dev/Implementation Complete')",
       "item_index": "number (0-based index within the checklist)",
       "item_text": "string (the checklist item text)",
       "workflow_run_id": "string (unique ID for the workflow run)",
       "timestamp": "string (ISO 8601 format)",
       "hit": "boolean (true if this item caught an issue)",
       "confirmed": "boolean (true if the caught issue was a real issue, not false positive)",
       "issue_type": "string (optional, category of the issue caught)"
     }
     ```
4. If fewer than 10 workflow runs are recorded, note this in the report as insufficient data for statistical analysis but proceed with available data

**ANALYZE:**
5. Calculate hit rate per checklist item:
   - Hit rate = (events where hit=true AND confirmed=true) / (total events for that item)
   - Group by checklist, then by item
6. Identify stale items: items with 0 confirmed hits in the last 20 workflow runs
   - These are candidates for removal or rewording
   - Check if the item is a safety-critical "last resort" item (e.g., security checks) -- these should not be removed even with 0 hits
7. Identify coverage gaps:
   - Look at issue types from events where `hit=false` but an issue was found later (post-checklist discovery)
   - Look at recurring issue types in `docs/reviews/` that do not map to any existing checklist item
   - Cross-reference with TECH_DEBT.md for patterns of recurring debt
8. Generate suggested new checklist items for identified gaps:
   - Follow Boorman's principles: simple, verifiable, under 10 words
   - Assign to the most appropriate agent and checklist
   - Mark as "Suggested" -- never auto-add to checklists

**TIME OUT -- Analysis Verification (DO-CONFIRM):**
- [ ] All 3 agent files read and all checklists extracted
- [ ] Event history parsed without errors (or empty state handled)
- [ ] Hit rates calculated correctly (denominator is opportunities, not total events)
- [ ] Stale items identified with context (safety-critical items flagged separately)
- [ ] Coverage gaps cross-referenced with reviews and tech debt
- [ ] Suggested items follow Boorman's principles (simple, verifiable, <10 words)

**GENERATE REPORT:**
9. Write the report to `docs/checklist-health/report-{date}.md` using this structure:

```markdown
# Checklist Health Report -- {YYYY-MM-DD}

## Summary
- Total checklists analyzed: {N}
- Total checklist items: {N}
- Workflow runs in dataset: {N}
- Data sufficiency: {Sufficient (>=10 runs) | Insufficient (<10 runs)}

## Hit Rates by Checklist

### {Agent Name} -- {Checklist Name} ({Type})
| # | Item | Hits | Opportunities | Hit Rate | Status |
|---|------|------|---------------|----------|--------|
| 1 | {item text} | {N} | {N} | {N%} | Active / Stale / Safety-Critical |

## Stale Items (Candidates for Review)
Items with 0 confirmed hits in the last 20 runs:
- [{agent}/{checklist}] Item {N}: "{text}" -- Consider: removal | rewording | reclassify as safety-critical

## Coverage Gaps
Issue types found in reviews/workflow but not covered by any checklist item:
- **{issue type}**: Found {N} times. No corresponding checklist item exists.

## Suggested New Items
| Agent | Checklist | Suggested Item | Rationale |
|-------|-----------|---------------|-----------|
| {agent} | {checklist} | {<10 word item} | {why this item is needed} |

## Recommendations
{Prioritized list of actions: items to remove, items to reword, items to add}
```

**LOG THIS RUN:**
10. Append an event to `docs/checklist-health/events.jsonl` for this analysis run:
    ```json
    {"checklist": "centinela-qa/checklist-health-analysis", "item_index": 0, "item_text": "Checklist health analysis completed", "workflow_run_id": "{generated-id}", "timestamp": "{ISO 8601}", "hit": false, "confirmed": false, "issue_type": "meta-analysis"}
    ```

**SIGN OUT:**
11. Report:
    - Path to generated report
    - Top 3 findings (most stale items, biggest coverage gaps, highest-value suggestions)
    - Whether data is sufficient for reliable analysis
12. Run the SIGN OUT checklist from your agent file
