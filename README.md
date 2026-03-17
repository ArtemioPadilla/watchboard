# Watchboard — Multi-Topic Intelligence Platform

A config-driven intelligence dashboard platform for tracking events of interest. Each tracker is a self-contained dashboard with its own data, map region, sections, and AI update prompts. Built with Astro 5, TypeScript, and React — auto-updated nightly via AI web search.

**[Live Dashboard](https://artemiopadilla.github.io/watchboard/)**

---

## Active Trackers

| Tracker | Description | Sections | Map | Globe |
|---------|-------------|----------|-----|-------|
| **[Iran Conflict](https://artemiopadilla.github.io/watchboard/iran-conflict/)** | 2026 Iran-US/Israel conflict (Operation Epic Fury / Roaring Lion) | 9 | Middle East theater | 3D |
| **[Ayotzinapa](https://artemiopadilla.github.io/watchboard/ayotzinapa/)** | 2014 forced disappearance of 43 students in Iguala, Guerrero, Mexico | 6 | Mexico | — |

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
```

The platform auto-discovers all trackers at build time and generates:
- **Home page** (`/`) — card index of all trackers
- **Dashboard** (`/{slug}/`) — full dashboard with configured sections
- **3D Globe** (`/{slug}/globe/`) — if enabled in config
- **About** (`/{slug}/about/`) — per-tracker about page

### Adding a New Tracker

1. Create `trackers/{slug}/tracker.json` (copy from an existing tracker as template)
2. Configure: name, sections, map bounds/categories, AI prompts
3. Add seed data files in `trackers/{slug}/data/`
4. Run `npm run build` — done

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
│   └── ayotzinapa/
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
│   └── update-data.yml                # Nightly AI data refresh
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

Data is automatically refreshed daily at 6 AM UTC via GitHub Actions. The update script iterates over all trackers with AI sections configured, using each tracker's custom system prompt and search context.

### Supported Providers

| Provider | API Key Env Var | Model Env Var | Default Model |
|----------|----------------|---------------|---------------|
| **Anthropic** (default) | `ANTHROPIC_API_KEY` | `ANTHROPIC_MODEL` | `claude-sonnet-4-6` |
| **OpenAI** | `OPENAI_API_KEY` | `OPENAI_MODEL` | `gpt-4o` |

### Run locally

```bash
# Update all trackers
ANTHROPIC_API_KEY=sk-ant-... npm run update-data

# Update a specific tracker
TRACKER_SLUG=iran-conflict ANTHROPIC_API_KEY=sk-ant-... npm run update-data

# Using OpenAI
AI_PROVIDER=openai OPENAI_API_KEY=sk-... npm run update-data
```

### GitHub Actions setup

1. Go to repo **Settings > Secrets and variables > Actions**
2. Add `ANTHROPIC_API_KEY` (and/or `OPENAI_API_KEY`)
3. Optionally add `AI_PROVIDER` if using OpenAI

The workflow commits changes to `trackers/*/data/` and pushes to `main`, triggering the deploy workflow.

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
| `ai` | No | AI update config: systemPrompt, searchContext, enabledSections |
| `icon` | No | Emoji for index card |
| `color` | No | Accent color (hex) |

---

## Disclaimer

This platform aggregates publicly available information from multiple sources and perspectives. It does not endorse any particular political position or narrative. All contested claims are explicitly marked. Source classifications reflect general reliability tiers, not endorsements of specific reporting.

---

## License

MIT — use freely, attribute if you'd like.
