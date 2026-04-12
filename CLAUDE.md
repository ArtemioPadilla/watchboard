# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Watchboard** — a multi-topic intelligence dashboard platform. Each "tracker" is a self-contained dashboard with its own data, sections, map region, 3D globe, and AI update prompts. Built with Astro 5, TypeScript, and React islands. Data stored as JSON files per tracker, auto-updated via Claude Code Action (Max subscription OAuth).

Active trackers: **Iran Conflict**, **September 11**, **Chernobyl**, **Fukushima**, **Ayotzinapa**, **MH17 Shootdown**, **Mencho/CJNG**, **Culiacanazo**, and more. New trackers can be created in ~25 min via the `init-tracker.yml` GitHub Actions workflow.

## Commands

```bash
npm run dev          # Start dev server
npm run build        # Type-check + build static site to dist/ (postbuild runs pagefind indexing)
npm run preview      # Preview built site
npm run update-data  # Run AI data update for all trackers (requires ANTHROPIC_API_KEY or OPENAI_API_KEY)
TRACKER_SLUG=iran-conflict npm run update-data  # Update a single tracker
npm run backfill-media              # Enrich all events with og:image from source URLs
npm run backfill-media -- --dry-run # Preview what would change without writing
npm run backfill-media -- --tracker iran-conflict  # Single tracker only
```

## Deployment & Workflows

- **Build + deploy**: `.github/workflows/deploy.yml` — triggers on push to `main`, builds Astro, deploys `dist/` to GitHub Pages
- **Nightly data update**: `.github/workflows/update-data.yml` — runs at **14:00 UTC daily**, 3-phase pipeline:
  1. **Resolve** — finds eligible trackers, generates sibling brief (cross-tracker context) + review manifests (event gap detection)
  2. **Update** (matrix) — parallel jobs, 1 per tracker (max 5 concurrent), each with 50-turn budget via `claude-code-action`
  3. **Finalize** — downloads artifacts, validates JSON + Zod, runs fix agent if validation fails (1 retry), build gate (`npm run build`), commits data, collects + commits ingestion metrics
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
- `tracker.json` — config (slug, name, sections, map bounds/categories, globe presets, nav, AI prompts, political avatars, `updateIntervalDays`, `backfillTargets`, `ai.relatedTrackers`)
- `data/` — JSON data files (kpis, timeline, map-points, map-lines, etc.)
- `data/events/` — partitioned daily event files (`YYYY-MM-DD.json`)

Key files:
- `src/lib/tracker-config.ts` — `TrackerConfigSchema` (Zod) + types (`TrackerConfig`, `MapCategory`, `CameraPreset`, `NavSection`, `Tab`)
- `src/lib/tracker-registry.ts` — `loadAllTrackers()`, `loadTrackerConfig(slug)`, `getTrackerSlugs()`

### Data Layer (`trackers/{slug}/data/`)

Each tracker has its own data files: `kpis.json`, `timeline.json`, `map-points.json`, `map-lines.json`, `strike-targets.json`, `retaliation.json`, `assets.json`, `casualties.json`, `econ.json`, `claims.json`, `political.json`, `meta.json`, `digests.json`. The nightly update script modifies these files directly.

`update-log.json` tracks the last run time and per-section status.

`digests.json` stores RSS digest entries (date, title, summary, sectionsUpdated). The nightly updater prepends a new entry after each data update. These feed the site's RSS endpoints.

Data loader: `src/lib/data.ts` — `loadTrackerData(slug, eraLabel?)` uses `import.meta.glob` to load all tracker data at build time, validates via Zod, merges partitioned events. Cross-field validation: strike/retaliation map-lines must have `weaponType` + `time`.

### Event Media

Events can include a `media` array of `MediaItemSchema` objects: `{ type: "image"|"video"|"article", url, caption?, source?, thumbnail? }`. Media is displayed across multiple surfaces:

**Data supply:**
- Nightly pipeline (STEP 3.5 in `update-data.yml`) instructs Claude to populate `media` on significant events with article URLs and og:image thumbnails from Tier 1-2 sources
- `scripts/backfill-media.ts` enriches existing events by fetching `og:image` meta tags from source URLs
- `latestEventMedia` is extracted at build time in `index.astro` (Tier 1-2 sources only) and passed to homepage components via `TrackerCardData`

**Display surfaces (with source attributions):**
- `MapFactCards.tsx` — thumbnail on map overlay cards (auto from event media)
- `MapEventsPanel.tsx` / `CesiumEventsPanel.tsx` — media gallery in expanded event detail
- `MobileStoryCarousel.tsx` — 3-tier image fallback (event media → OSM tile → gradient)
- `BroadcastOverlay.tsx` — 72px thumbnail in lower-third (event media → OSM tile)
- `TimelineSection.tsx` — image strip in expanded timeline detail
- `SidebarPanel.tsx` — thumbnail in expanded tracker row
- `TrackerDirectory.tsx` — card image (event media → OSM tile)

