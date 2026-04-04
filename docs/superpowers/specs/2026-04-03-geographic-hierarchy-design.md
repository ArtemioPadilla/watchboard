# Geographic Hierarchy & Drill-Down Navigation

**Date:** 2026-04-03
**Status:** Approved

## Summary

Add geographic hierarchy to Watchboard so users can browse trackers at any scale — from continent down to neighborhood. A new "Geographic" view mode in the Command Center sidebar groups trackers by location with accordion drill-down, synchronized with the globe. Parent geographic nodes aggregate data from child trackers at build time. The architecture supports curated, auto-scaffolded, and future community-contributed trackers.

## Motivation

With 48+ trackers, the flat sidebar list doesn't help users find trackers relevant to where they live. Someone in Culiacán should be able to zoom from World → Mexico → Sinaloa → Culiacán and see all relevant intelligence at each level. This also opens a path for community-contributed local trackers.

## Data Model Changes

### New fields in `TrackerConfigSchema` (`src/lib/tracker-config.ts`)

```typescript
// Geographic hierarchy
state: z.string().optional(),         // Free-text, human-readable (e.g., "Sinaloa")
city: z.string().optional(),          // Free-text, human-readable (e.g., "Culiacán")
neighborhood: z.string().optional(),  // Free-text, human-readable (e.g., "Colonia Centro")
geoPath: z.array(z.string()).optional(), // Machine-readable hierarchy ["MX", "Sinaloa", "Culiacán"]

// Aggregation
aggregate: z.boolean().optional().default(false), // True = roll-up node

// Multi-country support
geoSecondary: z.array(z.string()).optional(), // Additional country codes for cross-border trackers

// Future community hooks
author: z.string().optional(),        // "core" (default) or GitHub username
visibility: z.enum(["public", "unlisted"]).optional().default("public"),
```

### Existing fields (unchanged)

- `region` — broad continental zone (`north-america`, `middle-east`, etc.), still used for top-level grouping
- `country` — ISO 2-letter code, stays as-is

### Validation rules

- `geoPath[0]` must equal `country` when both are present (schema-level `superRefine`)
- `geoPath` length determines depth: 1 = country, 2 = state, 3 = city, 4 = neighborhood
- A non-aggregate tracker's `geoPath` cannot claim a level already occupied by an aggregate tracker (prevents community trackers from overriding curated parents)

### Edge cases

- **Multi-country trackers** (e.g., `india-pakistan-conflict`): `geoPath` is omitted. These appear in Geographic mode under both countries via a `geoSecondary` array (`["IN", "PK"]`), displayed as "also in" links. Primary grouping uses `country`.
- **Global trackers** (e.g., `world-war-2`, `covid-pandemic`): `geoPath` omitted, `region: "global"`. These appear in a top-level "Global" section in Geographic mode, above the continent groups.
- **Trackers without `country`** (e.g., `quantum-theory`): no geographic placement. Only visible in Operations and Domain modes.

### Example: Culiacanazo tracker after migration

```json
{
  "slug": "culiacanazo",
  "country": "MX",
  "state": "Sinaloa",
  "city": "Culiacán",
  "geoPath": ["MX", "Sinaloa", "Culiacán"],
  "aggregate": false
}
```

## Three-Tier Tracker System

### Tier 1 — Full Tracker (today's model)

Hand-crafted `tracker.json` + `data/` folder. Nightly AI updates. `aggregate: false`. This is every existing tracker.

Examples: `culiacanazo`, `iran-conflict`, `ukraine-war`.

### Tier 2 — Aggregate Tracker (new)

Minimal `tracker.json` with `aggregate: true`. No `data/` folder required initially. Build step auto-generates dashboard content by merging child tracker data.

```
trackers/mexico/
  tracker.json    ← minimal config, aggregate: true
  data/           ← optional, curated national-level data added over time
```

Example config:

```json
{
  "slug": "mexico",
  "name": "Mexico",
  "shortName": "Mexico",
  "description": "Geographic hub for all Mexico trackers",
  "icon": "🇲🇽",
  "status": "active",
  "temporal": "live",
  "domain": "conflict",
  "region": "north-america",
  "country": "MX",
  "geoPath": ["MX"],
  "aggregate": true,
  "sections": ["hero", "kpis", "timeline", "map"],
  "navSections": [{"id": "kpis", "label": "Overview"}],
  "map": { "enabled": true, "bounds": { "lonMin": -118, "lonMax": -86, "latMin": 14, "latMax": 33 }, "center": { "lon": -102, "lat": 23.5 }, "categories": [] }
}
```

**Build-time aggregation logic** (in `src/lib/data.ts`):

- `loadTrackerData()` gains a `resolveAggregateData(slug)` code path
- Finds children: all trackers whose `geoPath` starts with this tracker's `geoPath`
- Merges:
  - **KPIs**: configurable per KPI — sum, max, or latest
  - **Events**: union of child events, deduplicated by date + title similarity
  - **Map points**: union of all child map points
  - **Casualties**: summed
- Curated data in the aggregate's own `data/` folder takes precedence; merged data fills gaps
- All aggregation happens at build time — zero runtime cost

**Upgrade path:** Tier 2 → Tier 1 by adding curated data. Can keep `aggregate: true` to still roll up children alongside its own data.

### Tier 3 — Virtual Node (no tracker.json)

If 3+ trackers share a `geoPath` prefix and no Tier 1/2 tracker exists at that level, the build step generates a lightweight index page. Not a full dashboard — just a hero card, map with child tracker points, and a card list of children.

No entry in `trackers/`, no nightly jobs, no maintenance cost.

**Upgrade path:** Tier 3 → Tier 2 by running `init-tracker.yml` with `aggregate: true`.

## Geographic View Mode in Command Center

### Mode toggle

Three view modes at the top of the sidebar, replacing the current domain tab strip position:

- **OPERATIONS** (default) — today's grouping: Live / Series / Historical / Archived
- **GEOGRAPHIC** — accordion tree grouped by `geoPath`
- **DOMAIN** — grouped by domain (conflict, security, etc.)

The current domain tabs become the DOMAIN mode. The mode toggle is a pill row.

### Geographic mode accordion behavior

1. **Top level**: continents/regions derived from `region` field (Americas, Middle East, Europe...)
2. **Expand region** → countries with tracker counts (🇲🇽 Mexico · 8 trackers)
3. **Expand country** → states (if any trackers have `state`), otherwise flat tracker list
4. **Expand state** → cities (if any), otherwise trackers
5. **Expand city** → neighborhoods (if any), otherwise trackers
6. Each level shows its aggregate/parent tracker (if one exists) as the first item, styled distinctly from child folder nodes
7. Leaf trackers render as today's `TrackerRow` component

### Globe integration

- In Geographic mode, clicking a region/country on the globe expands that node in the sidebar and flies the camera there
- Hovering a geographic group in the sidebar highlights the region on the globe
- Globe shows country boundaries with opacity proportional to tracker density

### Search

Works across all modes. Typing "Sinaloa" filters to matching trackers regardless of current view mode.

### URL persistence

Mode stored in URL hash (`#geo`, `#domain`). Default (no hash) = Operations.

### Mobile

Mode toggle becomes a swipeable pill row. Accordion groups have larger tap targets for touch.

## Routing & Pages

### Existing routes (unchanged)

- `/[tracker]/` — every Tier 1 and Tier 2 tracker keeps its own dashboard page

### New geographic routes

- `/geo/` — world overview. Map with clickable regions, list of continents with tracker counts.
- `/geo/[country]/` — country page. If Tier 2 aggregate exists, renders its dashboard. If Tier 3 virtual, renders `GeoIndex.astro` (lightweight index with map + child cards).
- `/geo/[country]/[state]/` — same logic as country level.
- `/geo/[country]/[state]/[city]/` — same logic, one more level.

### `getStaticPaths()` generation

- Scans all trackers' `geoPath` arrays
- For each unique prefix, generates a route
- If a matching `aggregate: true` tracker exists → renders full dashboard template
- If not → renders lightweight `GeoIndex.astro` template

### Breadcrumbs

