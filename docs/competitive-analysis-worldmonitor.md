# Competitive analysis: Watchboard vs World Monitor

This document provides a comprehensive comparison between Watchboard
and World Monitor (koala73/worldmonitor), covering architecture,
features, codebase metrics, gap analysis, and a prioritized
implementation roadmap. Use this as a reference when planning feature
work to close gaps or deepen existing advantages.

**Last updated:** March 31, 2026
**World Monitor version analyzed:** v2.6.5
**Watchboard commit:** `e896462` (main)

---

## Repository overview

Both projects are open-source intelligence dashboards, but they take
fundamentally different architectural approaches.

| Attribute | World Monitor | Watchboard |
|---|---|---|
| **Repository** | `koala73/worldmonitor` | `ArtemioPadilla/watchboard` |
| **Stars** | 45,787 | 4 |
| **Forks** | 7,341 | 1 |
| **Contributors** | 30 | 1 |
| **Commits** | 2,947 | ~500 |
| **Releases** | 43 | 0 |
| **Created** | January 8, 2026 | March 4, 2026 |
| **License** | AGPL-3.0 | None specified |
| **Live URL** | worldmonitor.app | watchboard.dev |

---

## Architecture comparison

The two projects differ at the foundation level. World Monitor is a
real-time SPA that fetches live data from 30+ upstream APIs. Watchboard
is a static site generator with AI-curated data committed as JSON files.

### World Monitor architecture

```
Browser (vanilla TS + Preact SPA)
  |
  +-- DeckGLMap (deck.gl + MapLibre GL, WebGL)
  +-- GlobeMap (globe.gl + Three.js, 3D)
  +-- 118 Panel components
  +-- Web Workers (ML inference, analysis, vector DB)
  |
  v  fetch /api/*
Vercel Edge Functions (87 endpoints, sebuf RPC)
  |
  +---> Upstash Redis (cache, rate limiting, pub/sub)
  +---> Railway Relay (AIS WebSocket, seed loops, RSS proxy)
  +---> Convex Cloud (user prefs, notifications, waitlist)
  +---> 30+ Upstream APIs (Finnhub, OpenSky, GDELT, ACLED, etc.)
  |
Tauri 2 Desktop Shell (Rust)
  +---> Node.js Sidecar (local API server, secret injection)
```

**Key characteristics:**
- Real-time data fetching with 4-tier cache hierarchy (fast 5m,
  medium 10m, slow 30m, static 2h)
- 222 Protocol Buffer definitions across 32 domains generate typed
  RPC clients and servers
- 8-phase app initialization pipeline (storage, i18n, ML worker,
  sidecar, bootstrap, layout, UI, refresh)
- State managed via centralized mutable `AppContext` (no Redux/Zustand)
- Smart polling with exponential backoff, tab pause, viewport
  conditional refresh

### Watchboard architecture

```
Browser (Astro SSG + React islands)
  |
  +-- LeafletMap (react-leaflet, 2D)
  +-- CesiumGlobe (CesiumJS + Resium, 3D)
  +-- 57 interactive components (React islands)
  +-- 10 static components (Astro)
  |
  v  All data loaded at build time via import.meta.glob
Astro Static Site Generator
  |
  +---> trackers/{slug}/data/*.json (committed to git)
  +---> GitHub Pages (static hosting, zero backend)
  |
GitHub Actions (nightly AI pipeline)
  +---> Claude Code Action (50-turn budget per tracker)
  +---> Zod validation + fix agent (15-turn retry)
  +---> Build gate (npm run build) before commit
  +---> Metrics collection (public/_metrics/)
```

**Key characteristics:**
- Zero backend infrastructure, zero runtime costs
- All data is AI-curated and version-controlled in git
- 48 config-driven trackers, each with independent data directory
- Build-time data loading with Zod validation
- 3-phase nightly update pipeline (resolve, update matrix, finalize)

### Architectural trade-offs

| Dimension | WM advantage | WB advantage |
|---|---|---|
| Data freshness | Real-time (seconds) | Nightly (acceptable for historical trackers) |
| Infrastructure cost | Vercel + Redis + Railway | Zero (GitHub Pages) |
| Reliability | Depends on 30+ upstream APIs | Git-committed data never goes down |
| Data quality | Raw upstream data, no curation | AI-curated with source tier classification |
| Scalability | Single global dashboard | 48 independent topic-specific dashboards |
| Setup complexity | 8+ API keys, Docker, Redis | `npm run dev` |

---

## Codebase size comparison

These numbers count hand-written source code, excluding generated
protobuf stubs, `node_modules`, and `.git`.

| Metric | World Monitor | Watchboard | Ratio |
|---|---|---|---|
| **Total LOC (all code)** | 233,785 | 114,914 | 2.0x |
| **Hand-written LOC** | 155,940 | 28,520 | 5.5x |
| **Total files** | 2,051 | 4,117 | WB has more (JSON data) |
| **UI components** | 118 panels | 57 islands + 10 static | 1.8x |
| **Service modules** | 150+ | ~15 | 10x |
| **API endpoints** | 87 edge functions | 1 JSON endpoint | -- |
| **Protobuf definitions** | 222 across 32 domains | 0 | -- |
| **Config files** | 38 in `src/config/` | ~5 in `src/lib/` | 7.6x |
| **Test files** | 80+ unit, 12 e2e | 3 unit, 2 e2e | 18x |
| **CI workflows** | 10 | 8 | 1.3x |
| **Scripts** | 80+ seed/build scripts | 12 | 6.7x |
| **CSS** | Component-scoped + global | 7 global files | -- |

### Dependency comparison

