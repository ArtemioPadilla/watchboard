---
description: Display Agent Triforce team configuration, roles, and orchestration info
disable-model-invocation: true
---

# Agent Triforce -- Team Orchestration

## Team Configuration

| Role | Agent | Model | Mode |
|------|-------|-------|------|
| **Lead** | Prometeo (PM) | sonnet | plan |
| **Teammate** | Forja (Dev) | inherit | acceptEdits |
| **Teammate** | Centinela (QA) | sonnet | default |

## Orchestration Mode

**Default Pipeline**: Prometeo -> Forja -> Centinela

When Agent Teams is active, Prometeo acts as team lead and can:
- Delegate implementation tasks to Forja
- Delegate review tasks to Centinela
- Run parallel tasks (e.g., spec feature B while Forja implements feature A)

**Parallel Capable**: Yes -- agents can work on different features simultaneously.

## Inter-Agent Messaging

All handoff messages must include these four fields (from CLAUDE.md Communication Schedule):

1. **What was done**: Summary of work completed
2. **What to watch for**: Known risks, edge cases, concerns
3. **What's needed next**: Explicit expectations for the receiving agent
4. **Open questions**: Anything unresolved that needs the next agent's input

## Communication Paths

| From | To | Trigger |
|------|-----|---------|
| Prometeo | Forja | Spec complete |
| Forja | Prometeo | Spec ambiguity during implementation |
| Forja | Centinela | Implementation complete |
| Centinela | Forja | Review complete |
| Centinela | Prometeo | Business-impacting findings |
| Any agent | User | On ambiguity |

## Checklist Discipline

Checklist pause points (SIGN IN / TIME OUT / SIGN OUT) remain mandatory for each agent in team mode. Parallelism does not bypass checklists.

## Fallback Mode

If Agent Teams is not available in the Claude Code environment, the system gracefully falls back to sequential single-agent mode. No error is raised -- a single informational message explains that parallel orchestration is unavailable.

## Configuration File

Team config: `plugins/agent-triforce/team.json`
Agent configs: `.claude/agents/{prometeo-pm,forja-dev,centinela-qa}.md`
