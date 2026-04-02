# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **SEO: Sitemap generation**: `@astrojs/sitemap` integration auto-generates `sitemap-index.xml` and `sitemap-0.xml` at build time with all page URLs
- **SEO: robots.txt**: allows all crawlers and points to the sitemap index at `https://watchboard.dev/sitemap-index.xml`
- **Enhanced LATEST INTEL feed**: expandable accordion items in homepage sidebar with digest summaries, section update badges, and dashboard links
  - `TrackerCardData` extended with `digestSummary` and `digestSectionsUpdated` fields populated from latest digest entry at build time
  - Feed items click-to-expand with full digest summary, colored section badges (events=blue, map=green, KPIs=amber, casualties=red, econ=purple), and "Open dashboard" link
  - Accordion behavior: only one item expanded at a time; smooth `max-height` + `opacity` transitions
  - Feed now shows ALL active trackers with headlines (removed `.slice()` limit); scrollable within sidebar

### Removed
- **WorldBriefing from homepage**: removed import, data collection, and rendering of `WorldBriefing` component from `index.astro` (component file preserved for future use)

### Previously Added
- **Mobile shell components**: `MobileHeader`, `MobileTabBar`, `MobileTabShell` in `src/components/islands/mobile/`
  - `MobileHeader`: fixed top bar with live pulse dot, operation name (truncated), and 2D/3D segmented toggle (when globe enabled)
  - `MobileTabBar`: fixed bottom tab bar with MAP/FEED/DATA/INTEL tabs, ARIA roles, and feed badge counter
  - `MobileTabShell`: orchestrator managing tab/map-mode state, feed badge computation; MAP tab stays mounted (display:none) to preserve Leaflet state; other tabs unmount when inactive
- **Cinematic Event Mode** for 3D globe: auto-flies camera to event locations as timeline plays
  - New `useCinematicMode.ts` hook: computes shot queue from map lines/points per date, orchestrates camera via separate RAF loop
  - Shot types: overview, arc (strike midpoint), target (impact point), point (standalone locations)
  - Subtle heading drift during dwell for cinematic feel; transition speed adapts to distance
  - Toggle button in CesiumControls toolbar (play icon with pulsing green glow when active)
  - Cinematic overlay shows shot counter and label at top-center
  - Events panel auto-scrolls and highlights active event with green border glow
  - `flyToPosition` function added to `useCesiumCamera` for arbitrary coordinate camera flights

### Changed
- **3D Globe tracker-agnostic refactor**: CesiumGlobe component now fully driven by tracker config props instead of hardcoded Iran-specific data
  - Removed hardcoded `CAMERA_PRESETS` from `cesium-config.ts` and `PRESET_LABELS` from CesiumControls/MobileBottomSheet
  - Camera presets, map categories, and initial camera position now flow from `tracker.json` through `globe.astro` as props
  - `useCesiumCamera` accepts presets as parameter instead of importing hardcoded constant
  - Active filters initialize from tracker categories; military-specific layers default OFF for non-military trackers
  - `CameraPresetSchema` in tracker-config now supports optional `label` field
  - Iran conflict tracker presets enriched with human-readable labels
  - Ayotzinapa tracker globe enabled with 5 camera presets (Guerrero, Iguala, Cocula, Ayotzinapa School, Mexico City)
  - Build now generates 7 pages (was 6) -- Ayotzinapa gains `/ayotzinapa/globe/`

### Added
- **Map data backfill Mar 9-13**: 33 new map-lines and 15 new map-points for Iran conflict tracker
  - March 9: IDF airfield strikes (6 bases), IRGC Space Command, Ahvaz Drone HQ, Bandar Abbas naval ship, Isfahan IRGC leaders, NATO Turkey intercept, Iran northern Israel waves, Shaybah interception
  - March 10: Tehran south refinery, Iran Haifa oil refineries retaliation, Tel Aviv cluster warhead barrages
  - March 11: IRGC most intense operation (advanced missiles), Hormuz mine field front, commercial ship struck, Bahrain/Saudi continued strikes
  - March 12: Beirut diplomats killed, Lebanon Hezbollah response, Oman Salalah fuel depot, Bahrain Muharraq, Jerusalem near Old City, container ship UAE, US tanker Iraq waters, UAE/Saudi continued
  - March 13: 3 ships in Gulf, Israel barrages, Gulf states continued, US-Israel 6000+ targets, Hormuz mine clearance, French soldier killed Iraq Kurdistan, KC-135 crash, Hezbollah rockets