**Validation:** Nightly finalize step runs HEAD requests against media URLs (non-blocking, logs broken URLs as warnings).

### Schemas (`src/lib/schemas.ts`)

Single source of truth for all data types. Zod schemas are used both by Astro components (via inferred TypeScript types) and the update script (for runtime validation). Key enums are loosened to `z.string()` for multi-tracker extensibility (`cat`, `avatar`, `type`).

Important schema constraints:
- `DateFieldSchema` rejects future dates via `.refine()`
- `MapLineSchema.superRefine()` requires `weaponType` + `time` for `strike`/`retaliation` lines
- `year` field on events is `z.string()` (NOT number) — common AI error
- `direction` on econ is `"up" | "down"` only (NOT `"stable"`)
- `pole` on sources is `"western" | "middle_eastern" | "eastern" | "international"` only

Metrics schemas: `MetricsRunSchema`, `MetricsIndexEntrySchema`, `MetricsInventorySchema`, `MetricsValidationErrorSchema`.

### Pages & Routing

- `src/pages/index.astro` — home page: tracker index with cards for each active/archived tracker
- `src/pages/[tracker]/index.astro` — dynamic dashboard per tracker (uses `getStaticPaths()`)
- `src/pages/[tracker]/globe.astro` — 3D globe (only for trackers with `globe.enabled`)
- `src/pages/[tracker]/about.astro` — about page per tracker
- `src/pages/search.astro` — full-text search page (Pagefind UI, dark themed)
- `src/pages/metrics.astro` — ingestion metrics dashboard (Salesforce-style status page)
- `src/pages/rss.xml.ts` — global RSS feed (all tracker digests)
- `src/pages/[tracker]/rss.xml.ts` — per-tracker RSS feed

### Static Components (`src/components/static/`)

Server-rendered Astro components — zero client-side JS: `Header`, `Hero`, `KpiStrip`, `CasualtyTable`, `EconGrid`, `ClaimsMatrix`, `PoliticalGrid`, `SourceLegend`, `Footer`.

Components accept tracker config as props (navSections, trackerSlug, categories, tabs, etc.) instead of importing hardcoded constants.

### React Islands (`src/components/islands/`)

Client-hydrated interactive components:
- **`TimelineSection.tsx`** — click-to-expand event detail panel
- **`IntelMap.tsx`** — Leaflet map with filter toggles, accepts `categories` prop
- **`MilitaryTabs.tsx`** — tabbed view, accepts `tabs` prop
- **`MetricsDashboard.tsx`** — Salesforce-style ingestion status page with uptime calendar, KPI cards, per-tracker health table, expandable run log, error trend chart
- **`CesiumGlobe/`** — 3D globe with missile animations, satellites, earthquakes, cinematic event mode (`useCinematicMode.ts`). Globe is fully parameterized — camera presets, categories, and initial view come from `tracker.json` props, not hardcoded.
- **`BroadcastOverlay.tsx`** — TV news broadcast mode for homepage globe. Lower-third headlines, scrolling ticker, LIVE badge. Auto-cycles through trackers with smooth globe fly-tos. Uses `useBroadcastMode.ts` hook (state machine: idle → transitioning → dwelling). Toggle with `B` key.
- **`MobileStoryCarousel.tsx`** — Instagram Stories-style carousel on mobile homepage. Circle avatar row, auto-advancing story cards (10s), 3-tier image fallback (verified event media → OSM map tile → domain gradient), swipe-up to open tracker.

### Nightly Update Pipeline

Three-phase matrix pipeline in `.github/workflows/update-data.yml`:

**Phase 1 — Resolve:**
- Finds eligible trackers (`updateIntervalDays` vs `lastRun`)
- `scripts/generate-sibling-brief.ts` — auto-detects related trackers by keyword overlap in `searchContext`, with manual override via `ai.relatedTrackers`. Outputs `/tmp/sibling-brief.json`
- `scripts/generate-review-manifest.ts` — per-tracker event gap detection. Window: `min(max(days_since_last_run, 7), 30)`. Outputs `trackers/{slug}/data/review-manifest.json` (gitignored)

**Phase 2 — Update (matrix):**
- 1 job per tracker, max 5 concurrent, each with 50-turn budget
- AI reads sibling brief to avoid cross-tracker event duplication
- AI reads review manifest (STEP 2.5) to verify event dates, deduplicate ±2 days, backfill gaps
- Uploads changed `trackers/{slug}/data/` as artifact

**Phase 3 — Finalize:**
- Downloads all tracker artifacts, applies to working tree
- Validates JSON syntax + Zod schemas (captures errors as structured JSON)
- **Fix agent** (1 retry): if Zod fails, dispatches lightweight Claude Code agent with 15 turns to fix schema errors using a pattern library (type coercions, invalid enums, missing fields)
- Re-validates after fix
- **Build gate**: runs `npm run build` before commit to catch runtime errors Zod misses
- Commits data (if valid)
- **Metrics collection** (runs always): writes per-run JSON to `public/_metrics/runs/`, updates `public/_metrics/index.json`, prunes entries >90 days
- Commits metrics (separate commit, runs always)

