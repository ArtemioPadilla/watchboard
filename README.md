# Watchboard — Multi-Topic Intelligence Platform

A config-driven intelligence dashboard platform for tracking events of interest. Each tracker is a self-contained dashboard with its own data, map region, sections, and AI update prompts. Built with Astro 5, TypeScript, and React — auto-updated nightly via AI web search.

**[Live Dashboard](https://artemiopadilla.github.io/watchboard/)**

---

## Active Trackers

| Tracker | Description | Sections | Map | Globe |
|---------|-------------|----------|-----|-------|
| **[Iran Conflict](https://artemiopadilla.github.io/watchboard/iran-conflict/)** | 2026 Iran-US/Israel conflict (Operation Epic Fury / Roaring Lion) | 9 | Middle East theater | 3D |
| **[September 11](https://artemiopadilla.github.io/watchboard/september-11/)** | 2001 terrorist attacks on the US, War on Terror, 9/11 Commission, and long-term consequences | 8 | US (NYC, DC, PA) | 3D |
| **[Ayotzinapa](https://artemiopadilla.github.io/watchboard/ayotzinapa/)** | 2014 forced disappearance of 43 students in Iguala, Guerrero, Mexico | 6 | Guerrero, Mexico | 3D |
| **[Chernobyl Disaster Tracker](https://artemiopadilla.github.io/watchboard/chernobyl-disaster/)** | Intelligence dashboard tracking the 1986 Chernobyl nuclear disaster — reactor ex... | 8 | Ukraine / Belarus / Soviet Union / Northern Europe | 3D |
| **[MH17 Shootdown Tracker](https://artemiopadilla.github.io/watchboard/mh17-shootdown/)** | Intelligence dashboard tracking the 2014 downing of Malaysia Airlines Flight 17 ... | 7 | Eastern Ukraine / Netherlands / Russia / Malaysia | 3D |
| **[El Mencho / CJNG Tracker](https://artemiopadilla.github.io/watchboard/mencho-cjng/)** | Intelligence dashboard tracking the February 2026 killing of El Mencho (Nemesio ... | 7 | Jalisco / Michoacán / Colima / Guadalajara / Mexico | 3D |
| **[Culiacanazo Tracker](https://artemiopadilla.github.io/watchboard/culiacanazo/)** | Intelligence dashboard tracking the October 2019 Culiacán Crisis and January 202... | 7 | Culiacán / Sinaloa / Northwestern Mexico | 3D |
| **[Fukushima Daiichi Tracker](https://artemiopadilla.github.io/watchboard/fukushima-disaster/)** | Intelligence dashboard tracking the 2011 Fukushima Daiichi nuclear disaster — tr... | 8 | Fukushima Prefecture / Tohoku Region / Japan | 3D |
| **[Tlatelolco Massacre Tracker](https://artemiopadilla.github.io/watchboard/tlatelolco-1968/)** | Intelligence dashboard tracking the October 2, 1968 massacre at Plaza de las Tre... | 7 | Mexico City / Tlatelolco / Ciudad Universitaria | 3D |
| **[Ukraine War Tracker](https://artemiopadilla.github.io/watchboard/ukraine-war/)** | Intelligence dashboard tracking Russia's full-scale invasion of Ukraine: frontli... | 9 | Ukraine/Eastern Europe | 3D |
| **[Myanmar Civil War Tracker](https://artemiopadilla.github.io/watchboard/myanmar-civil-war/)** | Intelligence dashboard tracking Myanmar's ongoing civil war following the Februa... | 9 | Myanmar/Southeast Asia | 3D |

---

## How It Works

Each tracker is defined by a `tracker.json` config file + data directory:

```
trackers/
  iran-conflict/
    tracker.json          # Config: sections, map bounds, AI prompts, categories
    data/
      meta.json, kpis.json, timeline.json, map-points.json, ...
      events/             # Daily partitioned event files (YYYY-MM-DD.json)
  ayotzinapa/
    tracker.json
    data/...
  september-11/
    tracker.json
    data/...
```

The platform auto-discovers all trackers at build time and generates:
- **Home page** (`/`) — card index of all trackers
- **Dashboard** (`/{slug}/`) — full dashboard with configured sections
- **3D Globe** (`/{slug}/globe/`) — if enabled in config
- **About** (`/{slug}/about/`) — per-tracker about page

### Adding a New Tracker

**One-command via GitHub Actions (recommended):**

1. Go to **Actions > Initialize New Tracker**
2. Enter: slug, topic description, start date, geographic region
3. Claude Code generates the full config + empty data files
4. Auto-triggers **Seed Tracker Data** to backfill historical data
5. Result: fully populated tracker in ~20 minutes

**Manual:**

1. Create `trackers/{slug}/tracker.json` (copy from an existing tracker as template)
2. Configure: name, sections, map bounds/categories, AI prompts
3. Add seed data files in `trackers/{slug}/data/`
4. Run `npm run build` — done
5. Trigger **Seed Tracker Data** workflow to populate data

### Source Tier System

Every data point is classified:

- **Tier 1 — Primary/Official**: Government statements, official bodies
- **Tier 2 — Major Outlet**: Reuters, AP, CNN, BBC, Al Jazeera, etc.
- **Tier 3 — Institutional**: Research institutions, NGOs, watchdogs
- **Tier 4 — Unverified**: Social media, unattributed claims

---

## Tech Stack

- **[Astro 5](https://astro.build)** — static site generator with TypeScript
- **React** — interactive islands (map, timeline, military tabs, 3D globe)
- **CesiumJS** — 3D globe visualization
- **Leaflet** — 2D interactive mapping
- **Zod** — runtime schema validation for data integrity
- **Anthropic Claude / OpenAI** — nightly AI-powered data updates via web search
- **GitHub Actions** — CI/CD: auto-deploy + scheduled data refresh

---

## Project Structure

```
watchboard/
├── trackers/                          # Tracker configs + data
│   ├── iran-conflict/
│   │   ├── tracker.json               # Tracker config
│   │   └── data/                      # JSON data files
│   │       ├── meta.json, kpis.json, timeline.json, ...
│   │       └── events/                # Daily event partitions
│   ├── ayotzinapa/
│   │   ├── tracker.json
│   │   └── data/...
│   └── september-11/
│       ├── tracker.json
│       └── data/...
├── src/
│   ├── pages/
│   │   ├── index.astro                # Home: tracker index
│   │   └── [tracker]/                 # Dynamic routes per tracker
│   │       ├── index.astro            # Dashboard
│   │       ├── globe.astro            # 3D globe (if enabled)
│   │       └── about.astro            # About page
│   ├── layouts/BaseLayout.astro       # HTML shell, SEO, fonts
│   ├── components/
│   │   ├── static/                    # Server-rendered (zero JS)
│   │   └── islands/                   # Client-hydrated React
│   ├── lib/
│   │   ├── tracker-config.ts          # TrackerConfigSchema (Zod)
│   │   ├── tracker-registry.ts        # Auto-discovers trackers
│   │   ├── data.ts                    # loadTrackerData(slug)
│   │   ├── schemas.ts                 # Data Zod schemas
│   │   └── ...                        # Utilities
│   └── styles/global.css              # Dark theme
├── scripts/
│   └── update-data.ts                 # AI nightly updater (multi-tracker)
├── .github/workflows/
│   ├── deploy.yml                     # Build + deploy to GitHub Pages
│   ├── update-data.yml                # Nightly AI data refresh (interval-gated per tracker)
│   ├── init-tracker.yml               # One-command new tracker creation via Claude Code
│   └── seed-tracker.yml               # Comprehensive historical data backfill
└── package.json
```

---

## Getting Started

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

---

## Nightly AI Updates

Data is automatically refreshed daily at 6 AM UTC via GitHub Actions. Each tracker has a configurable `updateIntervalDays` (e.g., daily for active conflicts, every 180 days for cold cases). The workflow resolves which trackers are due, then uses Claude Code with web search to update each one.

### GitHub Actions Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| **Nightly Data Update** | Daily 6 AM UTC + manual | Updates eligible trackers (interval-gated) via Claude Code web search |
| **Initialize New Tracker** | Manual | Generates tracker.json + empty data files from a topic description |
| **Seed Tracker Data** | Manual (or chained from init) | Deep historical backfill — populates all sections with research data |
| **Deploy** | Push to main | Builds Astro site + deploys to GitHub Pages |

All data workflows use `claude-code-action` with a Claude Max subscription OAuth token (`CLAUDE_CODE_OAUTH_TOKEN`) — no per-token API costs. Each run produces a job summary with data inventory tables visible in the Actions UI.

### GitHub Actions setup

1. Go to repo **Settings > Secrets and variables > Actions**
2. Add `CLAUDE_CODE_OAUTH_TOKEN` (generate via `claude setup-token` with a Max subscription)
3. The workflows commit data changes to `trackers/*/data/` and push to `main`, triggering deploy

### Run locally (legacy script)

```bash
# Update all trackers via direct API
ANTHROPIC_API_KEY=sk-ant-... npm run update-data

# Update a specific tracker
TRACKER_SLUG=iran-conflict ANTHROPIC_API_KEY=sk-ant-... npm run update-data
```

---

## Deployment

### GitHub Pages (Recommended)

1. Go to repo **Settings > Pages**
2. Set source to **GitHub Actions**
3. The included workflow auto-deploys on every push to `main`
4. Site available at: `https://<username>.github.io/watchboard/`

### Other hosts

```bash
npm run build
# Deploy the dist/ directory to any static host
```

---

## Tracker Config Reference

Each `tracker.json` supports these fields:

| Field | Required | Description |
|-------|----------|-------------|
| `slug` | Yes | URL path segment (lowercase, hyphens) |
| `name` | Yes | Full display name |
| `shortName` | Yes | Card/header title |
| `description` | Yes | SEO and card description |
| `status` | Yes | `active`, `archived`, or `draft` |
| `startDate` | Yes | ISO date string (for day count) |
| `sections` | Yes | Array of section IDs to render |
| `navSections` | Yes | Navigation structure |
| `map` | No | Map config: bounds, center, categories |
| `globe` | No | Globe config: camera presets |
| `militaryTabs` | No | Custom tab labels for military section |
| `politicalAvatars` | No | Avatar IDs for political figures |
| `eventTypes` | No | Custom event type strings |
| `ai` | No | AI update config: systemPrompt, searchContext, enabledSections, updateIntervalDays, backfillTargets |
| `icon` | No | Emoji for index card |
| `color` | No | Accent color (hex) |

---

## Disclaimer

This platform aggregates publicly available information from multiple sources and perspectives. It does not endorse any particular political position or narrative. All contested claims are explicitly marked. Source classifications reflect general reliability tiers, not endorsements of specific reporting.

---

## License

MIT — use freely, attribute if you'd like.