- **Ayotzinapa tracker** (Phase 8): Second tracker (`trackers/ayotzinapa/`) to validate multi-tracker system
  - `tracker.json` config with map categories (disappearance, search, investigation, protest), custom AI prompt, and Ayotzinapa-specific event types
  - 14 seed data files: meta, kpis (6 items), timeline (2 eras, 4 events), map-points (4 locations), claims (2 contested narratives), political (3 figures), plus empty arrays for unused sections
  - Generates 2 pages: `/ayotzinapa/` (dashboard) and `/ayotzinapa/about/` (no globe -- disabled in config)
  - Home page now shows 2 active tracker cards (Iran + Ayotzinapa)
- **Home page** (Phase 5): `src/pages/index.astro` rewritten as tracker index showing active/archived tracker cards with status badges, section counts, and feature indicators (Map, 3D Globe)

### Changed
- `TimelineEventSchema.type` changed from `z.enum(['military', 'diplomatic', 'humanitarian', 'economic'])` to `z.string()` — supports arbitrary event types per tracker (same extensibility pattern as `cat` and `avatar`)
- `GlobeConfigSchema.cameraPresets` changed from required to optional — trackers with `globe.enabled: false` no longer need camera presets

### Removed
- Old static `src/pages/globe.astro` and `src/pages/about.astro` (replaced by `[tracker]/globe.astro` and `[tracker]/about.astro`)
- Backward-compat named exports from `src/lib/data.ts` (no longer needed — all pages use `loadTrackerData(slug)`)

### Changed
- `package.json` name changed from `iran-conflict-tracker` to `intel-dashboard`

### Added (prior)
- Multi-tracker update script (Phase 6 of generalization plan)
  - `scripts/update-data.ts` now iterates over `trackers/*/tracker.json` configs instead of hardcoding Iran data
  - Per-tracker system prompt (`ai.systemPrompt` with `{{today}}` template), search context (`ai.searchContext`), coordinate bounds (`ai.coordValidation`), start date (`startDate`), and enabled sections (`ai.enabledSections`)
  - `TRACKER_SLUG` env var to target a single tracker (default: `all`)
  - `SECTION_UPDATERS` map for config-to-function routing; deduplicates shared updaters (e.g. `military` and `assets`)
  - `DEFAULT_SYSTEM_PROMPT` fallback for trackers without custom AI prompts
  - GitHub Actions workflow updated: `TRACKER_SLUG` input, `git add trackers/`, per-tracker commit messages

- Dynamic tracker routes (Phases 2-4 of generalization plan)
  - `src/pages/[tracker]/index.astro` — parameterized dashboard page using `getStaticPaths`
  - `src/pages/[tracker]/globe.astro` — parameterized 3D globe page (only for trackers with `globe.enabled`)
  - `src/pages/[tracker]/about.astro` — parameterized about page
  - `src/lib/data.ts` rewritten with `loadTrackerData(slug)` function that loads from `trackers/{slug}/data/`
  - Backward-compatible default exports still work for existing `index.astro`, `globe.astro`, `about.astro`

### Changed
- **Base path**: changed from `/iran-conflict-tracker` to `/intel-dashboard` in `astro.config.mjs`
- **Schema loosening**: `MapPointSchema.cat`, `MapLineSchema.cat`, `PolItemSchema.avatar` changed from enums to `z.string()` for extensibility; `TheaterCoordSchema` bounds removed (tracker-specific)
- **Component parameterization**: `Header.astro`, `Footer.astro`, `PoliticalGrid.astro` accept optional `trackerSlug`/`navSections`/`githubRepo` props; `IntelMap.tsx` accepts `categories` prop; `MilitaryTabs.tsx` accepts `tabs` prop
- **Constants**: `NAV_SECTIONS` and `MIL_TABS` now load from tracker config with fallback defaults
- **BaseLayout.astro**: accepts `description`, `trackerSlug`, `githubRepo` props; SEO meta tags are parameterized
- Font paths updated from `/iran-conflict-tracker/fonts/` to `/intel-dashboard/fonts/`

- Tracker config infrastructure (Phase 1 of generalization plan)
  - `trackers/iran-conflict/tracker.json` — extracted all Iran-specific config (map bounds, categories, camera presets, nav sections, AI prompts) into a standalone config file
  - `trackers/iran-conflict/data/` — copied all 13 data JSON files + 85 event partition files
  - `src/lib/tracker-config.ts` — Zod schema (`TrackerConfigSchema`) and inferred types for tracker configs
  - `src/lib/tracker-registry.ts` — build-time registry using `import.meta.glob` to discover and validate all tracker configs

