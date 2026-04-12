---
description: Display the Agent Triforce checklist methodology reference
disable-model-invocation: true
---

# Agent Triforce — Checklist Methodology

This system applies principles from *The Checklist Manifesto* (Atul Gawande) and Boeing's checklist engineering (Daniel Boorman).

## Core Philosophy

- **Ineptitude, not ignorance**: Failures come from not applying what we already know
- **Checklists supplement expertise**: Reminders of the most critical steps — not comprehensive how-to guides
- **FLY THE AIRPLANE**: Step 1 of any emergency is to remember your primary mission
- **Discipline is professionalism**: Consulting a checklist, no matter how experienced you are, is what separates reliable systems from fragile ones

## Checklist Design Rules (Boorman's Principles)

1. **Clear pause point**: A specific moment where you STOP and consult the checklist
2. **5-9 killer items only**: The steps most dangerous to skip
3. **Under 60 seconds**: If it takes longer, it will be skipped
4. **Simple, exact wording**: Concrete, verifiable actions
5. **DO-CONFIRM or READ-DO**: Every checklist declares its type
6. **Field-tested and updated**: Evolve based on actual failures

## Two Checklist Types

- **DO-CONFIRM**: Do your work, then PAUSE and run the checklist to confirm nothing was missed
- **READ-DO**: Read each item and do it step by step

## Three Pause Points (WHO Surgical Safety Model)

Every agent invocation has three mandatory pause points:

1. **SIGN IN** (DO-CONFIRM): Before starting. State identity, role, task, concerns. Read memory and relevant docs.
2. **TIME OUT** (varies): Mid-workflow verification. Stop, run the checklist, fix failures before proceeding.
3. **SIGN OUT** (DO-CONFIRM): Before finishing. Update memory, confirm deliverables, prepare handoff.

## Workflow: Standard Feature Flow

```
PM  SIGN IN → spec → TIME OUT: Spec Completion → SIGN OUT
  → Dev SIGN IN → implement → TIME OUT: Implementation Complete → TIME OUT: Pre-Delivery → SIGN OUT
    → QA  SIGN IN → audit → TIME OUT: Security + Quality Verification → SIGN OUT
      → Dev SIGN IN → fix → TIME OUT → SIGN OUT
        → QA  SIGN IN → re-verify → SIGN OUT
```

## Workflow: Code Health Flow

```
QA  SIGN IN → scan → TIME OUT: Scan Complete → SIGN OUT
  → Dev SIGN IN → cleanup → TIME OUT: Pre-Delivery → SIGN OUT
    → QA  SIGN IN → verify → SIGN OUT
```

## Communication Schedule

| From | To | When | What |
|---|---|---|---|
| Prometeo | Forja | Spec complete | Spec path, priority, constraints, open questions |
| Forja | Prometeo | Spec ambiguity | Specific ambiguities, proposed assumptions |
| Forja | Centinela | Implementation complete | Files changed, how to test, security concerns |
| Centinela | Forja | Review complete | Verdict, findings by priority, fix order |
| Centinela | Prometeo | Business-impacting findings | Quality state, release recommendation |
| Any agent | User | On ambiguity | Concrete options with trade-offs (never guess) |

## Error Recovery (Non-Normal Checklists)

When normal operations fail, switch to READ-DO error recovery. Step 1 is always FLY THE AIRPLANE:

- **Prometeo**: "STOP — list the specific ambiguities, don't guess"
- **Forja**: "Read the actual error message, don't guess"
- **Centinela**: "Document the vulnerability before attempting to fix"

## Agents & Checklists (24 total, 117 items)

| Agent | Role | Checklists |
|---|---|---|
| **Prometeo** (PM) | Product strategy, specs, prioritization | 6 checklists |
| **Forja** (Dev) | Architecture, implementation, infrastructure | 9 checklists |
| **Centinela** (QA) | Security audit, code review, compliance | 9 checklists |

## Skills

| Skill | Agent | Purpose |
|---|---|---|
| `/agent-triforce:feature-spec` | Prometeo | Create feature specifications |
| `/agent-triforce:implement-feature` | Forja | Implement features from specs |
| `/agent-triforce:review-findings` | Forja | Fix QA review findings |
| `/agent-triforce:security-audit` | Centinela | Deep security audit |
| `/agent-triforce:code-health` | Centinela | Dead code, tech debt, hygiene |
| `/agent-triforce:release-check` | Centinela | Pre-release verification gate |
| `/agent-triforce:generate-tests` | Forja | Generate tests for a module or function |
| `/agent-triforce:checklist-health` | Centinela | Analyze checklist effectiveness and evolution |
| `/agent-triforce:simulate-failure` | Centinela | Non-Normal procedure training simulation |
