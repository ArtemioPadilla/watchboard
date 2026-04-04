---
description: Set up MCP (Model Context Protocol) integrations for static analysis and issue tracking
---

Configure MCP server integrations for the Agent Triforce system. MCP servers connect agents to external tools like SonarQube, CodeScene, Linear, Jira, and GitHub Issues.

**Available MCP Integrations**

| Category | Service | Template | Purpose |
|----------|---------|----------|---------|
| Static Analysis | SonarQube | `templates/mcp/sonarqube.mcp.json` | Code quality metrics, vulnerability data, tech debt hotspots |
| Static Analysis | CodeScene | `templates/mcp/codescene.mcp.json` | Behavioral code analysis, complexity trends |
| Issue Tracking | Linear | `templates/mcp/linear.mcp.json` | Pull ticket details into specs, update status |
| Issue Tracking | Jira | `templates/mcp/jira.mcp.json` | Pull ticket details into specs, update status |
| Issue Tracking | GitHub Issues | `templates/mcp/github-issues.mcp.json` | Link issues to specs and findings |

**Setup Steps**

1. Ask the user which integrations they want to configure.

2. For each selected integration, copy the template to `.mcp.json` in the project root. If `.mcp.json` already exists, merge the new `mcpServers` entries into the existing file.

3. For each integration, the user must set the required environment variables. Never store credentials in configuration files. Guide the user to set these:

   **SonarQube:**
   - `SONARQUBE_URL` -- SonarQube server URL (e.g., `https://sonarqube.example.com`)
   - `SONARQUBE_TOKEN` -- Authentication token
   - `SONARQUBE_PROJECT_KEY` -- Project key in SonarQube

   **CodeScene:**
   - `CODESCENE_URL` -- CodeScene server URL
   - `CODESCENE_TOKEN` -- Authentication token
   - `CODESCENE_PROJECT_ID` -- Project ID in CodeScene

   **Linear:**
   - `LINEAR_API_KEY` -- Linear API key (Settings > API > Personal API keys)
   - `LINEAR_TEAM_ID` -- Team identifier

   **Jira:**
   - `JIRA_URL` -- Jira instance URL (e.g., `https://yourteam.atlassian.net`)
   - `JIRA_EMAIL` -- Account email
   - `JIRA_API_TOKEN` -- API token (not password)
   - `JIRA_PROJECT_KEY` -- Project key

   **GitHub Issues:**
   - `GITHUB_TOKEN` -- Personal access token with `repo` scope
   - `GITHUB_OWNER` -- Repository owner (org or user)
   - `GITHUB_REPO` -- Repository name

4. After configuration, remind the user:
   - MCP configuration is per-project (`.mcp.json` in project root)
   - All credentials use environment variables only -- never stored in config files
   - If an MCP connection is unavailable, agents proceed normally with heuristic analysis
   - The MCP connection is read-only for analysis tools (SonarQube, CodeScene)
   - Issue tracker integration supports read-write for status updates and issue creation

**Templates location**: `templates/mcp/`
