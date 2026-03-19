# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Watchboard** — a multi-topic intelligence dashboard platform. Each "tracker" is a self-contained dashboard with its own data, sections, map region, 3D globe, and AI update prompts. Built with Astro 5, TypeScript, and React islands. Data stored as JSON files per tracker, auto-updated via Claude Code Action (Max subscription OAuth).

Active trackers: **Iran Conflict**, **September 11**, **Chernobyl**, **Fukushima**, **Ayotzinapa**, **MH17 Shootdown**, **Mencho/CJNG**, **Culiacanazo**, and more. New trackers can be created in ~25 min via the `init-tracker.yml` GitHub Actions workflow.

## Commands

```bash
npm run dev          # Start dev server
npm run build        # Type-check + build static site to dist/
npm run preview      # Preview built site
npm run update-data  # Run AI data update for all trackers (requires ANTHROPIC_API_KEY or OPENAI_API_KEY)
TRACKER_SLUG=iran-conflict npm run update-data  # Update a single tracker
```

## Deployment & Workflows

- **Build + deploy**: `.github/workflows/deploy.yml` — triggers on push to `main`, builds Astro, deploys `dist/` to GitHub Pages
- **Nightly data update**: `.github/workflows/update-data.yml` — runs at 6 AM UTC, resolves eligible trackers by comparing `updateIntervalDays` vs `update-log.json` lastRun, uses `claude-code-action` with OAuth token
- **Init new tracker**: `.github/workflows/init-tracker.yml` — manual dispatch with slug, topic, start_date, region. Claude Code generates `tracker.json` + empty data files. Auto-chains into seed job.
- **Seed tracker data**: `.github/workflows/seed-tracker.yml` — manual dispatch for comprehensive historical backfill. Claude Code does deep web research and populates all sections.
- All data workflows use `claude-code-action` with `CLAUDE_CODE_OAUTH_TOKEN` (Max subscription) — no per-token API costs
- Each workflow produces a `$GITHUB_STEP_SUMMARY` with data inventory tables
- Legacy: `scripts/update-data.ts` still works with direct API keys (`ANTHROPIC_API_KEY` / `OPENAI_API_KEY`)

## Architecture

```
trackers/{slug}/
  tracker.json           →  src/pages/[tracker]/index.astro  →  Astro components
  data/*.json                (getStaticPaths + loadTrackerData)   (static .astro + React islands)
src/lib/tracker-config.ts  →  src/lib/tracker-registry.ts
  (Zod config schema)         (discovers all trackers at build time)
src/lib/schemas.ts         →  scripts/update-data.ts
  (data Zod schemas)           (AI nightly updater — iterates trackers)
```

### Tracker System

Each tracker is a directory under `trackers/` containing:
- `tracker.json` — config (slug, name, sections, map bounds/categories, globe presets, nav, AI prompts, political avatars, `updateIntervalDays`, `backfillTargets`)
- `data/` — JSON data files (kpis, timeline, map-points, map-lines, etc.)
- `data/events/` — partitioned daily event files (`YYYY-MM-DD.json`)

Key files:
- `src/lib/tracker-config.ts` — `TrackerConfigSchema` (Zod) + types (`TrackerConfig`, `MapCategory`, `CameraPreset`, `NavSection`, `Tab`)
- `src/lib/tracker-registry.ts` — `loadAllTrackers()`, `loadTrackerConfig(slug)`, `getTrackerSlugs()`

### Data Layer (`trackers/{slug}/data/`)

Each tracker has its own data files: `kpis.json`, `timeline.json`, `map-points.json`, `map-lines.json`, `strike-targets.json`, `retaliation.json`, `assets.json`, `casualties.json`, `econ.json`, `claims.json`, `political.json`, `meta.json`. The nightly update script modifies these files directly.

`update-log.json` tracks the last run time and per-section status.

Data loader: `src/lib/data.ts` — `loadTrackerData(slug, eraLabel?)` uses `import.meta.glob` to load all tracker data at build time, validates via Zod, merges partitioned events.

### Schemas (`src/lib/schemas.ts`)

Single source of truth for all data types. Zod schemas are used both by Astro components (via inferred TypeScript types) and the update script (for runtime validation). Key enums are loosened to `z.string()` for multi-tracker extensibility (`cat`, `avatar`, `type`).

