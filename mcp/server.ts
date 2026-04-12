#!/usr/bin/env node
/**
 * Watchboard MCP Server
 *
 * Exposes Watchboard intelligence data (48+ trackers covering conflicts,
 * politics, culture, and science) to AI agents via the Model Context Protocol.
 *
 * Data is read from the trackers/ directory JSON files — no backend needed.
 * Designed to run locally via stdio transport.
 */

import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ── Constants ──

const CHARACTER_LIMIT = 50_000;
const DEFAULT_EVENT_LIMIT = 20;
const MAX_EVENT_LIMIT = 100;

// Resolve trackers directory relative to this file (mcp/ is inside the repo root)
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const TRACKERS_DIR = join(REPO_ROOT, "trackers");

// ── Types ──

interface TrackerConfig {
  slug: string;
  name: string;
  shortName: string;
  description: string;
  domain: string;
  status: "active" | "archived" | "draft";
  startDate?: string;
  region?: string;
  country?: string;
  tags?: string[];
  series?: string;
}

interface KpiItem {
  id: string;
  label: string;
  value: string;
  color: string;
  source: string;
  contested: boolean;
  contestNote?: string;
  delta?: string;
  trend?: string;
  lastUpdated?: string;
}

interface ClaimItem {
  id: string;
  question: string;
  sideA: { label: string; text: string };
  sideB: { label: string; text: string };
  resolution?: string;
  lastUpdated?: string;
}

interface DigestEntry {
  date: string;
  title: string;
  summary: string;
  sectionsUpdated?: string[];
  source?: string;
}

interface MetaData {
  operationName?: string;
  dayCount?: number;
  dateline?: string;
  heroHeadline?: string;
  heroSubtitle?: string;
  footerNote?: string;
  lastUpdated?: string;
  breaking?: boolean;
}

interface TimelineEvent {
  id: string;
  date?: string;
  year: string;
  title: string;
  type: string;
  detail: string;
  sources: Array<{ name: string; tier: number; url?: string; pole?: string }>;
  media?: Array<{ type: string; url: string; caption?: string; source?: string }>;
}

// ── Data Loading Utilities ──