### Fixed
- Globe missile timing: sim clock starts at midnight instead of noon so pre-dawn USA strikes (01:00-06:00) animate correctly instead of completing instantly
- Schema hardening: `MapLineSchema` now validates `time` format (HH:MM), coordinate bounds (theater area), and `launched`/`intercepted` as non-negative integers; `MapPointSchema` validates coordinate bounds and date format
- Cross-field validation in data loader: strike/retaliation lines must have `weaponType` and `time` fields
- Recategorized 6 logistics/exercise lines from `retaliation` to `front` (IRGC exercises, nuclear transfers, tunnel ops)
- Update script prompts now mark `weaponType` and `time` as REQUIRED for strike/retaliation lines

### Changed (Data Update — March 10, 2026)
- Updated casualties: UAE killed 3->5 (inc. 2 armed forces officers), injured 78->112+; Lebanon killed 400+->486+, 700K displaced; added Saudi Arabia entry (2 killed in Al-Kharj)
- Updated KPIs: Lebanon killed 486+, Gulf Region killed 11+, countries affected 14+, flights cancelled 35K+
- Updated econ: Gold $5,400/oz (+2.7%), S&P 500 6,769, VIX 31.5, Iranian Rial 3.5M/$1, shipping rates +400%
- Added 8 map lines for March 9 strikes/retaliation arcs (IRGC HQ, Kish Island, Ghobeiry/Beirut, Bapco/Bahrain, Fujairah/UAE, Al-Kharj/Saudi, Qatar missiles, Iran-Israel missiles)
- Added 3 map points: Qatar intercept, Shaybah oil field, updated Al-Kharj details
- Updated political: Mojtaba Khamenei details, added Pezeshkian (apology to neighbors), updated Araghchi (rejects ceasefire)
- Added 3 claims: Iran-CIA backchannel, Pezeshkian gulf apology contradiction, US war cost estimates
- Updated meta: heroSubtitle with latest status, footer note source count

### Fixed
- fix(globe): USA-fired missiles now animate correctly on 3D globe; sim clock anchored to midnight instead of noon so pre-dawn strikes (01:00-06:00) are no longer instantly "completed" when playback begins
- TD-001: Consolidated `tierClass`/`tierLabel` from 5 duplicated definitions into single canonical source in `tier-utils.ts`; added `tierLabelFull` and `tierLabelShort` variants; consumer files now import or re-export from the canonical module
- TD-002: Wired up orphaned `constants.ts` — `Header.astro` now imports `NAV_SECTIONS` and `MilitaryTabs.tsx` now imports `MIL_TABS` from `src/lib/constants.ts`; removed inline redefinitions
- TD-009: Replaced hard-coded "Feb 28 -- Mar 4" date range in MilitaryTabs with `computeDateRange()` that dynamically derives min/max dates from strike and retaliation `time` fields
- TD-017: Normalized `dateToDay()` and `formatDate()` in CesiumTimelineBar to use explicit UTC, preventing off-by-one date on slider scrub for UTC+ timezone users
- TD-022: Extracted magic number `43200000` (noon offset) in CesiumGlobe to named constant `NOON_OFFSET_MS`
- TD-006: Removed dead `dotColor` field from `MapCategory` interface and all `MAP_CATEGORIES` entries in `map-utils.ts`
- TD-007: Replaced hard-coded `majorLabels` ID set in LeafletMap with data-driven `showLabel` boolean on MapPointSchema; 10 key points now have `showLabel: true` in `map-points.json`
- TD-008: Replaced hard-coded Hormuz zone radius (`pt.id === 'hormuz' ? 60000 : 40000`) with data-driven `zoneRadius` field on MapPointSchema; both 2D LeafletMap and 3D Cesium globe use `pt.zoneRadius ?? 40000`
- TD-010: Confirmed `attributionControl={false}` was already removed in prior refactor; Carto attribution renders correctly with existing dark-theme CSS overrides
- TD-023: Extracted duplicated sine-curve arc geometry into shared `computeArcPositions()` and `interpolateArcPosition()` functions in `map-helpers.ts`; both LeafletMap and MapArcAnimator now import from the shared module
- TD-018, TD-019, TD-020, TD-021: Verified already resolved in prior sessions; moved to resolved in TECH_DEBT.md
- TD-005: Replaced `set:html` with safe text interpolation in Hero.astro to eliminate XSS risk from AI-generated headline
- TD-003: Added early return guard in `generateSparkline()` for arrays with fewer than 2 elements, preventing NaN SVG coordinates
- TD-011: Added `.env`, `.env.local`, `.env.*.local` to `.gitignore` to prevent accidental credential commits
- TD-012: Added `.min(2)` constraint on `EconItemSchema.sparkData` to reject invalid sparkline data at schema validation time
- TD-004: Deploy workflow no longer fires on failed nightly updates — added JSON validation gate in update-data.yml and `workflow_run.conclusion == 'success'` condition in deploy.yml
- TD-013: JSON writes in update script are now atomic (write-to-temp-then-rename) via `atomicWriteFile` helper, preventing corrupt data files on mid-write crashes

