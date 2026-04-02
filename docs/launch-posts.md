# Watchboard Launch Posts

Ready-to-post content for each platform. Copy, paste, publish.

---

## Hacker News — Show HN

**Title:** Show HN: Watchboard – 48 AI-powered intelligence dashboards, create one for any topic in 25 min

**Text:**
```
I built Watchboard, an open-source platform for creating intelligence dashboards about any topic — conflicts, disasters, political history, space missions, even pop culture.

Each dashboard includes interactive maps (Leaflet), a 3D globe (CesiumJS), timelines, KPI cards, casualty tables, economic indicators, and a claims matrix with source tier classification (Tier 1 = official/government, Tier 4 = unverified social media).

The key feature: a GitHub Actions workflow creates a fully populated dashboard from just a topic description in ~25 minutes. Claude Code generates the config, seeds historical data via web research, and the nightly pipeline keeps everything updated automatically.

There are 48 trackers live right now covering Iran, Ukraine, Gaza, Chernobyl, Fukushima, NASA Artemis, COVID-19, World Wars, Mexican politics, and more.

Tech: Astro 5, React islands, CesiumJS, Leaflet, Zod validation, Claude Code Action for AI updates.

Live: https://artemiop.com/watchboard/
Source: https://github.com/ArtemioPadilla/watchboard
Guide: https://artemiop.com/watchboard/guide/
```

**When to post:** Tuesday–Thursday, 9–11 AM ET

---

## Twitter/X — Launch Thread

**Tweet 1 (hook):**
```
I built 48 intelligence dashboards that update themselves every night using AI.

Conflicts, disasters, space missions, political history — each one has interactive maps, a 3D globe, and source-tier classification.

And you can create a new one in 25 minutes.

Thread 🧵
```

**Tweet 2 (demo):**
```
Each dashboard tracks a topic with:

• Interactive Leaflet maps with strike trajectories
• 3D CesiumJS globe with camera presets
• Timeline with daily event partitions
• Source tier system (Tier 1 = official, Tier 4 = unverified)
• KPIs, casualty tables, economic indicators

https://artemiop.com/watchboard/iran-conflict/
```

**Tweet 3 (automation):**
```
The magic: a nightly GitHub Actions pipeline powered by Claude Code.

It searches the web across 4 media poles (Western, Middle Eastern, Eastern, International), validates data against Zod schemas, and auto-fixes errors.

48 trackers updated in parallel. Zero manual effort.
```

**Tweet 4 (create your own):**
```
Want to track something? One GitHub Actions dispatch:

1. Enter a topic, region, start date
2. Claude Code generates the full config
3. Historical data gets backfilled automatically
4. Dashboard is live in ~25 minutes

Guide: https://artemiop.com/watchboard/guide/
```

**Tweet 5 (CTA):**
```
It's open source. MIT licensed.

⭐ Star it: https://github.com/ArtemioPadilla/watchboard
🌐 Live: https://artemiop.com/watchboard/
📡 RSS feeds for every tracker

Built with Astro 5, React, CesiumJS, Leaflet, and Claude Code.

#OSINT #OpenSource #AI
```

---

## LinkedIn

```
I've been building something I'm excited to share: Watchboard — an open-source platform for creating AI-powered intelligence dashboards about any topic.

There are 48 live trackers right now covering active conflicts (Iran, Ukraine, Gaza, Sudan), historical events (Chernobyl, 9/11, World Wars), political governance (US and Mexican presidencies), space (NASA Artemis, SpaceX), and more.

Each dashboard includes:
• Interactive maps with strike trajectory visualization
• A 3D CesiumJS globe with camera presets
• Source tier classification (Tier 1–4, from official government sources to unverified social media)
• KPI cards, casualty tables, economic indicators, and a claims matrix
• Per-tracker RSS feeds and full-text search

The interesting technical challenge: a nightly GitHub Actions pipeline uses Claude Code to search the web across 4 media poles (Western, Middle Eastern, Eastern, International), update data for all 48 trackers in parallel, validate against Zod schemas, and auto-fix errors — all without manual intervention.

And anyone can create a new tracker in ~25 minutes using a single GitHub Actions workflow dispatch.

Tech stack: Astro 5, React (islands architecture), CesiumJS, Leaflet, TypeScript, Zod, Claude Code Action.

Live site: https://artemiop.com/watchboard/
GitHub: https://github.com/ArtemioPadilla/watchboard
How to create a tracker: https://artemiop.com/watchboard/guide/

Open source, MIT licensed. Feedback and tracker suggestions welcome.

#OSINT #Intelligence #OpenSource #AI #DataVisualization #WebDev
```

