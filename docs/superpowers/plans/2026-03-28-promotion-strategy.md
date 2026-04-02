# Watchboard Promotion Strategy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement all three layers of the promotion strategy: foundation polish (SEO, README, contributor experience), automated content engine (social draft generation, weekly digests), and platform amplification (guide page).

**Architecture:** Adds `@astrojs/sitemap` for SEO, enhances README with badges and structure, creates CONTRIBUTING.md + issue templates, adds a `scripts/generate-social-drafts.ts` script integrated into the nightly pipeline, a weekly digest GitHub Action, and a `/guide` page.

**Tech Stack:** Astro 5, TypeScript, GitHub Actions, Zod

---

## File Structure

### New Files
- `public/robots.txt` — robots directives + sitemap link
- `.github/ISSUE_TEMPLATE/tracker-request.yml` — structured tracker request form
- `.github/ISSUE_TEMPLATE/data-correction.yml` — data correction report form
- `.github/ISSUE_TEMPLATE/bug-report.yml` — standard bug report form
- `.github/ISSUE_TEMPLATE/config.yml` — template chooser config
- `CONTRIBUTING.md` — contributor guide
- `scripts/generate-social-drafts.ts` — generates platform-specific social posts from digest data
- `.github/workflows/weekly-digest.yml` — weekly summary workflow
- `src/pages/guide.astro` — "Build Your Own Tracker" tutorial page

### Modified Files
- `package.json` — add `@astrojs/sitemap` dependency
- `astro.config.mjs` — add sitemap integration
- `src/layouts/BaseLayout.astro` — add hreflang tags
- `README.md` — add badges, hero section, better structure
- `.github/workflows/update-data.yml` — add social draft generation step in finalize phase

---

### Task 1: SEO — Sitemap + Robots.txt

**Files:**
- Modify: `package.json`
- Modify: `astro.config.mjs`
- Create: `public/robots.txt`

- [ ] **Step 1: Install @astrojs/sitemap**

```bash
npm install @astrojs/sitemap
```

- [ ] **Step 2: Add sitemap integration to astro.config.mjs**

Replace the current `astro.config.mjs` content:

```js
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  integrations: [react(), sitemap()],
  output: 'static',
  site: 'https://watchboard.dev',
  base: '/watchboard',
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'es', 'fr', 'pt'],
    routing: {
      prefixDefaultLocale: false,
    },
  },
  vite: {
    define: {
      CESIUM_BASE_URL: JSON.stringify('/watchboard/cesium/'),
    },
  },
});
```

- [ ] **Step 3: Create robots.txt**

Create `public/robots.txt`:

```
User-agent: *
Allow: /

Sitemap: https://watchboard.dev/sitemap-index.xml
```

- [ ] **Step 4: Verify build succeeds**

```bash
npm run build
```

Expected: Build succeeds, `dist/sitemap-index.xml` and `dist/sitemap-0.xml` are generated.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json astro.config.mjs public/robots.txt
git commit -m "feat(seo): add sitemap generation and robots.txt"
```

---

### Task 2: SEO — Hreflang Tags

**Files:**
- Modify: `src/layouts/BaseLayout.astro:44` (after canonical link)

- [ ] **Step 1: Add hreflang alternate links to BaseLayout.astro**

After the existing `<link rel="canonical" ...>` line (line 44), add hreflang tags:

```astro
<link rel="alternate" hreflang="en" href={pageUrl} />
<link rel="alternate" hreflang="es" href={pageUrl.replace(basePath, `${basePath}es/`)} />
<link rel="alternate" hreflang="fr" href={pageUrl.replace(basePath, `${basePath}fr/`)} />
<link rel="alternate" hreflang="pt" href={pageUrl.replace(basePath, `${basePath}pt/`)} />
<link rel="alternate" hreflang="x-default" href={pageUrl} />
```

- [ ] **Step 2: Verify build succeeds**

```bash
npm run build
```

Expected: Build succeeds. Check any HTML file in `dist/` for hreflang tags.

- [ ] **Step 3: Commit**

```bash
git add src/layouts/BaseLayout.astro
git commit -m "feat(seo): add hreflang alternate links for i18n"
```

---

### Task 3: README Enhancement

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace README.md with enhanced version**

The enhanced README adds:
- Shields.io badges (stars, last commit, license, tracker count, build status)
- "Powered by Claude Code" badge
- Hero screenshot placeholder (will be replaced with actual screenshot later)
- Cleaner section ordering
- "Features" section highlighting key capabilities
- Improved "Quick Start" and "How It Works" flow

```markdown
<div align="center">

# Watchboard

**AI-Powered Intelligence Dashboards for Any Topic**