### Added
- 2D IntelMap overlay layers: No-Fly Zones (6 zones), GPS Jamming (6 zones with hex rendering), Internet Blackouts (5 zones), USGS Earthquakes (live fetch), Weather (Open-Meteo archive API with cloud cover and wind)
- MapLayerToggles: collapsible overlay layer panel with per-layer toggle, colored indicators, and active count badges
- useMapOverlays hook: date-filtered zone computation, USGS earthquake API fetching, Open-Meteo weather fetching, overlay counts
- MapOverlayData: shared data constants for all 5 overlay types with hexagonLatLngs geometry helper
- LeafletMap now renders Polygon overlays for no-fly zones, GPS jamming hexagons, internet blackout zones; CircleMarker for earthquakes; Circle for weather cloud cover
- Enhanced 2D IntelMap timeline with multi-speed playback (1x/2x/5x/10x/Auto), prev/next event navigation, event tick marks, LIVE button, and event count badge
- MapEventsPanel: right-side intel feed panel for the 2D map with expandable event cards, weapon-type badges, confidence indicators, source chips with tier and pole labels
- OSINT-enhanced line rendering in LeafletMap: weapon-type-aware line weights, low-confidence opacity, intercepted dash pattern, and rich multi-line tooltips
- Map stats overlay showing filtered location and vector counts
- WEAPON_TYPE_WEIGHTS, WEAPON_TYPE_LABELS, STATUS_LABELS exports in map-helpers.ts
- Timeline events passed from index.astro to IntelMap via flattenTimelineEvents
- Live flight tracking (useMapFlights): OpenSky Network API polling with 15s interval, military callsign detection, exponential backoff on 429/errors, active only at latest date
- Day/night terminator (useTerminator): solar declination math, night polygon rendered behind all layers via Leaflet Pane (zIndex 200), synced to noon of simulated date
- Animated strike arcs (MapArcAnimator): glowing dot projectiles animate along arc paths during playback, max 8 simultaneous, looping 2s animation, red for strikes, amber for retaliation
- Persist toggle (DAY/ALL): timeline button to switch between showing only current-day lines vs all lines up to current date
- LayerState expanded to 7 toggles: added flights (color #00aaff, icon airplane) and terminator (color #4488aa, icon half-circle)
- Flight rendering: CircleMarkers with military=yellow/radius 5, civilian=cyan/radius 3, tooltip with callsign/country/altitude/speed
- Flight count in map stats overlay
- OSINT weapon-type schemas: `WeaponTypeSchema`, `ConfidenceSchema`, `StrikeStatusSchema` with inferred types
- 10 optional OSINT fields on `MapLineSchema`: weaponType, launched, intercepted, confidence, time, damage, casualties, notes, platform, status
- 2 optional OSINT fields on `TimelineEventSchema`: weaponTypes, confidence
- 5 weapon-type-aware rendering helpers in cesium-helpers.ts: `weaponSpeed`, `weaponPeakAlt`, `simFlightDurationTyped`, `weaponProjectileSize`, `weaponGlowPower`

## [1.0.0] - 2026-03-07

### Added
- Astro 5 static intelligence dashboard with dark theme
- 7-section single-page layout: Timeline, Map, Military Ops, Humanitarian, Economic, Contested Claims, Political
- Interactive SVG theater map with category filters, arc lines, and click-to-detail info panel
- Click-to-expand historical timeline spanning 1941 to present
- Tabbed military operations view (strike targets, retaliation, US assets)
- Economic impact cards with sparkline charts (Brent, WTI, gold, S&P 500, VIX, rial)
- Contested claims matrix with side-by-side source comparison
- 4-tier source classification system (Official, Major Outlet, Institutional, Unverified)
- Casualty table with contested/verified badges
- Political and diplomatic statements grid
- KPI strip with contested flags and color coding
- 3D CesiumJS intelligence globe at `/globe` route
- Animated missile trajectories with synchronized timeline on globe
- Post-processing shaders (CRT, NVG, Thermal, Bloom) on globe
- Real-time satellite tracking, flight tracking, and earthquake feeds on globe
- Events/intel feed panel on globe synced to timeline date
- Nightly AI data update pipeline with dual provider support (Anthropic / OpenAI)
- Multi-pole sourcing (Western, Middle Eastern, Eastern, International perspectives)
- Zod schema validation for all data at build time
- Daily event partitioning with backfill infrastructure (`npm run backfill`)
- GitHub Actions CI/CD: auto-deploy on push + scheduled nightly data refresh
- Full data backfill covering all 44 days (Jan 23 - Mar 7, 2026)
