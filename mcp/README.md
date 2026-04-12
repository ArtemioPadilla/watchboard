# Watchboard MCP Server

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server that exposes **Watchboard intelligence data** to AI agents. Query 48+ trackers covering global conflicts, politics, culture, science, and more — directly from Claude Desktop, Cursor, or any MCP-compatible client.

## Quick Start

### Claude Desktop

Add to your Claude Desktop configuration (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "watchboard": {
      "command": "npx",
      "args": ["tsx", "/path/to/watchboard/mcp/server.ts"]
    }
  }
}
```

### Claude Code

```bash
claude mcp add watchboard -- npx tsx /path/to/watchboard/mcp/server.ts
```

### Cursor

Add to `.cursor/mcp.json` in your project:

```json
{
  "mcpServers": {
    "watchboard": {
      "command": "npx",
      "args": ["tsx", "/path/to/watchboard/mcp/server.ts"]
    }
  }
}
```

> **Note:** Replace `/path/to/watchboard` with the absolute path to your Watchboard repository clone.

## Installation

```bash
cd mcp/
npm install
```

For production use, build the TypeScript:

```bash
npm run build
npm start
```

## Available Tools

| Tool | Description |
|------|-------------|
| `watchboard_list_trackers` | List all active trackers with slugs, domains, status, and last update dates |
| `watchboard_get_tracker_summary` | Get a high-level summary: headline, day count, KPI highlights, latest digest |
| `watchboard_get_tracker_events` | Get recent events with titles, dates, sources, and media links |
| `watchboard_get_breaking_news` | Get current breaking news items from all active trackers |
| `watchboard_search_events` | Keyword search across events (optionally filtered by tracker) |
| `watchboard_get_tracker_kpis` | Get structured KPI data: casualty counts, economic indicators, metrics |
| `watchboard_get_tracker_claims` | Get contested claims with opposing perspectives (sideA vs sideB) |

## Available Resources

| URI | Description |
|-----|-------------|
| `watchboard://trackers` | List of all trackers with metadata |
| `watchboard://tracker/{slug}` | Full data for a specific tracker |
| `watchboard://rss` | Latest digest entries across all trackers |

## Example Queries

Once connected, you can ask your AI agent things like:

- *"What's the latest breaking news on Watchboard?"*
- *"Give me a summary of the Gaza war tracker"*
- *"Show me the KPIs for the Ukraine war"*
- *"Search for events about ceasefire across all trackers"*
- *"What are the contested claims in the Iran conflict?"*
- *"List all active conflict trackers"*

## How It Works

The MCP server reads data directly from the `trackers/` directory JSON files — the same data that powers the Watchboard website. No backend or API keys are needed.

Each tracker has:
- `tracker.json` — Configuration (name, domain, status, etc.)
- `data/meta.json` — Current headline, day count, breaking status
- `data/kpis.json` — Key performance indicators
- `data/claims.json` — Contested claims with opposing perspectives
- `data/digests.json` — Daily digest summaries
- `data/events/*.json` — Daily event files with detailed entries

## Data Update Frequency

Watchboard data is updated nightly at **6:00 AM UTC**. The MCP server reads whatever data is on disk, so running `git pull` will get you the latest data.

## Development

```bash
# Run in development mode with auto-reload
npm run dev

# Build for production
npm run build

# Test with MCP Inspector
npx @modelcontextprotocol/inspector node dist/server.js
```

## Requirements

- Node.js 18+
- The Watchboard repository cloned locally (for tracker data)

## License

Same as the Watchboard project.