---

## Reddit Posts

### r/OSINT

**Title:** I built an open-source platform with 48 AI-powered OSINT intelligence dashboards — each with interactive maps, 3D globe, and source tier classification

**Body:**
```
I've been working on Watchboard, an open-source platform for building intelligence dashboards about any topic.

Each dashboard includes:
- Interactive Leaflet maps with category filters and strike trajectory visualization
- 3D CesiumJS globe with camera presets for key locations
- Source tier classification (Tier 1 = official/primary, Tier 2 = major outlet, Tier 3 = institutional, Tier 4 = unverified)
- 4-pole media sourcing: Western, Middle Eastern, Eastern, International
- Contested claims explicitly marked
- Daily event partitioning with timeline
- KPIs, casualty tables, economic indicators

The nightly update pipeline uses AI web search to update all 48 trackers in parallel, with Zod schema validation and an auto-fix agent.

Currently tracking: Iran conflict, Ukraine, Gaza, Sudan, Myanmar, Taiwan Strait tensions, historical events (Chernobyl, 9/11, MH17), political governance (Mexican/US presidencies), space (Artemis, SpaceX), and more.

Live: https://artemiop.com/watchboard/
Source: https://github.com/ArtemioPadilla/watchboard

Open source, MIT licensed. Interested in feedback from the OSINT community on the methodology and sourcing approach.
```

### r/geopolitics

**Title:** I built 48 interactive intelligence dashboards covering global conflicts, disasters, and political events — all updated nightly by AI

**Body:**
```
Watchboard is an open-source project I've been working on: a platform for intelligence dashboards covering geopolitical events.

Each dashboard pulls from 4 media poles (Western, Middle Eastern, Eastern, International sources) and classifies everything with a source tier system. Contested casualty figures and disputed claims are explicitly marked.

Currently tracking active conflicts (Iran, Ukraine, Gaza, Sudan, Myanmar, Somalia, Sahel), historical events (World Wars, Chernobyl, 9/11, Cold War-era crises), political governance, and more — 48 topics total.

Interactive features include Leaflet maps with strike trajectories, a 3D CesiumJS globe, and daily event timelines.

Live: https://artemiop.com/watchboard/
Source: https://github.com/ArtemioPadilla/watchboard

Would love feedback on which topics to add or improve.
```

### r/webdev

**Title:** I built a config-driven dashboard platform (Astro 5 + React + CesiumJS) that auto-generates 48 intelligence dashboards from JSON configs

**Body:**
```
Sharing an architecture I'm proud of: Watchboard is a platform where each "tracker" is just a `tracker.json` config + `data/` directory. The platform auto-discovers all trackers at build time and generates dashboards, 3D globe pages, RSS feeds, and OG images for each.

Tech stack:
- Astro 5 (static output, React islands for interactivity)
- CesiumJS + Resium for 3D globe visualization
- Leaflet for 2D interactive maps
- Zod for runtime data validation (schemas shared between build + data pipeline)
- Pagefind for full-text search
- Satori for dynamic OG image generation per tracker

The fun part: a GitHub Actions pipeline runs nightly, uses AI to search the web and update data for 48 trackers in parallel (max 5 concurrent), validates with Zod, runs a fix agent if schemas break, then does a build gate before committing.

Creating a new tracker takes ~25 minutes via a single Actions workflow dispatch — no code changes needed.

Live: https://artemiop.com/watchboard/
Source: https://github.com/ArtemioPadilla/watchboard

Happy to answer questions about the architecture.
```

