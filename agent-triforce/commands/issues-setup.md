---
description: Set up issue tracker integration (Linear, Jira, or GitHub Issues) via MCP
---

Configure issue tracker MCP integration for the Agent Triforce system. Issue trackers connect agents to your project management workflow:

- **Prometeo** pulls ticket details into spec creation
- **Forja** updates ticket status during implementation
- **Centinela** links review findings to open issues and can create new issues for critical findings

**Supported Issue Trackers**

| Tracker | Template | Key Features |
|---------|----------|--------------|
| Linear | `templates/mcp/linear.mcp.json` | Pull ticket details, update status, create issues |
| Jira | `templates/mcp/jira.mcp.json` | Pull ticket details, update status, create issues |
| GitHub Issues | `templates/mcp/github-issues.mcp.json` | Link issues to commits, update status, create issues |

**Setup Steps**

1. Choose which issue tracker(s) to configure. Multiple trackers can be configured simultaneously.

2. Copy the selected template(s) to `.mcp.json` in the project root. If `.mcp.json` already exists, merge the new `mcpServers` entries.

3. Set the required environment variables for each tracker:

   **Linear:**
   ```
   export LINEAR_API_KEY="lin_api_..."
   export LINEAR_TEAM_ID="your-team-id"
   ```
   Get your API key: Linear Settings > API > Personal API keys

   **Jira:**
   ```
   export JIRA_URL="https://yourteam.atlassian.net"
   export JIRA_EMAIL="you@example.com"
   export JIRA_API_TOKEN="your-api-token"
   export JIRA_PROJECT_KEY="PROJ"
   ```
   Get your API token: https://id.atlassian.com/manage-profile/security/api-tokens

   **GitHub Issues:**
   ```
   export GITHUB_TOKEN="ghp_..."
   export GITHUB_OWNER="your-org-or-user"
   export GITHUB_REPO="your-repo"
   ```
   Create a token: https://github.com/settings/tokens (needs `repo` scope)

4. Verify the connection by asking the agent to list recent issues.

**How Agents Use Issue Trackers**

| Agent | Read | Write | When |
|-------|------|-------|------|
| Prometeo | Pull ticket details into specs | -- | During `/agent-triforce:feature-spec` |
| Forja | Read linked issues | Update status, add implementation comments | During SIGN OUT |
| Centinela | Read linked issues | Create issues for Critical/High findings (opt-in) | During review |

**Business Rules**
- Each tracker is configured independently -- all three can be active simultaneously
- Read-write for status updates and issue creation; read-only for ticket content
- Issue creation from Centinela findings is opt-in per run (default: off)
- If no issue tracker is configured, agents proceed normally with no error

**Templates location**: `templates/mcp/`