**World Monitor production dependencies (34):**
- `@anthropic-ai/sdk`, `@clerk/clerk-js`, `@deck.gl/*` (6 packages),
  `@protomaps/basemaps`, `@sentry/browser`, `@upstash/ratelimit`,
  `@upstash/redis`, `@vercel/analytics`, `@xenova/transformers`,
  `canvas-confetti`, `convex`, `d3`, `dompurify`, `fast-xml-parser`,
  `globe.gl`, `hls.js`, `i18next`, `i18next-browser-languagedetector`,
  `jose`, `maplibre-gl`, `marked`, `onnxruntime-web`, `papaparse`,
  `pmtiles`, `preact`, `satellite.js`, `supercluster`, `telegram`,
  `topojson-client`, `uqr`, `ws`, `youtubei.js`

**Watchboard production dependencies (key):**
- `astro`, `react`, `react-dom`, `react-leaflet`, `leaflet`,
  `cesium`, `resium`, `satellite.js`, `zod`, `pagefind`

---

## Feature parity matrix

This matrix categorizes every feature as: present in both projects
(parity), present only in WM (gap), or present only in Watchboard
(advantage).

### Features where Watchboard has parity or advantage

These features exist in both projects. In several cases, Watchboard's
implementation is deeper or more mature.

| Feature | WM | WB | Assessment |
|---|---|---|---|
| **Interactive 2D map** | MapLibre + deck.gl (WebGL) | Leaflet (react-leaflet) | Parity. WM has WebGL perf, WB has simpler stack |
| **3D globe** | globe.gl (Three.js) | CesiumJS + Resium | **WB advantage.** CesiumJS has true 3D terrain, missile animations, 7 visual modes (CRT, NVG, thermal, bloom, panoptic), cinematic camera sequencing |
| **Multi-topic tracking** | Single global dashboard, 5 variants | **48 config-driven trackers** with independent data | **WB major advantage.** Deep per-topic intelligence vs. WM's single wide view |
| **Timeline/events** | No dedicated timeline UI | Full timeline with eras, daily event partitions, media, click-to-expand | **WB advantage** |
| **Source classification** | No source tiering | **Tier 1-4** with 4-pole media sourcing (western, middle_eastern, eastern, international) | **WB major advantage.** Rigorous OSINT methodology |
| **AI data pipeline** | No automated data curation | **Nightly 3-phase matrix pipeline** with review manifests, sibling briefs, fix agent, build gate | **WB major advantage.** Fully automated, zero-cost |
| **RSS feeds** | None | Per-tracker + global RSS with digest entries | **WB advantage** |
| **Embeddable widgets** | None | `/embed/[tracker]/` (~4KB, zero-JS, iframe-safe) | **WB advantage** |
| **KPI dashboard** | CountersPanel | KpiStrip with color coding, contested flags, deltas, trends | **WB advantage** (more structured) |
| **Casualty tracking** | UCDP event counts | CasualtyTable with category breakdown, contested field (yes/no/evolving/heavily/partial) | **WB advantage** |
| **Political analysis** | None | PoliticalGrid with avatars, roles, quotes, pole alignment | **WB advantage** |
| **Claims matrix** | None | ClaimsMatrix with side-A vs. side-B contested assertions | **WB advantage** |
| **Broadcast mode** | None | TV news broadcast overlay with lower-third headlines, scrolling ticker, LIVE badge, auto-cycling globe fly-tos | **WB advantage** |
| **Mobile stories** | None | Instagram Stories-style carousel with auto-advance, swipe gestures, domain gradients, map tile previews | **WB advantage** |
| **Search** | Command palette (fuzzy, `Cmd+K`) | Pagefind full-text indexed search | Parity (different approaches) |
| **Ingestion metrics** | ServiceStatusPanel (basic) | **Full MetricsDashboard** with uptime calendar, KPI cards, per-tracker health table, error trend chart, expandable run log | **WB advantage** |
| **Compare mode** | None | ComparePanel for side-by-side multi-tracker comparison | **WB advantage** |
| **OG images** | `/api/og-story` (dynamic) | `/og/[tracker].png` (build-time SVG) | Parity |
| **i18n** | 21 languages | 4 languages (en complete, es complete, fr/pt partial) | WM leads on breadth, WB has data-level translation |

### Features where World Monitor leads (gaps)

Each gap includes: what WM has, the key files implementing it, the
estimated effort to build in Watchboard, and whether it requires
backend infrastructure.

#### Gap 1: Real-time live data feeds

**Severity:** Critical
**Requires backend:** Yes (API proxy or client-side API calls)

World Monitor fetches live data from 30+ upstream APIs and renders it
in real time. This is the single most visible difference between the
two projects.

**WM live data sources:**

| Data source | API | WM service file | Update frequency |
|---|---|---|---|
| Military flights | OpenSky Network | `src/services/aviation/index.ts` | 10 seconds |
| Commercial flights | Wingbits | `src/services/aviation/index.ts` | 10 seconds |
| AIS vessels | AISStream | `src/services/maritime/index.ts` | Real-time WebSocket |
| USNI fleet positions | USNI News | `src/services/usni-fleet.ts` | Daily |
| Earthquakes | USGS | `src/services/earthquakes.ts` | 5 minutes |
| GPS jamming | GPSJAM/Wingbits | `src/services/gps-interference.ts` | 10 minutes |
| Live news video | YouTube HLS | `src/services/live-news.ts` | On demand |
| Breaking news | RSS + AI classify | `src/services/breaking-news-alerts.ts` | 5 minutes |
| Telegram OSINT | Telegram channels | `src/services/telegram-intel.ts` | 30 seconds |
| Israel sirens | OREF | `src/services/oref-alerts.ts` | Real-time |
| Webcams | Windy + custom | `src/services/webcams/index.ts` | Live stream |
| Weather | NOAA/Copernicus | `src/services/weather.ts` | 30 minutes |
| Satellite fires | NASA FIRMS | `src/services/wildfires/index.ts` | 3 hours |
| Radiation | Safecast | `src/services/radiation.ts` | 1 hour |
| Internet outages | Cloudflare | `src/services/infrastructure/index.ts` | 5 minutes |
| Cyber threats | Shadowserver | `src/services/cyber/index.ts` | 30 minutes |
| Disease outbreaks | WHO/ProMED | `src/services/disease-outbreaks.ts` | Daily |