function readJsonFile<T>(filePath: string): T | undefined {
  try {
    if (!existsSync(filePath)) return undefined;
    const raw = readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

function loadTrackerConfig(slug: string): TrackerConfig | undefined {
  return readJsonFile<TrackerConfig>(join(TRACKERS_DIR, slug, "tracker.json"));
}

function loadAllTrackerConfigs(): TrackerConfig[] {
  if (!existsSync(TRACKERS_DIR)) return [];
  const dirs = readdirSync(TRACKERS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const configs: TrackerConfig[] = [];
  for (const slug of dirs) {
    const cfg = loadTrackerConfig(slug);
    if (cfg) configs.push(cfg);
  }
  return configs;
}

function loadTrackerKpis(slug: string): KpiItem[] {
  return readJsonFile<KpiItem[]>(join(TRACKERS_DIR, slug, "data", "kpis.json")) ?? [];
}

function loadTrackerClaims(slug: string): ClaimItem[] {
  return readJsonFile<ClaimItem[]>(join(TRACKERS_DIR, slug, "data", "claims.json")) ?? [];
}

function loadTrackerDigests(slug: string): DigestEntry[] {
  return readJsonFile<DigestEntry[]>(join(TRACKERS_DIR, slug, "data", "digests.json")) ?? [];
}

function loadTrackerMeta(slug: string): MetaData | undefined {
  return readJsonFile<MetaData>(join(TRACKERS_DIR, slug, "data", "meta.json"));
}

function loadTrackerEvents(slug: string, limit: number = DEFAULT_EVENT_LIMIT): TimelineEvent[] {
  const eventsDir = join(TRACKERS_DIR, slug, "data", "events");
  if (!existsSync(eventsDir)) return [];

  // List event files sorted descending (most recent first)
  const files = readdirSync(eventsDir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .reverse();

  const events: TimelineEvent[] = [];
  for (const file of files) {
    if (events.length >= limit) break;
    const dayEvents = readJsonFile<TimelineEvent[]>(join(eventsDir, file));
    if (dayEvents) {
      // Tag each event with its date from the filename if not present
      const dateFromFile = file.replace(".json", "");
      for (const evt of dayEvents) {
        if (!evt.date) evt.date = dateFromFile;
        events.push(evt);
        if (events.length >= limit) break;
      }
    }
  }
  return events;
}

function getLastUpdated(slug: string): string | undefined {
  const meta = loadTrackerMeta(slug);
  if (meta?.lastUpdated) return meta.lastUpdated;
  const digests = loadTrackerDigests(slug);
  if (digests.length > 0) return digests[0].date;
  return undefined;
}

/** Search events across one or all trackers by keyword */
function searchEvents(
  query: string,
  trackerSlug?: string,
  limit: number = DEFAULT_EVENT_LIMIT,
): Array<TimelineEvent & { tracker: string }> {
  const queryLower = query.toLowerCase();
  const slugs = trackerSlug
    ? [trackerSlug]
    : loadAllTrackerConfigs()
        .filter((t) => t.status !== "draft")
        .map((t) => t.slug);

  const results: Array<TimelineEvent & { tracker: string }> = [];
  for (const slug of slugs) {
    // Load more events than requested to search through
    const events = loadTrackerEvents(slug, 500);
    for (const evt of events) {
      if (results.length >= limit) return results;
      if (
        evt.title.toLowerCase().includes(queryLower) ||
        evt.detail.toLowerCase().includes(queryLower) ||
        evt.type.toLowerCase().includes(queryLower)
      ) {
        results.push({ ...evt, tracker: slug });
      }
    }
  }
  return results;
}

/** Truncate output if it exceeds the character limit */
function truncateIfNeeded(output: string, hint: string): string {
  if (output.length <= CHARACTER_LIMIT) return output;
  const truncated = output.slice(0, CHARACTER_LIMIT);
  return `${truncated}\n\n[TRUNCATED — response exceeded ${CHARACTER_LIMIT} chars. ${hint}]`;
}

// ── MCP Server ──

const server = new McpServer({
  name: "watchboard-mcp-server",
  version: "1.0.0",
});

// ── Tools ──

server.registerTool(
  "list_trackers",
  {
    title: "List Watchboard Trackers",
    description: `List all Watchboard trackers with their slugs, names, domains, status, and last update dates.

Returns a JSON array of tracker summaries. Use the slug value to query specific trackers with other tools.

Domains include: conflict, politics, culture, science, economics, history, space, sports, tech, country-pulse.
Status values: active (updated regularly), archived (historical, no longer updated), draft (incomplete).

Returns:
  Array of { slug, name, shortName, domain, status, region, country, lastUpdated, tags }

Examples:
  - "Show me all active conflict trackers" → filter by domain="conflict", status="active"
  - "What trackers cover Mexico?" → filter by country or region`,
    inputSchema: {},
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async () => {
    const configs = loadAllTrackerConfigs().filter((t) => t.status !== "draft");
    const trackers = configs.map((t) => ({
      slug: t.slug,
      name: t.name,
      shortName: t.shortName,
      domain: t.domain,
      status: t.status,
      region: t.region,
      country: t.country,
      tags: t.tags,
      lastUpdated: getLastUpdated(t.slug),
    }));

    const output = JSON.stringify(trackers, null, 2);
    return {
      content: [{ type: "text" as const, text: truncateIfNeeded(output, "Use domain/status filters to narrow results.") }],
    };
  },
);

server.registerTool(
  "get_tracker_summary",
  {
    title: "Get Tracker Summary",
    description: `Get a high-level summary for a specific Watchboard tracker including its latest digest, headline, KPI highlights, and day count.

Args:
  - slug (string): Tracker slug (e.g. "gaza-war", "ukraine-war", "sinaloa-fragmentation")

Returns:
  {
    slug, name, shortName, domain, status, dayCount, dateline,
    headline, subtitle, lastUpdated, breaking,
    latestDigest: { date, title, summary },
    kpiCount, claimCount, eventDaysAvailable
  }

Examples:
  - "What's the latest on Gaza?" → slug="gaza-war"
  - "Give me a summary of the Ukraine conflict" → slug="ukraine-war"`,
    inputSchema: {
      slug: z
        .string()
        .min(1)
        .describe("Tracker slug (e.g. 'gaza-war', 'ukraine-war')"),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ slug }: { slug: string }) => {
    const config = loadTrackerConfig(slug);
    if (!config) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: Tracker "${slug}" not found. Use list_trackers to see available trackers.`,
          },
        ],
      };
    }

    const meta = loadTrackerMeta(slug);
    const digests = loadTrackerDigests(slug);
    const kpis = loadTrackerKpis(slug);
    const claims = loadTrackerClaims(slug);

    // Count available event days
    const eventsDir = join(TRACKERS_DIR, slug, "data", "events");
    let eventDaysAvailable = 0;
    if (existsSync(eventsDir)) {
      eventDaysAvailable = readdirSync(eventsDir).filter((f) => f.endsWith(".json")).length;
    }

    const summary = {
      slug: config.slug,
      name: config.name,
      shortName: config.shortName,
      domain: config.domain,
      status: config.status,
      dayCount: meta?.dayCount,
      dateline: meta?.dateline,
      headline: meta?.heroHeadline,
      subtitle: meta?.heroSubtitle,
      lastUpdated: meta?.lastUpdated,
      breaking: meta?.breaking ?? false,
      latestDigest: digests.length > 0 ? digests[0] : null,
      kpiCount: kpis.length,
      claimCount: claims.length,
      eventDaysAvailable,
    };

    return {
      content: [{ type: "text" as const, text: JSON.stringify(summary, null, 2) }],
    };
  },
);

server.registerTool(
  "get_tracker_events",
  {
    title: "Get Tracker Events",
    description: `Get recent events for a Watchboard tracker. Events are sorted most-recent-first and include titles, dates, types, details, sources, and media links.

Args:
  - slug (string): Tracker slug
  - limit (number, optional): Max events to return (1-100, default 20)

Returns:
  Array of {
    id, date, year, title, type, detail,
    sources: [{ name, tier, pole }],
    media?: [{ type, url, caption, source }]
  }

Examples:
  - "Latest 10 events from Gaza" → slug="gaza-war", limit=10
  - "Recent Ukraine events" → slug="ukraine-war"`,
    inputSchema: {
      slug: z.string().min(1).describe("Tracker slug"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(MAX_EVENT_LIMIT)
        .default(DEFAULT_EVENT_LIMIT)
        .describe("Maximum events to return (1-100, default 20)"),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ slug, limit }: { slug: string; limit: number }) => {
    const config = loadTrackerConfig(slug);
    if (!config) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: Tracker "${slug}" not found. Use list_trackers to see available trackers.`,
          },
        ],
      };
    }

    const events = loadTrackerEvents(slug, limit);
    if (events.length === 0) {
      return {
        content: [{ type: "text" as const, text: `No events found for tracker "${slug}".` }],
      };
    }

    const output = JSON.stringify(events, null, 2);
    return {
      content: [
        {
          type: "text" as const,
          text: truncateIfNeeded(output, "Reduce limit parameter to see fewer events."),
        },
      ],
    };
  },
);

server.registerTool(
  "get_breaking_news",
  {
    title: "Get Breaking News",
    description: `Get current breaking news items from all active Watchboard trackers. Returns trackers that have breaking=true in their metadata, along with their latest breaking digest entries.

Returns:
  Array of {
    tracker: slug,
    trackerName,
    headline,
    subtitle,
    lastUpdated,
    breakingDigests: [{ date, title, summary }]
  }

Returns empty array if no trackers currently have breaking news.`,
    inputSchema: {},
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async () => {
    const configs = loadAllTrackerConfigs().filter((t) => t.status === "active");
    const breakingItems: Array<{
      tracker: string;
      trackerName: string;
      headline?: string;
      subtitle?: string;
      lastUpdated?: string;
      breakingDigests: DigestEntry[];
    }> = [];

    for (const cfg of configs) {
      const meta = loadTrackerMeta(cfg.slug);
      if (!meta?.breaking) continue;

      const digests = loadTrackerDigests(cfg.slug);
      const breakingDigests = digests.filter((d) => d.source === "breaking");

      breakingItems.push({
        tracker: cfg.slug,
        trackerName: cfg.shortName,
        headline: meta.heroHeadline,
        subtitle: meta.heroSubtitle,
        lastUpdated: meta.lastUpdated,
        breakingDigests,
      });
    }

    const output = JSON.stringify(breakingItems, null, 2);
    return {
      content: [{ type: "text" as const, text: output }],
    };
  },
);

server.registerTool(
  "search_events",
  {
    title: "Search Events",
    description: `Search for events across Watchboard trackers by keyword. Searches event titles, details, and types. Optionally filter to a specific tracker.

Args:
  - query (string): Search keywords (case-insensitive)
  - tracker (string, optional): Limit search to a specific tracker slug
  - limit (number, optional): Max results (1-100, default 20)

Returns:
  Array of {
    id, date, year, title, type, detail, tracker,
    sources: [{ name, tier, pole }],
    media?: [{ type, url, caption, source }]
  }

Examples:
  - "Find events about ceasefire" → query="ceasefire"
  - "Drone strikes in Gaza" → query="drone strike", tracker="gaza-war"
  - "Trump events across all trackers" → query="trump"`,
    inputSchema: {
      query: z
        .string()
        .min(1)
        .max(200)
        .describe("Search keywords (case-insensitive, matches titles and details)"),
      tracker: z
        .string()
        .optional()
        .describe("Optional: limit search to a specific tracker slug"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(MAX_EVENT_LIMIT)
        .default(DEFAULT_EVENT_LIMIT)
        .describe("Maximum results to return (1-100, default 20)"),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ query, tracker, limit }: { query: string; tracker?: string; limit: number }) => {
    if (tracker) {
      const config = loadTrackerConfig(tracker);
      if (!config) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: Tracker "${tracker}" not found. Use list_trackers to see available trackers.`,
            },
          ],
        };
      }
    }

    const results = searchEvents(query, tracker, limit);
    if (results.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: `No events found matching "${query}"${tracker ? ` in tracker "${tracker}"` : ""}.`,
          },
        ],
      };
    }

    const output = JSON.stringify(results, null, 2);
    return {
      content: [
        {
          type: "text" as const,
          text: truncateIfNeeded(output, "Add a tracker filter or reduce limit to narrow results."),
        },
      ],
    };
  },
);

server.registerTool(
  "get_tracker_kpis",
  {
    title: "Get Tracker KPIs",
    description: `Get structured KPI (Key Performance Indicator) data for a Watchboard tracker. KPIs include casualty counts, economic indicators, military metrics, and other quantitative data points.

Args:
  - slug (string): Tracker slug

Returns:
  Array of {
    id, label, value, color (red/amber/blue/green),
    source, contested (boolean), contestNote?,
    delta?, trend? (up/down/stable), lastUpdated?
  }

Examples:
  - "Gaza casualty numbers" → slug="gaza-war"
  - "Ukraine war metrics" → slug="ukraine-war"`,
    inputSchema: {
      slug: z.string().min(1).describe("Tracker slug"),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ slug }: { slug: string }) => {
    const config = loadTrackerConfig(slug);
    if (!config) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: Tracker "${slug}" not found. Use list_trackers to see available trackers.`,
          },
        ],
      };
    }

    const kpis = loadTrackerKpis(slug);
    if (kpis.length === 0) {
      return {
        content: [{ type: "text" as const, text: `No KPI data found for tracker "${slug}".` }],
      };
    }

    const output = JSON.stringify(kpis, null, 2);
    return {
      content: [{ type: "text" as const, text: output }],
    };
  },
);