### Pages & Routing

- `src/pages/index.astro` — home page: tracker index with cards for each active/archived tracker
- `src/pages/[tracker]/index.astro` — dynamic dashboard per tracker (uses `getStaticPaths()`)
- `src/pages/[tracker]/globe.astro` — 3D globe (only for trackers with `globe.enabled`)
- `src/pages/[tracker]/about.astro` — about page per tracker

### Static Components (`src/components/static/`)

Server-rendered Astro components — zero client-side JS: `Header`, `Hero`, `KpiStrip`, `CasualtyTable`, `EconGrid`, `ClaimsMatrix`, `PoliticalGrid`, `SourceLegend`, `Footer`.

Components accept tracker config as props (navSections, trackerSlug, categories, tabs, etc.) instead of importing hardcoded constants.

### React Islands (`src/components/islands/`)

Client-hydrated interactive components:
- **`TimelineSection.tsx`** — click-to-expand event detail panel
- **`IntelMap.tsx`** — Leaflet map with filter toggles, accepts `categories` prop
- **`MilitaryTabs.tsx`** — tabbed view, accepts `tabs` prop
- **`CesiumGlobe/`** — 3D globe with missile animations, satellites, earthquakes, cinematic event mode (`useCinematicMode.ts`). Globe is fully parameterized — camera presets, categories, and initial view come from `tracker.json` props, not hardcoded.

### Utilities (`src/lib/`)

- `tracker-config.ts` — TrackerConfigSchema + types
- `tracker-registry.ts` — discovers and loads tracker configs
- `data.ts` — `loadTrackerData(slug)` parameterized data loader
- `map-utils.ts` — `geoToSVG()`, `MAP_CATEGORIES`, `generateSparkline()`
- `tier-utils.ts` — `tierClass()`, `tierLabel()`, `contestedBadge()`
- `constants.ts` — `NAV_SECTIONS`, `MIL_TABS` (loaded from default tracker config)
- `timeline-utils.ts` — `flattenTimelineEvents()`, `resolveEventDate()` (supports "Mon DD, YYYY" and "Mon DD" formats)
- `cesium-config.ts` — `configureCesium()`, `CameraPreset` type, `CameraPresetsMap` type (presets come from tracker.json, not hardcoded)

### Adding a new tracker

**Automated (recommended):** Dispatch `init-tracker.yml` from GitHub Actions with slug, topic description, start date, and region. Claude Code generates the full config + empty data files, validates schema, builds, commits, then auto-seeds historical data via a second job. Total ~25 min.

**Manual:**
1. Create `trackers/{slug}/tracker.json` (copy from an existing tracker as template)
2. Define sections (valid IDs: `hero`, `kpis`, `timeline`, `map`, `military`, `casualties`, `economic`, `claims`, `political`)
3. Create `trackers/{slug}/data/` with seed JSON files (at minimum: `meta.json`, empty arrays for unused sections)
4. Run `npm run build` — the tracker auto-discovers and generates pages
5. Dispatch `seed-tracker.yml` to backfill historical data

### Adding a new dashboard section

1. Add Zod schema in `src/lib/schemas.ts`
2. Create component in `src/components/static/` (or `islands/` if interactive)
3. Add section ID to `SectionId` enum in `src/lib/tracker-config.ts`
4. Add conditional render in `src/pages/[tracker]/index.astro`
5. Add to tracker's `sections` array in `tracker.json`
6. Add update function in `scripts/update-data.ts` if it should be auto-updated

## Data Conventions

Every data point carries a source tier classification:
- **Tier 1**: Official/primary (government, UN, IAEA)
- **Tier 2**: Major outlet (Reuters, AP, BBC, CNN)
- **Tier 3**: Institutional (CSIS, HRW, Oxford Economics)
- **Tier 4**: Unverified (social media, unattributed)

Casualty figures use a `contested` field (`'yes'`/`'no'`/`'evolving'`/`'heavily'`/`'partial'`).

## CSS

Global stylesheet at `src/styles/global.css`. Dark theme via CSS custom properties on `:root`. Key color semantics: `--accent-red`, `--accent-amber`, `--accent-blue`, `--accent-green`, `--accent-purple`. Tier colors: `--tier-1` through `--tier-4`. Font paths use `/watchboard/fonts/`.