[![GitHub stars](https://img.shields.io/github/stars/ArtemioPadilla/watchboard?style=flat-square)](https://github.com/ArtemioPadilla/watchboard/stargazers)
[![Last commit](https://img.shields.io/github/last-commit/ArtemioPadilla/watchboard?style=flat-square)](https://github.com/ArtemioPadilla/watchboard/commits/main)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![Build](https://img.shields.io/github/actions/workflow/status/ArtemioPadilla/watchboard/deploy.yml?style=flat-square&label=deploy)](https://github.com/ArtemioPadilla/watchboard/actions/workflows/deploy.yml)
[![Powered by Claude Code](https://img.shields.io/badge/Powered%20by-Claude%20Code-blueviolet?style=flat-square)](https://claude.ai/code)

A config-driven platform for building intelligence dashboards. Each tracker is self-contained with its own data, map region, 3D globe, and AI update prompts. Create a new tracker in 25 minutes.

**[Live Dashboard](https://watchboard.dev/)** · **[Guide](https://watchboard.dev/guide/)** · **[Request a Tracker](https://github.com/ArtemioPadilla/watchboard/issues/new?template=tracker-request.yml)**

</div>

---

## Features

- **48 Intelligence Trackers** — conflicts, disasters, political history, science, culture
- **3D Globe** — CesiumJS with missile trajectories, camera presets, cinematic mode
- **Interactive Maps** — Leaflet with category filters, strike visualization, clustering
- **AI-Powered Updates** — nightly web search across 4 media poles (Western, Middle Eastern, Eastern, International)
- **Source Tier System** — every data point classified Tier 1-4 with contested claims marked
- **25-Minute Tracker Creation** — one GitHub Actions dispatch creates a fully populated dashboard
- **Multi-Language** — English, Spanish, French, Portuguese
- **RSS Feeds** — per-tracker digests, global feed
- **Full-Text Search** — Pagefind-powered search across all trackers

---

## Active Trackers

| Tracker | Description | Sections | Map | Globe |
|---------|-------------|----------|-----|-------|
| **[Iran Conflict](https://watchboard.dev/iran-conflict/)** | 2026 Iran-US/Israel conflict (Operation Epic Fury / Roaring Lion) | 9 | Middle East theater | 3D |
| **[Ukraine War](https://watchboard.dev/ukraine-war/)** | Russia's full-scale invasion of Ukraine: frontlines, sanctions, NATO response | 9 | Ukraine/Eastern Europe | 3D |
| **[September 11](https://watchboard.dev/september-11/)** | 2001 terrorist attacks, War on Terror, 9/11 Commission | 8 | US (NYC, DC, PA) | 3D |
| **[Gaza War](https://watchboard.dev/gaza-war/)** | Israel-Gaza war: ground ops, ceasefire negotiations, humanitarian crisis | 9 | Gaza/Israel/Middle East | 3D |
| **[Chernobyl](https://watchboard.dev/chernobyl-disaster/)** | 1986 nuclear disaster — reactor explosion, fallout, exclusion zone | 8 | Ukraine/Belarus | 3D |

<details>
<summary><strong>See all 48 trackers</strong></summary>

| Tracker | Domain | Region |
|---------|--------|--------|
| [Ayotzinapa](https://watchboard.dev/ayotzinapa/) | Human Rights | Mexico |
| [MH17 Shootdown](https://watchboard.dev/mh17-shootdown/) | Disaster | Ukraine/Netherlands |
| [El Mencho / CJNG](https://watchboard.dev/mencho-cjng/) | Security | Mexico |
| [Culiacanazo](https://watchboard.dev/culiacanazo/) | Security | Mexico |
| [Fukushima Daiichi](https://watchboard.dev/fukushima-disaster/) | Disaster | Japan |
| [Tlatelolco 1968](https://watchboard.dev/tlatelolco-1968/) | Human Rights | Mexico |
| [Myanmar Civil War](https://watchboard.dev/myanmar-civil-war/) | Conflict | Southeast Asia |
| [Taiwan Strait Tensions](https://watchboard.dev/taiwan-conflict/) | Conflict | East Asia |
| [Israel-Palestine](https://watchboard.dev/israel-palestine/) | Conflict | Middle East |
| [Somalia Conflict](https://watchboard.dev/somalia-conflict/) | Conflict | East Africa |
| [October 7th Attack](https://watchboard.dev/october-7-attack/) | Conflict | Israel/Gaza |
| [Sudan Civil War](https://watchboard.dev/sudan-conflict/) | Conflict | East Africa |
| [Sahel Insurgency](https://watchboard.dev/sahel-insurgency/) | Conflict | West Africa |
| [Afghanistan-Pakistan War](https://watchboard.dev/afghanistan-pakistan-war/) | Conflict | Central/South Asia |
| [India-Pakistan Conflict](https://watchboard.dev/india-pakistan-conflict/) | Conflict | South Asia |
| [SE Asia Escalation](https://watchboard.dev/southeast-asia-escalation/) | Conflict | Southeast Asia |
| [NATO-US Tensions](https://watchboard.dev/nato-us-tensions/) | Governance | Europe/North America |
| [World War I](https://watchboard.dev/world-war-1/) | History | Europe/Global |
| [World War II](https://watchboard.dev/world-war-2/) | History | Europe/Pacific/Global |
| [Mexico-US Wars](https://watchboard.dev/mexico-us-conflict/) | History | Mexico/USA |
| [Sinaloa Fragmentation](https://watchboard.dev/sinaloa-fragmentation/) | Security | Mexico |
| [ICE History](https://watchboard.dev/ice-history/) | Governance | USA |
| [Haiti Collapse](https://watchboard.dev/haiti-collapse/) | Conflict | Caribbean |
| [Chile: Allende to Pinochet](https://watchboard.dev/chile-allende-pinochet/) | History | South America |
| [US-LatAm Interventions](https://watchboard.dev/usa-latam-interventions/) | History | Latin America |
| [Cuba Crises](https://watchboard.dev/cuba-crises/) | History | Caribbean |
| [Mexican Political History](https://watchboard.dev/mx-political-history/) | Governance | Mexico |
| [Fox Presidency](https://watchboard.dev/fox-presidency/) | Governance | Mexico |
| [Calderon Presidency](https://watchboard.dev/calderon-presidency/) | Governance | Mexico |
| [Pena Nieto Presidency](https://watchboard.dev/pena-nieto-presidency/) | Governance | Mexico |
| [AMLO Presidency](https://watchboard.dev/amlo-presidency/) | Governance | Mexico |
| [Sheinbaum Presidency](https://watchboard.dev/sheinbaum-presidency/) | Governance | Mexico |
| [Trump Presidencies](https://watchboard.dev/trump-presidencies/) | Governance | USA/Global |
| [COVID-19 Pandemic](https://watchboard.dev/covid-pandemic/) | Disaster | Global |
| [Global Recession Risk](https://watchboard.dev/global-recession-risk/) | Economy | Global |
| [Quantum Theory](https://watchboard.dev/quantum-theory/) | Science | Global |
| [China Tech Revolution](https://watchboard.dev/china-tech-revolution/) | Economy | China/Global |
| [Artemis II](https://watchboard.dev/artemis-2/) | Space | USA/Global |
| [SpaceX History](https://watchboard.dev/spacex-history/) | Space | USA/Global |
| [European Conquest of Americas](https://watchboard.dev/european-conquest-americas/) | History | Americas |
| [FIFA World Cup 2026](https://watchboard.dev/world-cup-2026/) | Culture | USA/Mexico/Canada |
| [BTS](https://watchboard.dev/bts/) | Culture | South Korea/Global |
| [Bad Bunny](https://watchboard.dev/bad-bunny/) | Culture | Puerto Rico/Global |

</details>

---

## Quick Start

```bash
git clone https://github.com/ArtemioPadilla/watchboard.git
cd watchboard
npm install
npm run dev
```

Open [http://localhost:4321/watchboard/](http://localhost:4321/watchboard/)

---

## How It Works

```
trackers/{slug}/
  tracker.json          # Config: sections, map bounds, AI prompts, categories
  data/
    meta.json, kpis.json, timeline.json, map-points.json, ...
    events/             # Daily partitioned event files (YYYY-MM-DD.json)
```

The platform auto-discovers all trackers at build time and generates:
- **Home page** (`/`) — card index of all trackers
- **Dashboard** (`/{slug}/`) — full dashboard with configured sections
- **3D Globe** (`/{slug}/globe/`) — if enabled in config
- **About** (`/{slug}/about/`) — per-tracker about page

### Create a New Tracker (25 min)

1. Go to **Actions > Initialize New Tracker**
2. Enter: slug, topic description, start date, region
3. Claude Code generates the full config + data files
4. Auto-triggers historical data backfill
5. Result: live, fully populated dashboard

### Source Tier System

Every data point is classified:

| Tier | Type | Examples |
|------|------|----------|
| **1** | Primary/Official | Government statements, CENTCOM, UN, IAEA |
| **2** | Major Outlet | Reuters, AP, CNN, BBC, Al Jazeera |
| **3** | Institutional | CSIS, HRW, Oxford Economics, NGOs |
| **4** | Unverified | Social media, unattributed claims |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [Astro 5](https://astro.build) (static, TypeScript) |
| Interactive | React (islands architecture) |
| 3D Globe | CesiumJS + Resium |
| 2D Maps | Leaflet + react-leaflet |
| Validation | Zod (runtime schema enforcement) |
| AI Updates | Claude Code Action (Max subscription) |
| Search | Pagefind (static, post-build) |
| CI/CD | GitHub Actions (deploy, update, init, seed) |

---

## Nightly AI Updates

Data auto-refreshes daily via a 3-phase GitHub Actions pipeline:

1. **Resolve** — identifies which trackers are due (configurable interval per tracker)
2. **Update** — parallel Claude Code agents (max 5) search the web across 4 media poles, update data
3. **Finalize** — validates JSON + Zod schemas, runs fix agent if needed, build gate, commits

Each tracker has a configurable `updateIntervalDays` (daily for active conflicts, 180 days for cold cases).

### GitHub Actions Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| **Deploy** | Push to main | Build Astro + deploy to GitHub Pages |
| **Nightly Data Update** | Daily 14:00 UTC + manual | Update eligible trackers via AI web search |
| **Initialize Tracker** | Manual | Generate tracker from topic description |
| **Seed Tracker** | Manual / chained | Deep historical data backfill |

All data workflows use `claude-code-action` with a Max subscription OAuth token — no per-token API costs.

### Setup

1. Go to repo **Settings > Secrets and variables > Actions**
2. Add `CLAUDE_CODE_OAUTH_TOKEN` (from `claude setup-token` with Max subscription)
3. Workflows commit to `trackers/*/data/` and push to `main`, triggering deploy

---

## Project Structure

```
watchboard/
├── trackers/                          # Tracker configs + data
│   └── {slug}/
│       ├── tracker.json               # Config: sections, map, globe, AI prompts
│       └── data/                      # JSON data files + events/
├── src/
│   ├── pages/
│   │   ├── index.astro                # Home: tracker card index
│   │   ├── guide.astro                # "Build Your Own Tracker" guide
│   │   └── [tracker]/                 # Dynamic routes per tracker
│   ├── layouts/BaseLayout.astro       # HTML shell, SEO, meta
│   ├── components/
│   │   ├── static/                    # Server-rendered (zero JS)
│   │   └── islands/                   # Client-hydrated React
│   ├── lib/                           # Schemas, data loader, utilities
│   └── styles/global.css              # Dark theme
├── scripts/
│   ├── update-data.ts                 # AI nightly updater
│   └── generate-social-drafts.ts      # Post-update social content
├── .github/workflows/
│   ├── deploy.yml                     # Build + deploy
│   ├── update-data.yml                # Nightly AI pipeline
│   ├── weekly-digest.yml              # Weekly social digest
│   ├── init-tracker.yml               # One-command tracker creation
│   └── seed-tracker.yml               # Historical backfill
└── CONTRIBUTING.md
```

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to add trackers, fix data, and contribute code.

**[Request a Tracker](https://github.com/ArtemioPadilla/watchboard/issues/new?template=tracker-request.yml)** · **[Report a Data Error](https://github.com/ArtemioPadilla/watchboard/issues/new?template=data-correction.yml)** · **[File a Bug](https://github.com/ArtemioPadilla/watchboard/issues/new?template=bug-report.yml)**

---

## Disclaimer

This platform aggregates publicly available information from multiple sources and perspectives. It does not endorse any particular political position or narrative. All contested claims are explicitly marked. Source classifications reflect general reliability tiers, not endorsements.

---

## License

MIT — use freely, attribute if you'd like.
```

- [ ] **Step 2: Verify links are correct**

Check that the base URL in the README links (`watchboard.dev/`) matches the live site. The old README used `artemiopadilla.github.io/watchboard/` — the new one uses the custom domain.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: enhance README with badges, features section, and collapsible tracker list"
```

---

### Task 4: CONTRIBUTING.md

**Files:**
- Create: `CONTRIBUTING.md`

- [ ] **Step 1: Create CONTRIBUTING.md**

```markdown
# Contributing to Watchboard

Thanks for your interest in contributing! Here's how to get involved.

## Quick Start

```bash
git clone https://github.com/ArtemioPadilla/watchboard.git
cd watchboard
npm install
npm run dev
```

Open [http://localhost:4321/watchboard/](http://localhost:4321/watchboard/)

## Ways to Contribute

### Request a New Tracker

The easiest way to contribute: [open a Tracker Request](https://github.com/ArtemioPadilla/watchboard/issues/new?template=tracker-request.yml) with a topic, region, and why it matters. The team can generate and populate it in ~25 minutes using the automated init workflow.

### Fix Data Errors

Found incorrect data? [Open a Data Correction](https://github.com/ArtemioPadilla/watchboard/issues/new?template=data-correction.yml) with:
- Which tracker and section
- What's wrong
- A source link for the correct information

Or submit a PR directly — data lives in `trackers/{slug}/data/`.

### Improve Code

1. Fork the repo
2. Create a feature branch (`git checkout -b feat/your-feature`)
3. Make changes
4. Run `npm run build` to verify
5. Submit a PR

### Data Structure

Each tracker has JSON data files validated by Zod schemas in `src/lib/schemas.ts`. Key rules:

- `year` is always a **string** (e.g., `"2026"`, not `2026`)
- `direction` on economic items is `"up"` or `"down"` only
- `pole` on sources: `"western"`, `"middle_eastern"`, `"eastern"`, or `"international"`
- Every data point needs a `sources` array with `name`, `url`, `tier` (1-4)
- Casualty figures should include `contested` field

### Adding a New Section

1. Add Zod schema in `src/lib/schemas.ts`
2. Create component in `src/components/static/` (or `islands/` if interactive)
3. Add section ID to `SectionId` in `src/lib/tracker-config.ts`
4. Add conditional render in `src/pages/[tracker]/index.astro`
5. Add update logic in `scripts/update-data.ts`

## Code Style

- TypeScript strict mode
- Astro components for static content, React for interactive islands
- CSS custom properties for theming (see `src/styles/global.css`)
- Zod for runtime validation at all data boundaries

## Questions?

Open a [Discussion](https://github.com/ArtemioPadilla/watchboard/discussions) or file an issue.
```

- [ ] **Step 2: Commit**

```bash
git add CONTRIBUTING.md
git commit -m "docs: add CONTRIBUTING.md with contributor guide"
```

---

### Task 5: GitHub Issue Templates

**Files:**
- Create: `.github/ISSUE_TEMPLATE/tracker-request.yml`
- Create: `.github/ISSUE_TEMPLATE/data-correction.yml`
- Create: `.github/ISSUE_TEMPLATE/bug-report.yml`
- Create: `.github/ISSUE_TEMPLATE/config.yml`

- [ ] **Step 1: Create template chooser config**

Create `.github/ISSUE_TEMPLATE/config.yml`:

```yaml
blank_issues_enabled: true
contact_links:
  - name: Discussions
    url: https://github.com/ArtemioPadilla/watchboard/discussions
    about: Ask questions or suggest ideas
```

- [ ] **Step 2: Create tracker request template**

Create `.github/ISSUE_TEMPLATE/tracker-request.yml`:

```yaml
name: Tracker Request
description: Suggest a new topic for Watchboard to track
title: "[Tracker Request] "
labels: ["tracker-request"]
body:
  - type: input
    id: topic
    attributes:
      label: Topic
      description: What event, conflict, or subject should we track?
      placeholder: e.g., "Syrian Civil War"
    validations:
      required: true
  - type: input
    id: region
    attributes:
      label: Geographic Region
      description: Primary region for the map/globe view
      placeholder: e.g., "Middle East", "South America"
    validations:
      required: true
  - type: input
    id: start-date
    attributes:
      label: Start Date
      description: When did this event begin? (approximate is fine)
      placeholder: e.g., "2011-03-15"
    validations:
      required: true
  - type: dropdown
    id: domain
    attributes:
      label: Domain
      options:
        - conflict
        - security
        - disaster
        - human-rights
        - governance
        - history
        - science
        - space
        - economy
        - culture
    validations:
      required: true
  - type: textarea
    id: why
    attributes:
      label: Why should we track this?
      description: Brief explanation of why this topic is important or interesting
    validations:
      required: true
  - type: textarea
    id: sources
    attributes:
      label: Key Sources
      description: Any primary sources, news outlets, or references (optional)
```

- [ ] **Step 3: Create data correction template**

Create `.github/ISSUE_TEMPLATE/data-correction.yml`:

```yaml
name: Data Correction
description: Report incorrect or missing data in a tracker
title: "[Data] "
labels: ["data-quality"]
body:
  - type: input
    id: tracker
    attributes:
      label: Tracker
      description: Which tracker has the error?
      placeholder: e.g., "iran-conflict"
    validations:
      required: true
  - type: dropdown
    id: section
    attributes:
      label: Section
      options:
        - KPIs
        - Timeline / Events
        - Map Points
        - Map Lines (Strike Trajectories)
        - Casualties
        - Economic
        - Claims
        - Political
        - Other
    validations:
      required: true
  - type: textarea
    id: description
    attributes:
      label: What's wrong?
      description: Describe the error — what's currently shown vs. what it should be
    validations:
      required: true
  - type: textarea
    id: source
    attributes:
      label: Correct Source
      description: Link to a source with the correct information
    validations:
      required: true
```

- [ ] **Step 4: Create bug report template**

Create `.github/ISSUE_TEMPLATE/bug-report.yml`:

```yaml
name: Bug Report
description: Report a bug in the dashboard
title: "[Bug] "
labels: ["bug"]
body:
  - type: textarea
    id: description
    attributes:
      label: Describe the bug
      description: What happened? What did you expect?
    validations:
      required: true
  - type: input
    id: url
    attributes:
      label: Page URL
      description: Which page were you on?
      placeholder: e.g., "https://watchboard.dev/iran-conflict/"
  - type: dropdown
    id: browser
    attributes:
      label: Browser
      options:
        - Chrome
        - Firefox
        - Safari
        - Edge
        - Mobile (iOS)
        - Mobile (Android)
        - Other
  - type: textarea
    id: steps
    attributes:
      label: Steps to reproduce
      description: How can we reproduce this?
```

- [ ] **Step 5: Commit**

```bash
git add .github/ISSUE_TEMPLATE/
git commit -m "feat: add GitHub issue templates for tracker requests, data corrections, and bugs"
```

---

### Task 6: Social Draft Generation Script

**Files:**
- Create: `scripts/generate-social-drafts.ts`

This script reads the latest digest entries from all updated trackers and generates platform-specific social media post drafts.

- [ ] **Step 1: Create the script**

Create `scripts/generate-social-drafts.ts`:

```typescript
#!/usr/bin/env tsx
/**
 * generate-social-drafts.ts
 *
 * Reads the latest digest entries from updated trackers and generates
 * social media post drafts for X/Twitter and LinkedIn.
 *
 * Usage:
 *   npx tsx scripts/generate-social-drafts.ts
 *
 * Reads: trackers/*/data/digests.json, trackers/*/tracker.json
 * Writes: public/_social/YYYY-MM-DD.json
 */

import * as fs from 'fs';
import * as path from 'path';

interface DigestEntry {
  date: string;
  title: string;
  summary: string;
  sectionsUpdated: string[];
}

interface TrackerConfig {
  slug: string;
  name: string;
  shortName: string;
  description: string;
  status: string;
  domain?: string;
}

interface SocialPost {
  platform: 'twitter' | 'linkedin' | 'reddit';
  trackerSlug: string;
  trackerName: string;
  text: string;
  hashtags: string[];
  link: string;
  date: string;
}

const BASE_URL = 'https://watchboard.dev';
const TRACKERS_DIR = path.resolve('trackers');
const OUTPUT_DIR = path.resolve('public/_social');

function loadTrackerConfig(slug: string): TrackerConfig | null {
  const configPath = path.join(TRACKERS_DIR, slug, 'tracker.json');
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    return null;
  }
}

function loadLatestDigest(slug: string): DigestEntry | null {
  const digestPath = path.join(TRACKERS_DIR, slug, 'data', 'digests.json');
  try {
    const digests: DigestEntry[] = JSON.parse(fs.readFileSync(digestPath, 'utf8'));
    return digests[0] || null;
  } catch {
    return null;
  }
}

function domainToHashtags(domain?: string): string[] {
  const map: Record<string, string[]> = {
    conflict: ['OSINT', 'ConflictTracking', 'IntelDashboard'],
    security: ['OSINT', 'Security', 'IntelDashboard'],
    disaster: ['DisasterTracking', 'OSINT'],
    'human-rights': ['HumanRights', 'OSINT'],
    governance: ['Politics', 'Governance'],
    history: ['History', 'OpenSource'],
    science: ['Science', 'OpenData'],
    space: ['Space', 'NASA'],
    economy: ['Economy', 'Markets'],
    culture: ['Culture', 'Entertainment'],
  };
  return ['Watchboard', ...(map[domain || ''] || ['OSINT'])];
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + '\u2026';
}

function generateTwitterPost(config: TrackerConfig, digest: DigestEntry): SocialPost {
  const link = `${BASE_URL}/${config.slug}/`;
  const hashtags = domainToHashtags(config.domain);
  const hashtagStr = hashtags.map(h => `#${h}`).join(' ');

  // Budget: 280 chars total. Link = 23 chars (t.co). Hashtags vary.
  const linkLen = 23;
  const hashtagLen = hashtagStr.length + 1; // +1 for space
  const budget = 280 - linkLen - hashtagLen - 2; // 2 for newlines

  const summary = truncate(digest.summary, budget);
  const text = `${summary}\n${link}\n${hashtagStr}`;

  return {
    platform: 'twitter',
    trackerSlug: config.slug,
    trackerName: config.shortName,
    text,
    hashtags,
    link,
    date: digest.date,
  };
}

function generateLinkedInPost(config: TrackerConfig, digest: DigestEntry): SocialPost {
  const link = `${BASE_URL}/${config.slug}/`;
  const hashtags = domainToHashtags(config.domain);

  const text = [
    `${config.shortName} — ${digest.title}`,
    '',
    digest.summary,
    '',
    `Sections updated: ${digest.sectionsUpdated.join(', ')}`,
    '',
    `View the full dashboard: ${link}`,
    '',
    hashtags.map(h => `#${h}`).join(' '),
  ].join('\n');

  return {
    platform: 'linkedin',
    trackerSlug: config.slug,
    trackerName: config.shortName,
    text,
    hashtags,
    link,
    date: digest.date,
  };
}

function main() {
  const today = new Date().toISOString().split('T')[0];
  const posts: SocialPost[] = [];

  // Find all tracker slugs
  const slugs = fs.readdirSync(TRACKERS_DIR).filter(name => {
    const configPath = path.join(TRACKERS_DIR, name, 'tracker.json');
    return fs.existsSync(configPath);
  });

  for (const slug of slugs) {
    const config = loadTrackerConfig(slug);
    if (!config || config.status === 'draft') continue;

    const digest = loadLatestDigest(slug);
    if (!digest || digest.date !== today) continue;

    posts.push(generateTwitterPost(config, digest));
    posts.push(generateLinkedInPost(config, digest));
  }

  if (posts.length === 0) {
    console.log('No trackers updated today — no social drafts generated.');
    return;
  }

  // Write output
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const outputPath = path.join(OUTPUT_DIR, `${today}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(posts, null, 2));
  console.log(`Generated ${posts.length} social drafts for ${posts.length / 2} trackers → ${outputPath}`);

  // Print preview
  for (const post of posts.filter(p => p.platform === 'twitter')) {
    console.log(`\n--- ${post.trackerName} (Twitter) ---`);
    console.log(post.text);
    console.log(`[${post.text.length} chars]`);
  }
}

main();
```

- [ ] **Step 2: Test locally**

```bash
npx tsx scripts/generate-social-drafts.ts
```

Expected: Either generates drafts (if any tracker was updated today) or prints "No trackers updated today". Should not error.

- [ ] **Step 3: Commit**

```bash
git add scripts/generate-social-drafts.ts
git commit -m "feat: add social draft generation script for post-update social media content"
```

---

### Task 7: Integrate Social Drafts into Nightly Pipeline

**Files:**
- Modify: `.github/workflows/update-data.yml:665` (after "Collect metrics" step, before "Commit and push metrics")

- [ ] **Step 1: Add social draft generation step**

In `.github/workflows/update-data.yml`, add this step after the "Collect metrics" step (line 663) and before the "Commit and push metrics" step (line 665):

```yaml
      - name: Generate social drafts
        if: steps.validate.outputs.valid == 'true' || steps.revalidate.outputs.valid == 'true'
        run: |
          npx tsx scripts/generate-social-drafts.ts
          if [ -d "public/_social" ]; then
            echo "Social drafts generated"
            ls -la public/_social/
          fi
```

- [ ] **Step 2: Update the "Commit and push metrics" step to also commit social drafts**

In the "Commit and push metrics" step, change the `git add` line to include social drafts:

Replace:
```yaml
          git add public/_metrics/
```

With:
```yaml
          git add public/_metrics/ public/_social/
```

And update the diff check:
Replace:
```yaml
          if git diff --cached --quiet public/_metrics/; then
```

With:
```yaml
          if git diff --cached --quiet public/_metrics/ public/_social/; then
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/update-data.yml
git commit -m "feat(ci): integrate social draft generation into nightly pipeline"
```

---

### Task 8: Weekly Digest Workflow

**Files:**
- Create: `.github/workflows/weekly-digest.yml`

- [ ] **Step 1: Create the weekly digest workflow**

Create `.github/workflows/weekly-digest.yml`:

```yaml
name: Weekly Digest

on:
  schedule:
    - cron: '0 16 * * 0'  # Sundays at 16:00 UTC
  workflow_dispatch:

permissions:
  contents: write

jobs:
  digest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - run: npm ci

      - name: Generate weekly digest
        run: |
          node -e "
            const fs = require('fs');
            const path = require('path');

            const trackersDir = 'trackers';
            const now = new Date();
            const weekAgo = new Date(now - 7 * 86400000);
            const weekAgoStr = weekAgo.toISOString().split('T')[0];
            const todayStr = now.toISOString().split('T')[0];

            const slugs = fs.readdirSync(trackersDir).filter(name => {
              const configPath = path.join(trackersDir, name, 'tracker.json');
              return fs.existsSync(configPath);
            });

            const weeklyUpdates = [];

            for (const slug of slugs) {
              const configPath = path.join(trackersDir, slug, 'tracker.json');
              const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
              if (config.status === 'draft') continue;

              const digestPath = path.join(trackersDir, slug, 'data', 'digests.json');
              if (!fs.existsSync(digestPath)) continue;

              const digests = JSON.parse(fs.readFileSync(digestPath, 'utf8'));
              const thisWeek = digests.filter(d => d.date >= weekAgoStr && d.date <= todayStr);

              if (thisWeek.length > 0) {
                weeklyUpdates.push({
                  slug,
                  name: config.shortName,
                  domain: config.domain || 'general',
                  updateCount: thisWeek.length,
                  latestSummary: thisWeek[0].summary,
                  sectionsUpdated: [...new Set(thisWeek.flatMap(d => d.sectionsUpdated))],
                });
              }
            }

            if (weeklyUpdates.length === 0) {
              console.log('No updates this week.');
              process.exit(0);
            }

            // Sort by update count descending
            weeklyUpdates.sort((a, b) => b.updateCount - a.updateCount);

            // Generate thread-style text
            const baseUrl = 'https://watchboard.dev';
            const header = 'Watchboard Weekly — ' + weekAgoStr + ' to ' + todayStr;

            const twitterThread = [
              header + '\\n\\n' + weeklyUpdates.length + ' trackers updated this week. Thread:\\n\\n#Watchboard #OSINT',
            ];

            for (const u of weeklyUpdates.slice(0, 10)) {
              twitterThread.push(
                u.name + ' (' + u.updateCount + ' update' + (u.updateCount > 1 ? 's' : '') + ')\\n' +
                u.latestSummary.slice(0, 200) + '\\n' +
                baseUrl + '/' + u.slug + '/'
              );
            }

            if (weeklyUpdates.length > 10) {
              twitterThread.push('...and ' + (weeklyUpdates.length - 10) + ' more trackers. See all at ' + baseUrl);
            }

            const linkedIn = [
              header,
              '',
              weeklyUpdates.length + ' intelligence dashboards were updated this week:',
              '',
              ...weeklyUpdates.map(u =>
                '- ' + u.name + ': ' + u.updateCount + ' update(s) — ' + u.latestSummary.slice(0, 100)
              ),
              '',
              'Explore all trackers: ' + baseUrl,
              '',
              '#Watchboard #OSINT #Intelligence #OpenSource',
            ].join('\\n');

            const output = {
              type: 'weekly',
              dateRange: { from: weekAgoStr, to: todayStr },
              trackerCount: weeklyUpdates.length,
              twitterThread,
              linkedIn,
              trackers: weeklyUpdates,
            };

            const outDir = 'public/_social';
            fs.mkdirSync(outDir, { recursive: true });
            const outPath = path.join(outDir, 'weekly-' + todayStr + '.json');
            fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
            console.log('Weekly digest written to ' + outPath);
            console.log('Trackers updated: ' + weeklyUpdates.length);

            // Preview
            console.log('\\n--- Twitter Thread Preview ---');
            twitterThread.forEach((t, i) => console.log('Tweet ' + (i+1) + ': ' + t.slice(0, 100) + '...'));
          "

      - name: Commit and push
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          git remote set-url origin "https://x-access-token:${GITHUB_TOKEN}@github.com/${{ github.repository }}.git"
          git config --local user.email "github-actions[bot]@users.noreply.github.com"
          git config --local user.name "github-actions[bot]"
          git add public/_social/
          if git diff --cached --quiet public/_social/; then
            echo "No weekly digest changes"
            exit 0
          fi
          git commit -m "chore(social): weekly digest $(date -u +%Y-%m-%d)"
          for i in 1 2 3; do
            git pull --rebase origin main && git push && break
            echo "Push attempt $i failed, retrying..."
            sleep 2
          done
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/weekly-digest.yml
git commit -m "feat(ci): add weekly digest workflow for automated social content"
```

---

### Task 9: Guide Page — "Build Your Own Tracker"

**Files:**
- Create: `src/pages/guide.astro`

- [ ] **Step 1: Create the guide page**

Create `src/pages/guide.astro`:

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
---
<BaseLayout title="Build Your Own Tracker — Watchboard" description="Step-by-step guide to creating a new intelligence dashboard on Watchboard in 25 minutes.">
  <main id="main-content" class="guide-page">
    <header class="guide-header">
      <a href={import.meta.env.BASE_URL} class="back-link">&larr; Back to Watchboard</a>
      <h1>Build Your Own Tracker</h1>
      <p class="subtitle">Create a fully populated intelligence dashboard for any topic in ~25 minutes.</p>
    </header>

    <section class="guide-section">
      <h2>How It Works</h2>
      <p>
        Every Watchboard tracker is defined by a single <code>tracker.json</code> config file and a <code>data/</code> directory of JSON files. The platform auto-discovers trackers at build time and generates all pages, maps, and globe views from the config.
      </p>
      <p>
        You don't need to write any code. A GitHub Actions workflow powered by Claude Code generates the full config and populates historical data automatically.
      </p>
    </section>

    <section class="guide-section">
      <h2>Step 1: Dispatch the Workflow</h2>
      <ol>
        <li>Go to <strong>Actions</strong> in the GitHub repo</li>
        <li>Select <strong>"Initialize New Tracker"</strong> from the sidebar</li>
        <li>Click <strong>"Run workflow"</strong></li>
        <li>Fill in the fields:
          <ul>
            <li><strong>Slug</strong> — URL-friendly name (e.g., <code>syrian-civil-war</code>)</li>
            <li><strong>Topic</strong> — description of what to track</li>
            <li><strong>Start Date</strong> — when the event began (e.g., <code>2011-03-15</code>)</li>
            <li><strong>Region</strong> — geographic focus (e.g., <code>middle-east</code>)</li>
            <li><strong>Domain</strong> — category: conflict, disaster, governance, science, etc.</li>
          </ul>
        </li>
        <li>Click <strong>"Run workflow"</strong></li>
      </ol>
    </section>

    <section class="guide-section">
      <h2>Step 2: Wait ~25 Minutes</h2>
      <p>Two jobs run automatically:</p>
      <ol>
        <li><strong>Init</strong> (~5 min) — Claude Code generates <code>tracker.json</code> with sections, map bounds, camera presets, AI prompts, and political avatars. Creates the data directory with empty JSON files. Validates the config against the Zod schema, runs a build test, and commits.</li>
        <li><strong>Seed</strong> (~20 min) — Claude Code performs deep web research and populates all sections: timeline events, map points, KPIs, casualties, economic data, claims, and political context. Commits the populated data.</li>
      </ol>
    </section>

    <section class="guide-section">
      <h2>Step 3: Your Tracker Is Live</h2>
      <p>
        Once the seed job commits, the deploy workflow triggers automatically. Your new tracker appears on the <a href={import.meta.env.BASE_URL}>home page</a> and gets its own dashboard, 3D globe (if enabled), and about page.
      </p>
      <p>
        From now on, the nightly update pipeline will automatically refresh your tracker's data based on the <code>updateIntervalDays</code> setting in the config.
      </p>
    </section>

    <section class="guide-section">
      <h2>What You Get</h2>
      <div class="feature-grid">
        <div class="feature-card">
          <h3>Dashboard</h3>
          <p>KPIs, timeline, interactive map, military tabs, casualties, economic impact, claims matrix, political grid</p>
        </div>
        <div class="feature-card">
          <h3>3D Globe</h3>
          <p>CesiumJS globe with camera presets, category filters, and cinematic event mode</p>
        </div>
        <div class="feature-card">
          <h3>AI Updates</h3>
          <p>Nightly web search across 4 media poles with source tier classification</p>
        </div>
        <div class="feature-card">
          <h3>RSS Feed</h3>
          <p>Per-tracker RSS feed with digest summaries of each update</p>
        </div>
      </div>
    </section>

    <section class="guide-section">
      <h2>Tracker Ideas</h2>
      <p>Watchboard can track anything with a timeline, geographic footprint, and evolving data. Some ideas:</p>
      <ul>
        <li>Regional conflicts or peace processes</li>
        <li>Natural disasters and recovery efforts</li>
        <li>Political transitions and elections</li>
        <li>Space missions and scientific discoveries</li>
        <li>Cultural events and movements</li>
        <li>Environmental crises and climate events</li>
        <li>Public health emergencies</li>
      </ul>
    </section>

    <section class="guide-section">
      <h2>Manual Setup (Advanced)</h2>
      <p>If you prefer to create a tracker by hand:</p>
      <ol>
        <li>Create <code>trackers/your-slug/tracker.json</code> — use an existing tracker as a template</li>
        <li>Define sections, map bounds, categories, and AI prompts</li>
        <li>Create <code>trackers/your-slug/data/</code> with at minimum <code>meta.json</code></li>
        <li>Run <code>npm run build</code> — the tracker auto-discovers and generates pages</li>
        <li>Dispatch the <strong>Seed Tracker Data</strong> workflow to backfill historical data</li>
      </ol>
    </section>

    <footer class="guide-footer">
      <p>
        <a href="https://github.com/ArtemioPadilla/watchboard/issues/new?template=tracker-request.yml" class="cta-button">Request a Tracker</a>
      </p>
    </footer>
  </main>
</BaseLayout>

<style>
  .guide-page {
    max-width: 800px;
    margin: 0 auto;
    padding: 2rem 1.5rem 4rem;
    color: var(--text-primary, #e6edf3);
  }

  .guide-header {
    margin-bottom: 3rem;
  }

  .back-link {
    color: var(--accent-blue, #58a6ff);
    text-decoration: none;
    font-size: 0.875rem;
    font-family: var(--font-mono, 'JetBrains Mono', monospace);
  }

  .guide-header h1 {
    font-size: 2.25rem;
    margin: 0.5rem 0;
    font-weight: 700;
  }

  .subtitle {
    color: var(--text-secondary, #8b949e);
    font-size: 1.125rem;
  }

  .guide-section {
    margin-bottom: 2.5rem;
  }

  .guide-section h2 {
    font-size: 1.5rem;
    margin-bottom: 1rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--border, #30363d);
  }

  .guide-section p,
  .guide-section li {
    line-height: 1.7;
    color: var(--text-secondary, #8b949e);
  }

  .guide-section ol,
  .guide-section ul {
    padding-left: 1.5rem;
  }

  .guide-section li {
    margin-bottom: 0.5rem;
  }

  .guide-section code {
    background: var(--bg-secondary, #161b22);
    padding: 0.15em 0.4em;
    border-radius: 4px;
    font-family: var(--font-mono, 'JetBrains Mono', monospace);
    font-size: 0.875em;
    color: var(--accent-blue, #58a6ff);
  }

  .guide-section a {
    color: var(--accent-blue, #58a6ff);
  }

  .feature-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
    margin-top: 1rem;
  }

  .feature-card {
    background: var(--bg-secondary, #161b22);
    border: 1px solid var(--border, #30363d);
    border-radius: 8px;
    padding: 1.25rem;
  }

  .feature-card h3 {
    font-size: 1rem;
    margin: 0 0 0.5rem;
    color: var(--text-primary, #e6edf3);
  }

  .feature-card p {
    font-size: 0.875rem;
    margin: 0;
  }

  .guide-footer {
    text-align: center;
    margin-top: 3rem;
    padding-top: 2rem;
    border-top: 1px solid var(--border, #30363d);
  }

  .cta-button {
    display: inline-block;
    background: var(--accent-blue, #58a6ff);
    color: #0d1117;
    padding: 0.75rem 2rem;
    border-radius: 6px;
    text-decoration: none;
    font-weight: 600;
    font-size: 1rem;
    transition: opacity 0.2s;
  }

  .cta-button:hover {
    opacity: 0.9;
  }
</style>
```

- [ ] **Step 2: Verify build succeeds**

```bash
npm run build
```

Expected: Build succeeds. `dist/watchboard/guide/index.html` exists.

- [ ] **Step 3: Commit**

```bash
git add src/pages/guide.astro
git commit -m "feat: add 'Build Your Own Tracker' guide page"
```

---

### Task 10: Final Verification

- [ ] **Step 1: Full build check**

```bash
npm run build
```

Expected: Clean build with no errors. All new pages (guide, sitemap) present in `dist/`.

- [ ] **Step 2: Verify sitemap output**

```bash
cat dist/sitemap-index.xml
cat dist/sitemap-0.xml | head -50
```

Expected: Sitemap includes all tracker pages, guide page, home page.

- [ ] **Step 3: Verify robots.txt**

```bash
cat dist/robots.txt
```

Expected: Contains `Sitemap: https://watchboard.dev/sitemap-index.xml`

- [ ] **Step 4: Test social draft script**

```bash
npx tsx scripts/generate-social-drafts.ts
```

Expected: Runs without error (may produce 0 drafts if no trackers updated today).

- [ ] **Step 5: Verify all files committed**

```bash
git status
```

Expected: Clean working tree (no untracked or modified files from this plan).

---

## Manual Steps (Post-Implementation)

These items from the promotion spec require manual action outside the codebase:

1. **GitHub Settings:**
   - Add repository topics: `osint`, `intelligence`, `conflict-tracking`, `astro`, `cesium`, `leaflet`, `dashboard`, `ai-powered`, `open-source`, `typescript`
   - Upload social preview image (1280x640)
   - Enable GitHub Discussions (General, Tracker Requests, Show & Tell categories)
   - Pin repo on your GitHub profile

2. **Cloudflare Analytics:**
   - Enable Web Analytics in Cloudflare dashboard for artemiop.com

3. **RSS-to-Social Bridge:**
   - Set up Zapier/IFTTT/n8n to pipe RSS feeds to X and LinkedIn

4. **Launch Posts (one-time):**
   - Hacker News: "Show HN: I built 48 AI-powered intelligence dashboards" (Tue-Thu, 9-11 AM ET)
   - Subreddit posts: r/OSINT, r/geopolitics, r/webdev, r/dataisbeautiful, r/artificial, r/space, topic-specific subs
   - Twitter/X announcement thread
   - LinkedIn post

5. **OSINT Tool List PRs:**
   - awesome-osint, Bellingcat toolkit, OSINT Framework, awesome-astro, Astro showcase

6. **Product Hunt:**
   - After 2-3 weeks of automated social posts running, launch with screenshots + demo GIF

7. **Auto-posting (Phase 2):**
   - Set up X API v2 app for automated posting
   - Set up LinkedIn API app
   - Update workflows to post directly instead of saving drafts

8. **Video Clips (Phase 2):**
   - Add Playwright-based globe screen recording workflow
   - Generate MP4/GIF clips for TikTok/YouTube Shorts