server.registerTool(
  "get_tracker_claims",
  {
    title: "Get Tracker Contested Claims",
    description: `Get contested claims for a Watchboard tracker. Each claim presents opposing perspectives (sideA vs sideB) on a disputed question, with optional resolution notes.

This is useful for understanding narratives, propaganda, and information warfare around a conflict or topic.

Args:
  - slug (string): Tracker slug

Returns:
  Array of {
    id, question,
    sideA: { label, text },
    sideB: { label, text },
    resolution?, lastUpdated?
  }

Examples:
  - "What are the disputed claims in Gaza?" → slug="gaza-war"
  - "Contested narratives in Ukraine" → slug="ukraine-war"`,
    inputSchema: {
      slug: z.string().min(1).describe("Tracker slug"),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ slug }: { slug: string }) => {
    const config = loadTrackerConfig(slug);
    if (!config) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: Tracker "${slug}" not found. Use list_trackers to see available trackers.`,
          },
        ],
      };
    }

    const claims = loadTrackerClaims(slug);
    if (claims.length === 0) {
      return {
        content: [{ type: "text" as const, text: `No contested claims found for tracker "${slug}".` }],
      };
    }

    const output = JSON.stringify(claims, null, 2);
    return {
      content: [{ type: "text" as const, text: output }],
    };
  },
);

// ── Resources ──

// Static resource: all trackers list
server.registerResource(
  "all_trackers",
  "watchboard://trackers",
  {
    description: "List of all Watchboard trackers with metadata",
    mimeType: "application/json",
  },
  async () => {
    const configs = loadAllTrackerConfigs().filter((t) => t.status !== "draft");
    const trackers = configs.map((t) => ({
      slug: t.slug,
      name: t.name,
      shortName: t.shortName,
      domain: t.domain,
      status: t.status,
      region: t.region,
      country: t.country,
      lastUpdated: getLastUpdated(t.slug),
    }));
    return {
      contents: [
        {
          uri: "watchboard://trackers",
          mimeType: "application/json",
          text: JSON.stringify(trackers, null, 2),
        },
      ],
    };
  },
);

// Dynamic resource template: individual tracker data
const trackerTemplate = new ResourceTemplate("watchboard://tracker/{slug}", {
  list: async () => {
    const configs = loadAllTrackerConfigs().filter((t) => t.status !== "draft");
    return {
      resources: configs.map((t) => ({
        uri: `watchboard://tracker/${t.slug}`,
        name: `${t.shortName} Tracker`,
        description: `${t.name} — ${t.domain}`,
        mimeType: "application/json",
      })),
    };
  },
});