Every tracker dashboard gets a geographic breadcrumb in the hero section:

```
📍 Mexico › Sinaloa › Culiacán
```

Each segment links to the corresponding `/geo/` route.

### Linking

- Aggregate dashboards show a "Sub-regions" section listing children as cards
- Command Center geographic mode links to `/geo/` routes on double-click
- No impact on existing URLs — `/iran-conflict/` still works as-is

## Community Contribution (future, out of scope)

### What the current design enables without extra work

- Contributor forks repo, creates `tracker.json` with `geoPath`, opens PR
- Zod validation catches schema errors in CI
- `geoPath` validation ensures correct nesting
- Build step auto-generates virtual index pages for new geo levels

### Out of scope (build later)

- Web form at `/contribute/` that generates `tracker.json` and opens a GitHub PR
- `seed-community-tracker.yml` workflow variant with lower resource limits
- Moderation: draft status by default, owner approves to activate
- Rate limiting on nightly updates for community trackers (longer `updateIntervalDays`)

### Architectural hooks included now

- `author` field — distinguishes core vs community trackers
- `visibility` field — `"public"` (default) vs `"unlisted"` (accessible by URL, hidden from sidebar/geo index)
- `geoPath` validation prevents community trackers from overriding curated parent aggregates

## Migration Plan

### Existing tracker updates

All ~48 existing trackers need `geoPath` added based on their current `country`, plus `state`/`city` where applicable. Examples:

| Tracker | country | geoPath | state | city |
|---|---|---|---|---|
| `iran-conflict` | IR | `["IR"]` | — | — |
| `culiacanazo` | MX | `["MX", "Sinaloa", "Culiacán"]` | Sinaloa | Culiacán |
| `sinaloa-fragmentation` | MX | `["MX", "Sinaloa"]` | Sinaloa | — |
| `september-11` | US | `["US", "New York", "New York City"]` | New York | New York City |
| `ukraine-war` | UA | `["UA"]` | — | — |

### New aggregate trackers to create

Start with countries that have 3+ existing trackers:
- `trackers/mexico/tracker.json` — `aggregate: true`, `geoPath: ["MX"]`
- `trackers/united-states/tracker.json` — `aggregate: true`, `geoPath: ["US"]`

### Backward compatibility

- `aggregate` defaults to `false` — all existing trackers unchanged
- `geoPath` is optional — trackers without it simply don't appear in geographic grouping
- Operations mode remains the default — no UX change for existing users
- All existing URLs remain valid

## Files to Create or Modify

### New files
- `src/pages/geo/index.astro` — world overview page
- `src/pages/geo/[...path].astro` — catch-all for `/geo/MX/`, `/geo/MX/Sinaloa/`, etc.
- `src/components/static/GeoIndex.astro` — lightweight index template for virtual nodes
- `src/components/static/GeoBreadcrumb.astro` — breadcrumb component
- `src/lib/geo-utils.ts` — `buildGeoTree()`, `resolveGeoNode()`, `findChildren()`, `aggregateData()`

### Modified files
- `src/lib/tracker-config.ts` — add `state`, `city`, `neighborhood`, `geoPath`, `aggregate`, `author`, `visibility` to schema
- `src/lib/tracker-directory-utils.ts` — add `groupTrackersByGeo()` function, add geo fields to `TrackerCardData`
- `src/lib/data.ts` — add aggregate data resolution in `loadTrackerData()`
- `src/lib/schemas.ts` — no changes needed (data schemas stay the same, aggregation reuses them)
- `src/components/islands/CommandCenter/SidebarPanel.tsx` — add mode toggle, geographic accordion view
- `src/components/islands/CommandCenter/CommandCenter.tsx` — wire mode state, pass to sidebar
- `src/components/islands/CommandCenter/GlobePanel.tsx` — add region click handler, highlight sync
- `src/pages/[tracker]/index.astro` — add GeoBreadcrumb to hero
- `src/pages/index.astro` — pass geo fields to CommandCenter serialization
- `trackers/*/tracker.json` — add `geoPath` (and `state`/`city` where applicable) to all ~48 trackers