**Watchboard current state:** Static data updated nightly by AI
pipeline. The CesiumGlobe already has hooks for flights
(`useFlights.ts`), ships (`useShips.ts`), earthquakes
(`useEarthquakes.ts`), and satellites (`useSatellites.ts`), but these
require user-provided API keys and fetch client-side.

**Implementation path for Watchboard:**
- **Quick (no backend):** Fetch USGS earthquakes and OpenSky flights
  directly from client-side JavaScript. Both APIs have permissive CORS
  policies. Wire into existing Cesium hooks.
- **Medium (Astro API routes):** Add `src/pages/api/` endpoints that
  proxy rate-limited APIs (FIRMS fires, weather). Astro supports
  server endpoints when deployed to Vercel/Netlify.
- **Full (relay service):** For WebSocket sources (AIS), deploy a
  lightweight relay (similar to WM's Railway service).

---

#### Gap 2: Map data layers

**Severity:** Critical
**Requires backend:** No (static GeoJSON data)

World Monitor has 55 toggleable map layers across 5 variant
configurations. Most layers render static reference data (military
bases, nuclear sites, cables) that rarely changes.

**WM layer registry** (`src/config/map-layer-definitions.ts`):

**Geopolitical (17 layers):**
- `iranAttacks` -- Iran-specific attack events
- `hotspots` -- Intel hotspot locations
- `conflicts` -- Active conflict zone polygons
- `bases` -- 125,000+ military base locations
- `nuclear` -- Nuclear facility sites
- `irradiators` -- Gamma irradiator locations
- `radiationWatch` -- Radiation monitoring stations
- `spaceports` -- Space launch facilities
- `satellites` -- Orbital surveillance positions
- `cables` -- Undersea cable routes
- `pipelines` -- Oil/gas pipeline routes
- `military` -- Military flight/vessel activity
- `ais` -- Ship AIS traffic
- `gpsJamming` -- GPS/GNSS interference zones (H3 hexagons)
- `ciiChoropleth` -- Country Instability Index heatmap
- `sanctions` -- Sanctioned entity locations
- `dayNight` -- Day/night terminator line

**Monitoring (11 layers):**
- `flights` -- Aviation delays and tracking
- `protests` -- Social unrest clusters
- `ucdpEvents` -- Armed conflict events (Uppsala)
- `displacement` -- Refugee/migration flows
- `climate` -- Climate anomaly zones
- `weather` -- Severe weather alerts
- `outages` -- Internet disruption areas
- `cyberThreats` -- Cyber threat sources
- `natural` -- Natural disaster events (EONET)
- `fires` -- Satellite fire detections (FIRMS)
- `diseaseOutbreaks` -- Disease outbreak locations

**Infrastructure (8 layers):**
- `datacenters` -- AI data center locations
- `tradeRoutes` -- Maritime shipping lanes
- `waterways` -- Strategic waterway chokepoints
- `economic` -- Economic center locations
- `minerals` -- Critical mineral mining sites
- `miningSites` -- Mining operation locations
- `processingPlants` -- Mineral processing plants
- `commodityPorts` -- Commodity shipping ports

**Tech variant (5 layers):**
- `startupHubs`, `techHQs`, `accelerators`, `cloudRegions`,
  `techEvents`

**Finance variant (4 layers):**
- `stockExchanges`, `financialCenters`, `centralBanks`,
  `commodityHubs`

**Happy variant (5 layers):**
- `positiveEvents`, `kindness`, `happiness`, `speciesRecovery`,
  `renewableInstallations`

**Webcam + weather (3 layers):**
- `webcams`, `weatherRadar`, `webcams`

**WM data sources for static layers:**
- `src/config/geo.ts` -- Hotspots, conflict zones, military bases,
  nuclear facilities, spaceports, economic centers, strategic
  waterways, critical minerals, undersea cables
- `src/config/pipelines.ts` -- Oil/gas pipeline GeoJSON routes
- `src/config/irradiators.ts` -- Gamma irradiator locations
- `src/config/ai-datacenters.ts` -- AI data center coordinates
- `src/config/trade-routes.ts` -- Maritime trade route segments
- `src/config/airports.ts` -- Airport coordinate database
- `src/config/ports.ts` -- Port locations
- `src/config/tech-companies.ts` -- Tech company HQ locations
- `src/config/startup-ecosystems.ts` -- Startup hub definitions
- `src/config/commodity-miners.ts` -- Mining operation data
- `src/config/finance-geo.ts` -- Financial center coordinates

**Watchboard current state:** Category-filtered point markers +
strike trajectory lines per tracker. 8 overlay types (no-fly zones,
GPS jamming, internet blackout, earthquakes, weather, flights,
terminator, fact cards).

**Implementation path for Watchboard:**
1. Create `src/data/layers/` directory with GeoJSON files for
   military bases, nuclear sites, undersea cables, pipelines,
   conflict zones
2. Add a `MapLayerRegistry` component similar to WM's layer
   definitions
3. Extend `IntelMap.tsx` and `LeafletMap.tsx` with Leaflet
   `L.GeoJSON` layer groups
4. Add layer toggle UI (checkboxes or WM-style panel)
5. Source data: OpenStreetMap Overpass API exports, Natural Earth,
   public GeoJSON datasets

---

#### Gap 3: AI chat analyst

**Severity:** High impact
**Requires backend:** Yes (LLM API proxy)

World Monitor has an interactive AI chat panel where users can ask
questions about the current geopolitical situation, markets, conflicts,
forecasts, and risk.

**WM implementation:**
- `src/components/ChatAnalystPanel.ts` -- UI component with quick
  action buttons ("Situation," "Markets," "Conflicts," "Forecasts,"
  "Risk"), domain filtering (all, geo, market, military, economic),
  markdown rendering with DOMPurify sanitization, 20-message history
- `api/chat-analyst.ts` -- Edge function that calls Claude API with
  system context, streams response
- Quick actions send pre-built prompts; users can also type free-form
  questions
- Purify config allows only text formatting + tables (no img/a/iframe
  to prevent hallucinated URLs)

**Implementation path for Watchboard:**
1. Create `src/components/islands/ChatPanel.tsx` React island
2. Create `src/pages/api/chat.ts` Astro API route that proxies to
   Anthropic API
3. System prompt includes: tracker context (meta.json, recent events,
   KPIs), source tier methodology, related tracker briefs
4. Render markdown responses with `marked` + `dompurify`
5. Store conversation in `sessionStorage` (no auth needed)
6. **Alternative (no backend):** User provides their own Anthropic
   API key, stored in `localStorage`, calls API directly from client

---

#### Gap 4: On-device ML

**Severity:** High impact
**Requires backend:** No

World Monitor runs ONNX models directly in the browser via Web
Workers for embeddings, sentiment analysis, and summarization.

**WM implementation:**
- `src/workers/ml.worker.ts` -- Web Worker loading 3 ONNX models:
  - `embeddings` -- `Xenova/all-MiniLM-L6-v2` (23MB, sentence
    embeddings for semantic search)
  - `sentiment` -- `Xenova/distilbert-base-uncased-finetuned-sst-2-english`
    (65MB, news tone classification)
  - `summarization` -- `Xenova/flan-t5-base` (250MB, headline
    condensing)
- `src/workers/vector-db.ts` -- IndexedDB-backed vector store for
  semantic search across headlines
- `src/config/ml-config.ts` -- Model configuration with priority
  loading (embeddings first, summarization last)
- `src/services/ml-capabilities.ts` -- Feature detection and
  graceful degradation

**Libraries:** `@xenova/transformers` (HuggingFace Transformers.js),
`onnxruntime-web`

**Implementation path for Watchboard:**
1. Add `@xenova/transformers` and `onnxruntime-web` dependencies
2. Create `src/workers/ml.worker.ts` following WM's pattern
3. Start with embeddings model only (23MB, most useful)
4. Use for semantic search across all tracker events
5. Optional: sentiment classification for timeline event tone

---

#### Gap 5: Internationalization (full)

**Severity:** Medium
**Requires backend:** No

World Monitor supports 21 languages with lazy-loaded locale files,
RTL support for Arabic, and browser language detection.

**WM implementation:**
- `src/services/i18n.ts` -- i18next initialization with lazy loading
  via `import.meta.glob`, RTL detection, document direction setting
- `src/locales/*.json` -- 21 locale files: `ar`, `bg`, `cs`, `de`,
  `el`, `en`, `es`, `fr`, `it`, `ja`, `ko`, `nl`, `pl`, `pt`, `ro`,
  `ru`, `sv`, `th`, `tr`, `vi`, `zh`
- Supported languages constant: `SUPPORTED_LANGUAGES`
- `RTL_LANGUAGES` set containing `ar`
- Browser language detection via `i18next-browser-languagedetector`
- Locale normalization (strips region codes: `en-US` becomes `en`)

**Watchboard current state:** 4 locales (en, es complete; fr, pt
partial). Custom `translations.ts` with ~200 keys. Astro i18n routing
(`/es/[tracker]/`). Data-level translation via `translate-data.yml`
workflow.

**Implementation path for Watchboard:**
1. Complete fr and pt translations (currently scaffolded)
2. Add high-impact languages: ar (RTL), zh, de, ru, ja
3. Consider migrating from custom `translations.ts` to i18next for
   ecosystem compatibility
4. Add `dir="rtl"` support in `BaseLayout.astro` for Arabic
5. Watchboard's data-level translation (AI-translated tracker data)
   is already more sophisticated than WM's UI-only i18n

---

#### Gap 6: Desktop application

**Severity:** Medium
**Requires backend:** No (but significant engineering)

World Monitor ships native desktop apps via Tauri 2 for macOS,
Windows, and Linux.

**WM implementation:**
- `src-tauri/src/main.rs` -- Rust entry point, IPC commands, system
  tray, window management
- `src-tauri/tauri.conf.json` -- App config (1440x900 window,
  security CSP, auto-updates via GitHub releases, code signing)
- `src-tauri/sidecar/local-api-server.mjs` -- Node.js local API
  server that loads edge function handlers
- 3 variant builds: full, tech
  (`tauri.tech.conf.json`), finance (`tauri.finance.conf.json`)
- Secret storage via platform keyring (macOS Keychain, Windows
  Credential Manager, Linux keyring)
- Bundled resources: `api/`, `data/`, `src/config/`, `node` binary
- Build targets: `.app`, `.dmg`, `.nsis`, `.msi`, `.appimage`
- CI: `build-desktop.yml` -- 5-platform matrix build on release tags

**Implementation path for Watchboard:**
1. Add `@tauri-apps/cli` to devDependencies
2. Initialize Tauri with `npx tauri init`
3. Since Watchboard is a static site, the Tauri shell just wraps the
   built `dist/` directory (no sidecar needed initially)
4. Add auto-update pointing to GitHub Releases
5. **Estimate:** 2-3 days for basic desktop app, 1-2 weeks for
   polished build with CI

---

#### Gap 7: Authentication and user accounts

**Severity:** Medium
**Requires backend:** Yes (auth provider + database)

**WM implementation:**
- `src/services/clerk.ts` -- Clerk.js initialization with dark theme
  appearance customization
- `src/services/auth-state.ts` -- Auth state management, premium
  feature gating
- `convex/schema.ts` -- User preferences, notification channels,
  alert rules, Telegram pairing tokens, registrations
- `convex/userPreferences.ts` -- Per-user per-variant settings sync
  with schema versioning
- `convex/alertRules.ts` -- Custom alert rules with sensitivity
  levels and event type filtering
- Premium/Pro tier with locked features (desktop-only layers, AI
  analyst, stock analysis, backtesting)

**Watchboard current state:** No authentication. Public static site.
All features available to everyone.

**Implementation path for Watchboard:**
1. Add Clerk or Auth.js for authentication
2. Store user preferences (followed trackers, language, theme) in
   Convex or Supabase
3. Gated features: custom alert rules, saved comparisons,
   notification preferences
4. **Note:** Watchboard's public-by-default approach is a valid
   design choice. Auth adds complexity; only add it if there's a
   clear user need (for example, notification preferences)

---

#### Gap 8: Notification system (multi-channel)

**Severity:** Medium
**Requires backend:** Yes

**WM implementation:**
- `api/notify.ts` -- Notification publish endpoint (Clerk JWT auth,
  Upstash Redis pub/sub)
- `api/notification-channels.ts` -- Channel management (Telegram,
  Slack, Email) with AES-256-GCM encrypted webhook storage
- `convex/notificationChannels.ts` -- Multi-channel storage
  (Telegram chatId, Slack webhook, Email address)
- `convex/alertRules.ts` -- Per-user rules: event types, sensitivity
  level, enabled channels
- `convex/telegramPairingTokens.ts` -- Telegram bot pairing flow
- `src/services/notification-channels.ts` -- Client-side channel
  management UI

**Watchboard current state:** `NotificationManager.tsx` provides
browser toast notifications. No external channel support.

**Implementation path for Watchboard:**
1. **Quick win:** Add GitHub Actions webhook that posts to a Slack
   channel after each nightly data update
2. **Medium:** Add Telegram bot that sends tracker update summaries
3. **Full:** User-configurable alert rules per tracker (requires
   auth, Gap 7)
4. Leverage existing nightly pipeline -- the "finalize" phase already
   knows which trackers were updated and what changed

---

#### Gap 9: Prediction markets

**Severity:** Medium
**Requires backend:** Partial (Polymarket API has CORS issues)

**WM implementation:**
- `src/services/prediction/index.ts` -- Polymarket/Kalshi client with
  circuit breaker pattern, 10-minute cache, tag-based filtering
  (geopolitical, tech, finance)
- `src/components/PredictionPanel.ts` -- UI panel showing prediction
  titles, yes/no prices (0-100 scale), volume, end dates
- `api/polymarket.js` -- Edge function proxy for Polymarket API
- `scripts/data/prediction-tags.json` -- Curated tag lists for
  filtering relevant predictions

**Implementation path for Watchboard:**
1. Create `src/components/islands/PredictionPanel.tsx`
2. Fetch from Polymarket gamma API (`https://gamma-api.polymarket.com`)
3. Filter by tracker-relevant keywords (from `tracker.json`
   `ai.searchContext`)
4. Display as card grid with probability bars
5. If CORS blocks client-side fetch, add an Astro API route as proxy

---

#### Gap 10: Country Intelligence Index

**Severity:** Medium
**Requires backend:** No (can compute at build time)

**WM implementation:**
- `src/services/country-instability.ts` -- Composite risk scoring
  across 12 signal categories per country with trend calculation
  (rising/falling/stable)
- `src/services/cached-risk-scores.ts` -- Cache layer for computed
  scores
- `src/components/CIIPanel.ts` -- UI with country list sorted by
  risk, color-coded levels (critical/high/elevated/normal/low), trend
  arrows, share button
- `src/components/CountryBriefPanel.ts` -- Per-country intelligence
  summary
- `src/components/CountryDeepDivePanel.ts` -- Detailed country
  analysis with signal breakdown
- Map layer: `ciiChoropleth` renders choropleth colored by risk level

**Implementation path for Watchboard:**
1. Create `scripts/compute-risk-scores.ts` that runs at build time
2. Input: aggregate timeline event counts, casualty severity, economic
   indicators, claims contested status across all trackers mentioning
   each country
3. Output: `src/data/country-risk.json` with per-country scores
4. Create `src/components/islands/CountryRiskPanel.tsx`
5. Add choropleth layer to IntelMap via Leaflet GeoJSON with
   `style` function based on risk score

---

#### Gap 11: Financial market data

**Severity:** Medium
**Requires backend:** Yes (market APIs require server-side keys)

**WM implementation:**
- `src/services/market/index.ts` -- Market data aggregation
- 18 finance-related panels: `MarketPanel`, `StockAnalysisPanel`,
  `DailyMarketBriefPanel`, `EconomicCalendarPanel`,
  `YieldCurvePanel`, `FearGreedPanel`, `EarningsCalendarPanel`,
  `ETFFlowsPanel`, `CotPositioningPanel`, `StablecoinPanel`,
  `MacroSignalsPanel`, `MacroTilesPanel`, `EconomicPanel`,
  `NationalDebtPanel`, `FuelPricesPanel`, `BigMacPanel`,
  `GroceryBasketPanel`, `EconomicCorrelationPanel`
- Data: 92 stock exchanges, 1500+ commodities, 200+ crypto assets
- Sources: Finnhub, Yahoo Finance, CoinGecko, FRED

**Watchboard current state:** `EconGrid.astro` shows basic economic
indicators (value, change, sparkline) per tracker. AI-curated.

**Implementation path for Watchboard:**
1. Enhance `EconGrid` with more indicators per tracker
2. Add commodity price widgets relevant to each tracker's context
   (for example, oil prices for Iran tracker, grain prices for Ukraine)
3. Client-side Yahoo Finance widget embeds (no API key needed)
4. **Full approach:** Add Astro API routes proxying free-tier market
   APIs (Alpha Vantage, Yahoo Finance scraping)

---

#### Gap 12: Correlation engine

**Severity:** Low-medium
**Requires backend:** No (can run client-side)

**WM implementation:**
- `src/services/correlation-engine/` -- Engine with 4 adapters:
  - `adapters/military-correlation.ts` -- Military force posture
  - `adapters/economic-correlation.ts` -- Economic warfare signals
  - `adapters/disaster-correlation.ts` -- Infrastructure cascade
  - `adapters/escalation-correlation.ts` -- Escalation detection
- 14 signal types: `prediction_leads_news`, `news_leads_markets`,
  `silent_divergence`, `velocity_spike`, `keyword_spike`,
  `convergence`, `triangulation`, `flow_drop`,
  `flow_price_divergence`, `geo_convergence`,
  `explained_market_move`, `sector_cascade`, `military_surge`,
  `hotspot_escalation`
- `src/components/CorrelationPanel.ts` -- Signal display
- `src/components/CrossSourceSignalsPanel.ts` -- Multi-source view

**Watchboard current state:** Sibling briefs provide cross-tracker
awareness (keyword overlap detection), but no real-time signal
correlation.

**Implementation path for Watchboard:**
1. Extend sibling brief system with quantitative correlation scores
2. Create `src/lib/correlation.ts` that computes cross-tracker event
   co-occurrence at build time
3. Display in a new `CorrelationPanel.tsx` island
4. This is a natural extension of Watchboard's multi-tracker
   architecture

---

#### Gap 13: MCP server

**Severity:** Low
**Requires backend:** Yes

**WM implementation:**
- `api/mcp.ts` -- MCP protocol server (v2025-03-26) exposing
  geopolitical data as tools for external LLM consumption
- Rate limited: 60 calls/min per API key via Upstash
- Tool registry pattern with typed input schemas

**Implementation path for Watchboard:**
1. Create `src/pages/api/mcp.ts` Astro endpoint
2. Expose tracker data as MCP tools: `get_tracker_summary`,
  `list_events`, `get_kpis`, `search_events`
3. Low effort since all data is already structured JSON

---

#### Gap 14: PWA / offline support

**Severity:** Low
**Requires backend:** No

**WM implementation:**
- `vite-plugin-pwa` in `vite.config.ts`
- Service worker for offline caching
- Brotli precompression for all static assets
- Web app manifest with icons

**Implementation path for Watchboard:**
1. Add `@vite-pwa/astro` integration
2. Configure manifest in `astro.config.mjs`
3. Add service worker for offline page caching
4. **Estimate:** 1-2 hours

---

#### Gap 15: Blog

**Severity:** Low
**Requires backend:** No

**WM implementation:**
- `blog-site/` -- Astro-powered blog with 16 SEO posts
- Built separately, output copied to `public/blog/`
- OG images per post

**Implementation path for Watchboard:**
1. Add `src/pages/blog/` with Astro content collections
2. Write posts about: OSINT methodology, tracker creation process,
   AI pipeline design, source tier classification
3. Blog content builds SEO authority and drives organic traffic

---

#### Gap 16: Story sharing / social cards

**Severity:** Low
**Requires backend:** Partial (OG image generation)

**WM implementation:**
- `src/services/story-renderer.ts` -- Canvas-rendered 1080x1920
  story images for country risk analysis
- `src/services/story-share.ts` -- Deep link generation with
  encrypted parameters
- `api/og-story.js` -- Server-side OG image generation

**Watchboard current state:** Static social preview images
(`scripts/generate-social-preview.ts`), OG images per tracker
(`src/pages/og/[tracker].png.ts`).

**Implementation path for Watchboard:**
1. Enhance existing OG generation with richer data (top 3 KPIs,
   latest event headline, casualty count)
2. Add share buttons per tracker dashboard
3. Create shareable event cards (individual timeline events as
   social-optimized images)

---

## Prioritized implementation roadmap

This roadmap groups features by effort level and impact, accounting
for Watchboard's static-site architecture.

### Tier 1: Quick wins (1-3 days each, no backend)

These features can be built immediately with zero infrastructure
changes.

| Priority | Feature | Effort | Impact |
|---|---|---|---|
| 1.1 | **Static map layers** (GeoJSON: military bases, nuclear sites, undersea cables, conflict zones, pipelines) | 2 days | High -- dramatically increases map depth |
| 1.2 | **PWA support** (`@vite-pwa/astro`) | 2 hours | Medium -- installable, offline-capable |
| 1.3 | **Complete i18n** (finish fr/pt, add de, zh) | 2 days | Medium -- doubles addressable audience |
| 1.4 | **More tests** (match WM's unit test coverage for core utils) | 1 day | Medium -- project maturity signal |
| 1.5 | **CONTRIBUTING.md + SECURITY.md** | 2 hours | Low -- project maturity signal |

### Tier 2: Medium effort (1-2 weeks each, minimal backend)

These features require some new code but stay within Watchboard's
static-site paradigm.

| Priority | Feature | Effort | Impact |
|---|---|---|---|
| 2.1 | **Client-side live data** (USGS earthquakes + OpenSky flights fetched directly in browser) | 3 days | High -- real-time capability with zero backend |
| 2.2 | **AI chat panel** (user provides own API key, client-side Anthropic calls) | 3 days | High -- interactive intelligence Q&A |
| 2.3 | **Country risk scores** (computed at build time from tracker data) | 3 days | Medium -- new analytical capability |
| 2.4 | **Prediction market widget** (Polymarket API, client-side or Astro API route) | 2 days | Medium -- forward-looking intelligence |
| 2.5 | **On-device ML** (embeddings model for semantic search across events) | 4 days | Medium -- AI-powered search |
| 2.6 | **Blog** (Astro content collections, 5-10 initial posts) | 3 days | Medium -- SEO, credibility |
| 2.7 | **Command palette search** (fuzzy Cmd+K across all trackers/sections) | 2 days | Low-medium -- UX improvement |

### Tier 3: Larger effort (2-4 weeks each, requires backend)

These features need server-side infrastructure (Vercel/Netlify API
routes, Redis, or external services).

| Priority | Feature | Effort | Impact |
|---|---|---|---|
| 3.1 | **API route layer** (Astro API routes proxying rate-limited external APIs) | 1 week | High -- enables all live data features |
| 3.2 | **Notification webhooks** (Slack/Telegram alerts from nightly pipeline) | 1 week | Medium -- engagement loop |
| 3.3 | **Desktop app** (Tauri 2 wrapping static site) | 2 weeks | Medium -- distribution channel |
| 3.4 | **MCP server** (expose tracker data as LLM tools) | 3 days | Low-medium -- developer ecosystem |
| 3.5 | **Authentication** (Clerk + user preferences) | 2 weeks | Low -- only if notification prefs needed |
| 3.6 | **Correlation engine** (cross-tracker signal detection) | 2 weeks | Low-medium -- analytical depth |
| 3.7 | **Full market data** (API proxies for Finnhub/Yahoo Finance) | 2 weeks | Low -- WM's strength, not WB's |

---

## Where Watchboard already wins

These are genuine differentiators that World Monitor cannot easily
replicate. Protect and deepen these advantages.

### 1. Deep per-topic intelligence (48 trackers)

World Monitor provides a single global dashboard. It cannot drill
into the Ayotzinapa disappearances, the Chernobyl disaster, or the
MH17 shootdown with dedicated timelines, casualty tables, political
grids, and claims matrices. Watchboard's config-driven tracker system
is a fundamentally different value proposition.

**Key files:**
- `src/lib/tracker-config.ts` -- TrackerConfigSchema
- `src/lib/tracker-registry.ts` -- Discovery and loading
- `trackers/*/tracker.json` -- Per-tracker configuration
- `trackers/*/data/` -- Per-tracker data

**Deepen this:** Add more tracker types (economic crises, elections,
pandemics). Improve the compare panel. Create tracker "series" that
link related events across time.

### 2. Automated AI data pipeline

World Monitor has no automated data curation. Its data comes raw from
upstream APIs. Watchboard's nightly pipeline is a unique capability:

- **Review manifests:** Per-tracker event gap detection with window
  calculation
- **Sibling briefs:** Cross-tracker context to prevent event
  duplication
- **Fix agent:** Automatic Zod error correction with pattern library
- **Build gate:** `npm run build` before commit to catch runtime
  errors
- **Metrics:** Full observability with per-run JSON, 90-day retention

**Key files:**
- `.github/workflows/update-data.yml` -- 3-phase pipeline
- `scripts/generate-review-manifest.ts` -- Gap detection
- `scripts/generate-sibling-brief.ts` -- Cross-tracker awareness
- `scripts/update-data.ts` -- Legacy AI updater

**Deepen this:** Improve AI update quality scoring. Add source
verification (check cited URLs are reachable). Add data drift
detection (flag sudden KPI changes).

### 3. Source tier classification

Watchboard's Tier 1-4 system with 4-pole media sourcing is rigorous
OSINT methodology that WM doesn't attempt:

- **Tier 1:** Official/primary (government, UN, IAEA)
- **Tier 2:** Major outlet (Reuters, AP, BBC, CNN)
- **Tier 3:** Institutional (CSIS, HRW, Oxford Economics)
- **Tier 4:** Unverified (social media, unattributed)

- **Poles:** Western, Middle Eastern, Eastern, International

Every data point carries source attribution with tier and pole
classification. The `SourceLegend.astro` component explains the
methodology to users.

**Deepen this:** Add source reliability scoring over time (track which
sources' claims prove accurate). Visualize pole distribution per
tracker.

### 4. Config-driven tracker creation

New trackers can be spun up in ~25 minutes via the `init-tracker.yml`
GitHub Actions workflow. This is zero-code tracker creation:

1. Dispatch workflow with slug, topic, start date, region
2. Claude Code generates `tracker.json` + empty data files
3. Validates against TrackerConfigSchema
4. Builds to verify no runtime errors
5. Auto-chains into `seed-tracker.yml` for historical backfill

WM cannot create topic-specific dashboards at all.

### 5. Broadcast mode

The TV news broadcast overlay is unique: lower-third headlines,
scrolling ticker, LIVE badge, auto-cycling globe fly-tos between
trackers. No equivalent in WM.

### 6. Embeddable widgets

The `/embed/[tracker]/` endpoint produces ~4KB self-contained HTML
widgets that third-party sites can iframe. WM has no equivalent.

### 7. Ingestion observability

The MetricsDashboard with uptime calendar, error trends, and
per-tracker health is more sophisticated than WM's basic
ServiceStatusPanel.

---

## World Monitor's internal architecture reference

This section documents WM's internal structure for reference when
implementing similar features in Watchboard.

### Panel system

All 118 panels extend `src/components/Panel.ts`, a base class that
provides:

- Debounced rendering (150ms)
- Loading/error states
- Info tooltip support
- Row span configuration
- Panel header with title + controls

Panels register in `src/config/panels.ts` with per-variant defaults
(priority, enabled state, premium gating).

### Data flow

```
App.ts → startSmartPollLoop() → loadAllData()
  → for each service: service.fetch() → cache check → API call
    → transform response → update AppContext
      → panel.update(data) → debounced render
```

### Cache hierarchy

| Tier | Storage | TTL | Use case |
|---|---|---|---|
| Bootstrap | Upstash Redis (seeded by Railway) | Until next seed | Initial page load data |
| In-memory | Per-Vercel-instance | Short (varies) | Hot path data |
| Redis | Upstash | 5m-24h by tier | Cross-instance sharing |
| Upstream | External APIs | N/A | Fallback source |

Cache keys must include all request-varying parameters.
`cachedFetchJson()` coalesces concurrent cache misses.

### Variant system

Runtime variant detection in `src/config/variant.ts`:

```
Tauri desktop → localStorage('worldmonitor-variant')
Browser → hostname prefix (tech., finance., happy., commodity.)
Localhost → localStorage fallback
Default → 'full'
```

Each variant controls: default panels, map layers, news feed sources,
theme accents, and panel priority ordering.

### Proto/RPC system

World Monitor uses a custom Protocol Buffer framework called "sebuf"
that maps `.proto` service definitions to HTTP endpoints:

```protobuf
rpc ListAirportDelays(ListAirportDelaysRequest)
    returns (ListAirportDelaysResponse) {
  option (sebuf.http.config) = {
    path: "/airport-delays"
    method: GET
  };
}
```

Code generation: `make generate` produces TypeScript clients
(`src/generated/client/`) and server stubs
(`src/generated/server/`).

Each domain has a Vercel Edge Function at
`api/{domain}/v1/[rpc].ts` that routes to handler functions in
`server/worldmonitor/{domain}/v1/`.

### Desktop sidecar

Tauri's Rust shell spawns a Node.js sidecar that:

1. Finds a free port dynamically
2. Loads edge function handlers from bundled `api/` directory
3. Accepts fetch requests from the renderer with 5-minute TTL tokens
4. Injects secrets from platform keyring into handler environment
5. Falls back to cloud API if sidecar is unavailable

---

## World Monitor testing reference

For comparison when improving Watchboard's test coverage.

### Test categories

| Category | Files | Framework | Location |
|---|---|---|---|
| Unit/integration | 80+ | `node:test` | `tests/*.test.{mjs,mts}` |
| Edge function | 5+ | `node:test` | `api/*.test.mjs` |
| Sidecar | 3+ | `node:test` | `src-tauri/sidecar/*.test.mjs` |
| E2E | 12 | Playwright | `e2e/*.spec.ts` |
| Visual regression | Per-variant golden snapshots | Playwright | `e2e/map-harness.spec.ts-snapshots/` |
| Data validation | Included in unit tests | `node:test` | `tests/` |
| RSS feed validation | 1 | Custom | `scripts/validate-rss-feeds.mjs` |

### Pre-push hook

WM runs automatically before every `git push`:

1. TypeScript check (src + API)
2. CJS syntax validation
3. Edge function esbuild bundle check
4. Edge function import guardrail test
5. Markdown lint
6. MDX lint (Mintlify docs)
7. Version sync check (desktop version matches package.json)

### CI workflows

| Workflow | Trigger | Checks |
|---|---|---|
| `typecheck.yml` | PR, push to main | `tsc --noEmit` |
| `lint.yml` | PR (markdown) | markdownlint-cli2 |
| `lint-code.yml` | PR | Biome lint |
| `proto-check.yml` | PR (proto) | Generated code freshness |
| `test.yml` | PR | Unit + integration tests |
| `deploy-gate.yml` | PR | Build verification |
| `build-desktop.yml` | Release tag | 5-platform matrix |
| `docker-publish.yml` | Release | Multi-arch Docker image |
| `test-linux-app.yml` | Manual | Linux AppImage smoke test |
| `contributor-trust.yml` | PR | New contributor checks |

---

## Strategic summary

Watchboard and World Monitor serve overlapping but distinct use cases.
World Monitor is a **wide, real-time global dashboard**. Watchboard is
a **deep, topic-specific intelligence platform** with AI-curated data.

The winning strategy is not to clone World Monitor. Instead:

1. **Keep deepening WB's advantages:** More trackers, better AI
   pipeline, richer source classification, better cross-tracker
   analysis
2. **Selectively add WM's most visible features:** Static map layers,
   client-side live data, AI chat, i18n, PWA
3. **Grow the project's maturity signals:** More tests, better docs,
   CONTRIBUTING.md, blog, GitHub Releases, more stars
4. **Resubmit to awesome-osint** once the project has 30-50+ stars
   and external validation (blog posts, OSINT newsletter mentions,
   conference talks)

The core insight: you don't need 155K lines of code to be on the
awesome-osint list. You need to be *awesome* at your specific thing.
Watchboard's specific thing -- deep, AI-curated, multi-topic
intelligence dashboards -- is already something World Monitor cannot
do.