### Ingestion Metrics (`public/_metrics/`)

Per-run JSON files with datetime filenames, served as static assets from GitHub Pages:
- `public/_metrics/index.json` — array of `{file, timestamp, status, trackerCount, errorCount}`, 90-day retention
- `public/_metrics/runs/YYYY-MM-DDTHH-MM-SSZ.json` — full run data including validation errors, fix agent result, per-tracker inventory

Metrics page at `/metrics/` (`src/components/islands/MetricsDashboard.tsx`) fetches these at runtime — no build dependency, so metrics from runs after the last deploy are still visible.

### Social Command Center (`/social/`)

AI-curated social media posting system. Replaces the old `generate-social-drafts.ts` + `post-social.ts` pipeline.

**Architecture:**
- `social-config.json` — all config (budget, scheduling, judge thresholds, hashtags, languages)
- `scripts/generate-social-queue.ts` — reads tracker digests + budget + history, builds LLM prompt, produces curated tweet queue
- `scripts/post-social-queue.ts` — reads queue, posts due tweets via X API, updates budget + history
- `scripts/generate-stat-card.ts` — branded stat card PNGs for breaking/data-viz tweets (satori + resvg)
- `scripts/social-types.ts` — shared types and utilities
- `public/_social/queue-YYYY-MM-DD.json` — daily tweet queue with judge assessments
- `public/_social/budget.json` — monthly spend tracking ($1/month target)
- `public/_social/history.json` — posted tweet archive with IDs and UTM click data
- `src/components/islands/SocialCommandCenter.tsx` — React island dashboard at `/social/` (queue viewer, X preview, judge panel, batch approve, GitHub PAT auth)

**Tweet types:** digest, breaking, hot_take, thread, data_viz, meme
**Voices:** analyst, journalist, edgy, witty (mixed persona per tweet)
**Languages:** en, es, fr, pt (synced with website i18n)
**Judge:** score (0-1) + verdict (PUBLISH/REVIEW/HOLD/KILL) + fact checks against tracker data
**Budget:** $1/month target, $0.01/tweet (text), $0.02/tweet (with image). AI is budget-aware.
**Hashtags:** 2 max per tweet (1 topic + #Watchboard), threads last tweet only, memes none
**Scheduling:** 4 slots/day (08:00, 13:00, 18:00, 22:00 UTC) via `.github/workflows/post-social-queue.yml`
**Images:** stat cards via satori, memes via memegen.link (free API, no upload needed)

**Workflows:**
- `update-data.yml` finalize phase calls `generate-social-queue.ts` to produce the daily queue
- `post-social-queue.yml` runs 4x/day to post due tweets from the queue
- `weekly-digest.yml` writes a thread entry into the queue format

### Utilities (`src/lib/`)

- `tracker-config.ts` — TrackerConfigSchema + types
- `tracker-registry.ts` — discovers and loads tracker configs
- `data.ts` — `loadTrackerData(slug)` parameterized data loader
- `map-utils.ts` — `geoToSVG()`, `MAP_CATEGORIES`, `generateSparkline()`
- `tier-utils.ts` — `tierClass()`, `tierLabel()`, `contestedBadge()`
- `constants.ts` — `NAV_SECTIONS`, `MIL_TABS` (loaded from default tracker config)
- `timeline-utils.ts` — `flattenTimelineEvents()`, `resolveEventDate()` (supports "Mon DD, YYYY" and "Mon DD" formats)
- `cesium-config.ts` — `configureCesium()`, `CameraPreset` type, `CameraPresetsMap` type (presets come from tracker.json, not hardcoded)

### Scripts (`scripts/`)

- `update-data.ts` — legacy AI data updater (direct API keys)
- `generate-review-manifest.ts` — event gap detection per tracker (used by nightly workflow)
- `generate-sibling-brief.ts` — cross-tracker context generation (used by nightly workflow)
- `backfill-media.ts` — enriches existing events with `media` arrays by fetching `og:image` from source URLs. Flags: `--dry-run` (preview only), `--tracker <slug>` (single tracker). Run: `npx tsx scripts/backfill-media.ts`

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

Broadcast styles in `src/styles/broadcast.css`. Mobile story carousel in `src/styles/mobile-stories.css`.

## Development Methodology

This project uses **Agent Triforce** (`ArtemioPadilla/agent-triforce`) for structured development:

- **Prometeo (PM)** — Feature specs, prioritization, business logic
- **Forja (Dev)** — Architecture, implementation, TDD workflow
- **Centinela (QA)** — Security audits, code review, compliance

Workflow: `/feature-spec` → `/implement-feature` → `/security-audit` → `/review-findings`

All changes follow the checklist methodology (SIGN IN → TIME OUT → SIGN OUT) with mandatory pause points. Install the plugin: `/plugin install agent-triforce@agent-triforce`