server.registerResource(
  "tracker_data",
  trackerTemplate,
  {
    description: "Full data for a specific Watchboard tracker including meta, KPIs, claims, and recent digests",
    mimeType: "application/json",
  },
  async (uri, variables) => {
    const slug = (variables.slug as string) ?? uri.href.match(/watchboard:\/\/tracker\/(.+)/)?.[1];
    if (!slug) {
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "text/plain",
            text: "Error: Could not parse tracker slug from URI.",
          },
        ],
      };
    }

    const config = loadTrackerConfig(slug);
    if (!config) {
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "text/plain",
            text: `Error: Tracker "${slug}" not found.`,
          },
        ],
      };
    }

    const data = {
      config,
      meta: loadTrackerMeta(slug),
      kpis: loadTrackerKpis(slug),
      claims: loadTrackerClaims(slug),
      digests: loadTrackerDigests(slug),
      recentEvents: loadTrackerEvents(slug, 10),
    };

    return {
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  },
);

// Static resource: RSS-like feed data
server.registerResource(
  "rss_feed",
  "watchboard://rss",
  {
    description: "Latest digest entries across all trackers (equivalent to RSS feed content)",
    mimeType: "application/json",
  },
  async () => {
    const configs = loadAllTrackerConfigs().filter((t) => t.status !== "draft");
    const items: Array<{ tracker: string; trackerName: string; date: string; title: string; summary: string; source?: string }> = [];

    for (const cfg of configs) {
      const digests = loadTrackerDigests(cfg.slug);
      for (const digest of digests) {
        items.push({
          tracker: cfg.slug,
          trackerName: cfg.shortName,
          date: digest.date,
          title: digest.title,
          summary: digest.summary,
          source: digest.source,
        });
      }
    }

    // Sort by date descending
    items.sort((a, b) => b.date.localeCompare(a.date));

    return {
      contents: [
        {
          uri: "watchboard://rss",
          mimeType: "application/json",
          text: JSON.stringify(items.slice(0, 50), null, 2),
        },
      ],
    };
  },
);

// ── Start Server ──

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Watchboard MCP server running via stdio");
}

main().catch((error: unknown) => {
  console.error("Server error:", error);
  process.exit(1);
});
