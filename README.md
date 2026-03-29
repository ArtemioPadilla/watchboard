<div align="center">

# Watchboard

**Multi-Topic Intelligence Dashboard Platform**

Track conflicts, disasters, political histories, and more — with AI-powered nightly updates, interactive maps, and 3D globes.

[![GitHub Stars](https://img.shields.io/github/stars/ArtemioPadilla/watchboard?style=flat-square&logo=github&color=yellow)](https://github.com/ArtemioPadilla/watchboard/stargazers)
[![Last Commit](https://img.shields.io/github/last-commit/ArtemioPadilla/watchboard?style=flat-square&logo=github)](https://github.com/ArtemioPadilla/watchboard/commits/main)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![Build Status](https://img.shields.io/github/actions/workflow/status/ArtemioPadilla/watchboard/deploy.yml?style=flat-square&logo=githubactions&label=build)](https://github.com/ArtemioPadilla/watchboard/actions/workflows/deploy.yml)
[![Powered by Claude Code](https://img.shields.io/badge/Powered%20by-Claude%20Code-7C3AED?style=flat-square&logo=anthropic)](https://claude.ai/code)

**[Live Dashboard](https://artemiop.com/watchboard/)** — **[How to Add a Tracker](#adding-a-new-tracker)** — **[Request a Topic](https://github.com/ArtemioPadilla/watchboard/issues/new?template=tracker-request.md)**

</div>

---

## Features

- **48 active trackers** across conflicts, disasters, political histories, science, and culture
- **Config-driven architecture** — each tracker is a `tracker.json` + data directory; no code changes needed
- **AI nightly updates** — Claude Code with web search refreshes eligible trackers automatically at 6 AM UTC
- **Interactive 2D maps** — Leaflet with strike arcs, overlay layers (no-fly zones, GPS jamming, earthquakes), live flights, and day/night terminator
- **3D globe visualization** — CesiumJS with missile animations, satellite tracking, cinematic event mode, and live ship AIS data
- **Full-text search** — Pagefind indexes all 190+ pages at build time; zero runtime overhead
- **Source tier system** — every data point classified Tier 1–4 (official → unverified); contested claims explicitly flagged
- **One-command tracker creation** — GitHub Actions `init-tracker.yml` generates a fully populated tracker in ~25 minutes via Claude Code
- **Embeddable widgets** — each tracker has a `/embed/{slug}/` page (~4 KB, theme-aware) for third-party embedding

---

## Active Trackers

### Featured

| Icon | Tracker | Topic | Region | Live |
|------|---------|-------|--------|------|
| ⚔️ | **Iran Conflict** | 2026 Iran-US/Israel conflict — Operation Epic Fury / Roaring Lion | Middle East | [Dashboard](https://artemiop.com/watchboard/iran-conflict/) |
| 🇺🇦 | **Ukraine War** | Russia's full-scale invasion — frontlines, casualties, diplomacy | Eastern Europe | [Dashboard](https://artemiop.com/watchboard/ukraine-war/) |
| 🕊️ | **Gaza War** | Israel-Gaza war — ground ops, humanitarian crisis, ICJ proceedings | Israel/Gaza | [Dashboard](https://artemiop.com/watchboard/gaza-war/) |
| 🕊️ | **Israel-Palestine** | The full arc from 1948 founding to present | Middle East | [Dashboard](https://artemiop.com/watchboard/israel-palestine/) |
| 🗽 | **September 11** | 2001 attacks, War on Terror, 9/11 Commission | USA | [Dashboard](https://artemiop.com/watchboard/september-11/) |

<details>
<summary><strong>All 48 trackers</strong></summary>

| Icon | Tracker | Topic | Region | Link |
|------|---------|-------|--------|------|
| 🏔️ | Afghanistan-Pakistan War | US invasion, Taliban insurgency, ISIS-K, TTP attacks | Afghanistan/Pakistan | [Dashboard](https://artemiop.com/watchboard/afghanistan-pakistan-war/) |
| 🌹 | AMLO Presidency | Fourth Transformation, Tren Maya, AIFA, constitutional reforms (2018–2024) | Mexico | [Dashboard](https://artemiop.com/watchboard/amlo-presidency/) |
| 🌙 | NASA Artemis Program | Return to Moon, SLS, Orion, Gateway station, SpaceX/Blue Origin | USA/Global | [Dashboard](https://artemiop.com/watchboard/artemis-program/) |
| 🕯️ | Ayotzinapa | Forced disappearance of 43 students in Iguala, Guerrero (2014) | Mexico | [Dashboard](https://artemiop.com/watchboard/ayotzinapa/) |
| 🐰 | Bad Bunny | SoundCloud to reggaeton star, YHLQMDLG, Un Verano Sin Ti, world tours | Puerto Rico/Global | [Dashboard](https://artemiop.com/watchboard/bad-bunny/) |
| 🎤 | BTS | K-pop global rise, UN speeches, military service, ARMY fandom | South Korea/Global | [Dashboard](https://artemiop.com/watchboard/bts/) |
| ⚔️ | Felipe Calderón Presidency | War on drugs, military vs cartels, Mérida Initiative (2006–2012) | Mexico | [Dashboard](https://artemiop.com/watchboard/calderon-presidency/) |
| ☢️ | Chernobyl Disaster | 1986 nuclear disaster — reactor explosion, liquidators, fallout | Ukraine/USSR | [Dashboard](https://artemiop.com/watchboard/chernobyl-disaster/) |
| 🇨🇱 | Chile: Allende to Pinochet | Socialist government, CIA intervention, 1973 coup, Operation Condor | Chile | [Dashboard](https://artemiop.com/watchboard/chile-allende-pinochet/) |
| 🤖 | China Tech Revolution | Made in China 2025, AI race, Huawei, TikTok, DeepSeek, US decoupling | China/Global | [Dashboard](https://artemiop.com/watchboard/china-tech-revolution/) |
| 🦠 | COVID-19 Pandemic | Wuhan origin, lockdowns, vaccines, variant waves, WHO response | Global | [Dashboard](https://artemiop.com/watchboard/covid-pandemic/) |
| 🇨🇺 | Cuba Crises | Revolution, Bay of Pigs, Missile Crisis, embargo, 2021 protests | Cuba/Caribbean | [Dashboard](https://artemiop.com/watchboard/cuba-crises/) |
| 🔫 | Culiacanazo | October 2019 Culiacán Crisis and January 2023 Chapo Jr. capture | Sinaloa, Mexico | [Dashboard](https://artemiop.com/watchboard/culiacanazo/) |
| ⛵ | European Conquest of the Americas | Columbus, conquistadors, Aztec/Inca fall, colonization, Columbian Exchange | Americas | [Dashboard](https://artemiop.com/watchboard/european-conquest-americas/) |
| 🦊 | Vicente Fox Presidency | Mexico's first opposition president, democratic transition (2000–2006) | Mexico | [Dashboard](https://artemiop.com/watchboard/fox-presidency/) |
| ☢️ | Fukushima Daiichi | 2011 nuclear disaster — tsunami, meltdowns, TEPCO, decommission | Japan | [Dashboard](https://artemiop.com/watchboard/fukushima-disaster/) |
| 🕊️ | Gaza War | Ground operations, ceasefire talks, humanitarian crisis, displacement | Israel/Gaza | [Dashboard](https://artemiop.com/watchboard/gaza-war/) |
| 📉 | Global Recession Risk | Tariff escalation, bond stress, China slowdown, central bank policy | Global | [Dashboard](https://artemiop.com/watchboard/global-recession-risk/) |
| 🇭🇹 | Haiti Collapse | Moïse assassination, gang control, transitional council, UN intervention | Haiti/Caribbean | [Dashboard](https://artemiop.com/watchboard/haiti-collapse/) |
| 🛂 | ICE History | ICE creation post-9/11, family separations, mass deportation campaign | USA/Mexico | [Dashboard](https://artemiop.com/watchboard/ice-history/) |
| 🇮🇳 | India-Pakistan Conflict | Partition, Kashmir dispute, four wars, nuclear tests, Kargil, Mumbai | South Asia | [Dashboard](https://artemiop.com/watchboard/india-pakistan-conflict/) |
| ⚔️ | Iran Conflict | 2026 Iran-US/Israel conflict — Operation Epic Fury | Middle East | [Dashboard](https://artemiop.com/watchboard/iran-conflict/) |
| 🕊️ | Israel-Palestine Conflict | 1948 to present — wars, Oslo Accords, intifadas, settlements | Middle East | [Dashboard](https://artemiop.com/watchboard/israel-palestine/) |
| 🎯 | El Mencho / CJNG | February 2026 killing of El Mencho, CJNG territorial control | Mexico | [Dashboard](https://artemiop.com/watchboard/mencho-cjng/) |
| 🗺️ | Mexico-US Wars | Texas Revolution, Alamo, Mexican-American War, Treaty of Guadalupe Hidalgo | Mexico/USA | [Dashboard](https://artemiop.com/watchboard/mexico-us-conflict/) |
| ✈️ | MH17 Shootdown | 2014 downing of Malaysia Airlines Flight 17 over eastern Ukraine | Eastern Ukraine | [Dashboard](https://artemiop.com/watchboard/mh17-shootdown/) |
| 🇲🇽 | Mexican Political History | PRI hegemony, democratic transition, PRI/PAN/PRD/Morena evolution | Mexico | [Dashboard](https://artemiop.com/watchboard/mx-political-history/) |
| 🇲🇲 | Myanmar Civil War | Post-coup civil war following February 2021 military takeover | Myanmar/SE Asia | [Dashboard](https://artemiop.com/watchboard/myanmar-civil-war/) |
| 🛡️ | NATO-US Tensions | Burden-sharing disputes, Article 5 questions, European autonomy | Europe/N. America | [Dashboard](https://artemiop.com/watchboard/nato-us-tensions/) |
| 🔴 | October 7th Attack | Hamas-led assault on Israel — kibbutz raids, hostages, IDF response | Israel/Gaza | [Dashboard](https://artemiop.com/watchboard/october-7-attack/) |
| 🏛️ | Enrique Peña Nieto Presidency | Structural reforms, Ayotzinapa crisis, Casa Blanca scandal (2012–2018) | Mexico | [Dashboard](https://artemiop.com/watchboard/pena-nieto-presidency/) |
| ⚛️ | Quantum Theory | Planck, Einstein, Bohr, Heisenberg, Copenhagen, Bell theorem, quantum computing | Global | [Dashboard](https://artemiop.com/watchboard/quantum-theory/) |
| 🌍 | Sahel Insurgency | JNIM/ISGS expansion, military coups, Wagner Group, French withdrawal | Sahel/North Africa | [Dashboard](https://artemiop.com/watchboard/sahel-insurgency/) |
| 🗽 | September 11 Attacks | 2001 al-Qaeda attacks, War on Terror, 9/11 Commission | USA | [Dashboard](https://artemiop.com/watchboard/september-11/) |
| 🔬 | Claudia Sheinbaum Presidency | First female president of Mexico, judicial reform, US-Mexico relations | Mexico | [Dashboard](https://artemiop.com/watchboard/sheinbaum-presidency/) |
| 💊 | Sinaloa Cartel Fragmentation | Mayo Zambada capture, Chapitos vs Mayos faction war, fentanyl (2024–) | Mexico/Sinaloa | [Dashboard](https://artemiop.com/watchboard/sinaloa-fragmentation/) |
| 🦁 | Somalia Conflict | Al-Shabaab insurgency, AMISOM, US drone strikes, state fragility | Somalia/Horn of Africa | [Dashboard](https://artemiop.com/watchboard/somalia-conflict/) |
| 🌊 | SE Asia Escalation | South China Sea militarization, AUKUS, Philippines-China clashes | SE Asia/Pacific | [Dashboard](https://artemiop.com/watchboard/southeast-asia-escalation/) |
| 🚀 | SpaceX History | Falcon 1, Falcon 9 reusability, Dragon, Starlink, Starship, Mars | USA/Global | [Dashboard](https://artemiop.com/watchboard/spacex-history/) |
| ⚔️ | Sudan Civil War | SAF vs RSF, Khartoum battle, Darfur ethnic violence, displacement | Sudan/East Africa | [Dashboard](https://artemiop.com/watchboard/sudan-conflict/) |
| 🗺️ | Taiwan Strait Tensions | PLA exercises, TSMC, US arms sales, Taiwan Strait incidents | Taiwan/East Asia | [Dashboard](https://artemiop.com/watchboard/taiwan-conflict/) |
| 🕯️ | Tlatelolco Massacre | October 2, 1968 massacre at Plaza de las Tres Culturas, Mexico City | Mexico City | [Dashboard](https://artemiop.com/watchboard/tlatelolco-1968/) |
| 🦅 | Trump Presidencies | 45th and 47th president — immigration, trade wars, Jan 6, tariffs | USA/Global | [Dashboard](https://artemiop.com/watchboard/trump-presidencies/) |
| 🇺🇦 | Ukraine War | Russia's full-scale invasion — frontlines, casualties, diplomacy | Eastern Europe | [Dashboard](https://artemiop.com/watchboard/ukraine-war/) |
| 🌎 | US Interventions in Latin America | CIA coups, Operation Condor, Panama, Guatemala 1954, Nicaragua Contras | Latin America | [Dashboard](https://artemiop.com/watchboard/usa-latam-interventions/) |
| ⚽ | FIFA World Cup 2026 | First 48-team tournament, tri-host USA/Mexico/Canada, venues, schedule | USA/Mexico/Canada | [Dashboard](https://artemiop.com/watchboard/world-cup-2026/) |
| 🪖 | World War I | The Great War 1914–1918 — Somme, Verdun, Gallipoli, Versailles | Europe/Global | [Dashboard](https://artemiop.com/watchboard/world-war-1/) |
| ⚔️ | World War II | WWII 1939–1945 — Holocaust, Stalingrad, Normandy, atomic bombs | Europe/Pacific | [Dashboard](https://artemiop.com/watchboard/world-war-2/) |

</details>

---

## Quick Start

```bash
git clone https://github.com/ArtemioPadilla/watchboard.git
cd watchboard
npm install
npm run dev
```

Open [http://localhost:4321/watchboard/](http://localhost:4321/watchboard/).

```bash
npm run build    # Type-check + build static site to dist/
npm run preview  # Preview production build locally
```

---

## How It Works

### Tracker Structure

Each tracker is a self-contained directory under `trackers/`:

```
trackers/{slug}/
  tracker.json          # Config: name, sections, map bounds, AI prompts, categories
  data/
    meta.json           # Title, day count, last updated
    kpis.json           # Key performance indicators strip
    timeline.json       # Historical eras + crisis timeline
    map-points.json     # Geographic points of interest
    map-lines.json      # Strike arcs, supply routes, frontlines
    casualties.json     # Casualty table with tier/contested flags
    political.json      # Political figures grid
    ...                 # Other section-specific data files
    events/             # Daily partitioned event files (YYYY-MM-DD.json)
```

At build time, `src/lib/tracker-registry.ts` auto-discovers all non-draft trackers and `src/pages/[tracker]/index.astro` generates a page for each one via `getStaticPaths()`.

### One-Command Tracker Creation (~25 min)

1. Go to **[Actions > Initialize New Tracker](https://github.com/ArtemioPadilla/watchboard/actions/workflows/init-tracker.yml)**
2. Enter: `slug`, topic description, start date, geographic region
3. Claude Code generates `tracker.json` + empty data files, validates schema, builds
4. Auto-triggers **Seed Tracker Data** to backfill historical data with deep web research
5. Result: a fully populated, deployed tracker

### Source Tier System

Every data point carries a source classification:

| Tier | Label | Examples |
|------|-------|---------|
| **1** | Primary / Official | Government statements, UN, IAEA, official bodies |
| **2** | Major Outlet | Reuters, AP, BBC, CNN, Al Jazeera |
| **3** | Institutional | CSIS, HRW, Oxford Economics, think tanks |
| **4** | Unverified | Social media, unattributed claims |

Contested figures are explicitly flagged with `'yes'`, `'evolving'`, `'heavily'`, or `'partial'`.

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Framework | [Astro 5](https://astro.build) | Static site generation + TypeScript |
| UI | [React 19](https://react.dev) | Interactive islands (map, timeline, globe) |
| 3D Globe | [CesiumJS](https://cesium.com) + [Resium](https://resium.reearth.io) | Missile animations, satellites, cinematic mode |
| 2D Map | [Leaflet](https://leafletjs.com) | Strike arcs, overlays, live flights, AIS ships |
| Validation | [Zod 3](https://zod.dev) | Runtime schema validation for all data files |
| Search | [Pagefind](https://pagefind.app) | Build-time full-text index, zero runtime JS |
| AI | [Claude Code](https://claude.ai/code) (Max OAuth) | Nightly data updates via web search |
| CI/CD | GitHub Actions | Build + deploy + nightly data refresh |
| Hosting | GitHub Pages | Static deployment at `artemiop.com/watchboard/` |

---

## Nightly AI Updates

Data is automatically refreshed at 6 AM UTC via GitHub Actions. Each tracker has a configurable `updateIntervalDays` — active conflicts update daily; historical cases update every 30–180 days. The workflow resolves which trackers are due, then uses Claude Code with web search to update each one.

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| **Nightly Data Update** | Daily 6 AM UTC + manual | Updates eligible trackers (interval-gated) via Claude Code web search |
| **Initialize New Tracker** | Manual dispatch | Generates `tracker.json` + empty data files from a topic description |
| **Seed Tracker Data** | Manual (or chained from init) | Deep historical backfill — populates all sections with research data |
| **Deploy** | Push to `main` | Builds Astro site and deploys to GitHub Pages |

All data workflows use `claude-code-action` with a Claude Max subscription OAuth token (`CLAUDE_CODE_OAUTH_TOKEN`) — no per-token API costs.

### Setup

1. Fork this repo
2. Go to **Settings > Pages** — set source to **GitHub Actions**
3. Go to **Settings > Secrets > Actions** — add `CLAUDE_CODE_OAUTH_TOKEN`
   - Generate via `claude setup-token` with a Claude Max subscription
4. Push to `main` — the site deploys automatically; nightly updates start the next day

### Local updates (direct API)

```bash
# Update all trackers
ANTHROPIC_API_KEY=sk-ant-... npm run update-data

# Update a specific tracker
TRACKER_SLUG=iran-conflict ANTHROPIC_API_KEY=sk-ant-... npm run update-data
```

---

## Project Structure

```
watchboard/
├── trackers/                          # One directory per tracker
│   ├── iran-conflict/
│   │   ├── tracker.json               # Config: sections, map, AI prompts
│   │   └── data/                      # JSON data + events/ partitions
│   └── ...                            # 47 more trackers
├── src/
│   ├── pages/
│   │   ├── index.astro                # Home: tracker card index
│   │   ├── search.astro               # Pagefind full-text search
│   │   ├── rss.xml.ts                 # Global RSS feed
│   │   ├── embed/[tracker].astro      # Embeddable widget pages
│   │   └── [tracker]/                 # Dynamic routes per tracker
│   │       ├── index.astro            # Dashboard
│   │       ├── globe.astro            # 3D globe (if enabled)
│   │       ├── about.astro            # About page
│   │       └── rss.xml.ts             # Per-tracker RSS feed
│   ├── layouts/BaseLayout.astro       # HTML shell, SEO, fonts
│   ├── components/
│   │   ├── static/                    # Server-rendered (zero client JS)
│   │   │   ├── Header.astro
│   │   │   ├── Hero.astro
│   │   │   ├── KpiStrip.astro
│   │   │   ├── CasualtyTable.astro
│   │   │   ├── PoliticalGrid.astro
│   │   │   └── ...
│   │   └── islands/                   # Client-hydrated React components
│   │       ├── IntelMap.tsx           # Leaflet 2D map
│   │       ├── TimelineSection.tsx    # Click-to-expand timeline
│   │       ├── MilitaryTabs.tsx       # Tabbed military view
│   │       └── CesiumGlobe/           # 3D globe + hooks
│   ├── lib/
│   │   ├── tracker-config.ts          # TrackerConfigSchema (Zod) + types
│   │   ├── tracker-registry.ts        # Auto-discovers all trackers
│   │   ├── data.ts                    # loadTrackerData(slug)
│   │   ├── schemas.ts                 # All data Zod schemas (16 schemas)
│   │   └── ...                        # Utilities (map, tier, timeline)
│   └── styles/global.css              # Dark theme, CSS custom properties
├── scripts/
│   └── update-data.ts                 # AI nightly updater (multi-tracker)
├── .github/workflows/
│   ├── deploy.yml                     # Build + deploy to GitHub Pages
│   ├── update-data.yml                # Nightly AI data refresh
│   ├── init-tracker.yml               # One-command tracker creation
│   └── seed-tracker.yml               # Historical data backfill
└── package.json
```

---

## Contributing

Contributions are welcome. The most impactful ways to contribute:

- **[Request a new tracker topic](https://github.com/ArtemioPadilla/watchboard/issues/new?template=tracker-request.md)** — open an issue with the topic, region, and start date
- **[Report a data error](https://github.com/ArtemioPadilla/watchboard/issues/new?template=data-correction.md)** — incorrect facts, wrong source tier, missing events
- **[Suggest a feature](https://github.com/ArtemioPadilla/watchboard/issues/new?template=feature-request.md)** — new section types, map layers, visualization ideas
- **Submit a PR** — fix a bug, improve documentation, or add a missing data point

For code contributions, run `npm run build` to verify the TypeScript compiles and all tracker schemas validate before opening a PR.

---

## Disclaimer

This platform aggregates publicly available information from multiple sources and perspectives. It does not endorse any particular political position or narrative. All contested claims are explicitly marked. Source tier classifications reflect general reliability categories, not endorsements of specific reporting or outlets.

---

## License

MIT — use freely, attribute if you'd like.