### r/dataisbeautiful

**Title:** [OC] 48 intelligence dashboards with 3D globe visualization, strike trajectory maps, and nightly AI-updated data

**Body:**
```
I built Watchboard — an open-source platform generating interactive intelligence dashboards for 48 topics (conflicts, disasters, space missions, political history).

Each dashboard includes:
- 3D CesiumJS globe with fly-to camera presets
- Interactive Leaflet maps with strike trajectory lines (weapon type, intercept rates)
- Source tier visualization (Tier 1–4 color-coded)
- KPI sparkline cards, casualty tables, economic indicators

Data is updated nightly by an AI pipeline that searches 4 media poles and validates against strict schemas.

Tools: Astro 5, CesiumJS, Leaflet, React
Source: https://github.com/ArtemioPadilla/watchboard

Iran conflict dashboard: https://artemiop.com/watchboard/iran-conflict/
3D globe: https://artemiop.com/watchboard/iran-conflict/globe/
```

### r/artificial

**Title:** I use Claude Code Action to auto-update 48 intelligence dashboards every night — here's how the AI pipeline works

**Body:**
```
I built Watchboard, an open-source intelligence dashboard platform. The interesting part for this community: the entire data pipeline runs on Claude Code via GitHub Actions.

How it works:
1. Nightly at 14:00 UTC, a resolve job identifies which trackers need updating (configurable intervals)
2. A matrix of parallel jobs (max 5) each give Claude Code a 50-turn budget to search the web, find latest developments, and update JSON data files
3. A "sibling brief" prevents duplicate events across related trackers
4. A finalize job validates all data against Zod schemas
5. If validation fails, a fix agent (another Claude Code instance, 15 turns) attempts auto-repair
6. A build gate runs `npm run build` before any commit
7. Metrics are collected per run (90-day retention)

Key design decisions:
- 4-pole media sourcing (Western, Middle Eastern, Eastern, International) for balanced coverage
- Source tier classification (Tier 1–4) built into the data model
- Sibling awareness prevents cross-tracker event duplication
- All data workflows use Claude Code Action with a Max subscription OAuth token (no per-API costs)

The same approach creates new trackers: describe a topic, and Claude Code generates the full config + historical data in ~25 minutes.

48 trackers live: https://artemiop.com/watchboard/
Source: https://github.com/ArtemioPadilla/watchboard

AMA about the pipeline architecture.
```

### r/space

**Title:** I built an interactive intelligence dashboard tracking the NASA Artemis program — 3D globe, timeline, and nightly AI-updated data

**Body:**
```
As part of a larger project (Watchboard — 48 topic dashboards), I have a tracker dedicated to the NASA Artemis program.

It includes timeline events, map points for launch/landing sites, a 3D CesiumJS globe, and data sourced from NASA, SpaceX, and major outlets. Everything is classified by source tier.

There's also a SpaceX History tracker covering milestones from the Falcon 1 era to present.

Artemis tracker: https://artemiop.com/watchboard/artemis-program/
SpaceX tracker: https://artemiop.com/watchboard/spacex-history/
All trackers: https://artemiop.com/watchboard/

Open source: https://github.com/ArtemioPadilla/watchboard
```

---

## Timing Strategy

| Platform | When | Why |
|----------|------|-----|
| Hacker News | Tue–Thu, 9–11 AM ET | Peak HN engagement window |
| Twitter/X | Same day as HN | Ride the momentum if HN hits |
| LinkedIn | Same day or next morning | Professional audience, weekday optimal |
| r/OSINT | Day after HN | Let HN discussion establish credibility |
| r/webdev | Same day as r/OSINT | Technical audience |
| r/dataisbeautiful | Weekend | Visualization-focused, weekend browsing |
| r/geopolitics | Anytime | Content-driven sub, less timing-sensitive |
| r/artificial | Day after HN | AI-focused community |
| r/space | Anytime | Niche, topic-specific |

**Key rule:** Space posts 1-2 days apart across Reddit to avoid self-promotion flags. Engage in comments on each post.
