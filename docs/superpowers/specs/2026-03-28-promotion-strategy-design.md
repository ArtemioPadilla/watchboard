# Watchboard Promotion Strategy

**Date:** 2026-03-28
**Goal:** Grow developer adoption (forks/contributors) and end-user audience (analysts, journalists, general public) through a 3-layer strategy: foundation polish, automated content engine, and platform amplification.
**Effort model:** Automate everything possible; minimize ongoing manual effort.
**Platforms:** GitHub, Twitter/X, LinkedIn, Reddit, YouTube/TikTok

---

## Layer 1: Foundation — "Let the Repo Sell Itself"

One-time polish so organic discovery converts visitors into users/followers.

### 1.1 README Overhaul

- **Hero banner**: Screenshot of the Iran Conflict dashboard (full-width, dark theme)
- **Animated GIF**: 3D globe with missile trajectory flyover (~5s loop)
- **"Create a tracker in 25 minutes"** section: before/after showing `init-tracker.yml` dispatch → live tracker
- **Architecture diagram**: Mermaid or SVG showing `tracker.json → Astro build → GitHub Pages` flow
- **Badges**: GitHub stars, last commit, tracker count (dynamic), build status, "Powered by Claude Code"
- **Quick-start section**: Clone, `npm install`, `npm run dev` — 3 commands to running locally

### 1.2 GitHub Discoverability

- **Repository topics**: `osint`, `intelligence`, `conflict-tracking`, `astro`, `cesium`, `leaflet`, `dashboard`, `ai-powered`, `open-source`, `typescript`
- **Social preview image**: 1280x640 OG card — globe screenshot + "48 AI-Powered Intelligence Dashboards" tagline
- **GitHub Discussions**: Enable with categories: General, Tracker Requests, Show & Tell
- **Pin repo** on GitHub profile

### 1.3 Analytics

- **Cloudflare Web Analytics**: Enable in CF dashboard (free, no code changes needed since artemiop.com already proxies through CF)
- **Fallback**: If CF doesn't give per-path granularity, add Plausible or Umami (self-hosted or cloud, ~1 script tag in BaseLayout.astro)

### 1.4 SEO & Meta

- **OG tags**: Per-tracker `<meta>` tags in `[tracker]/index.astro` (title, description, tracker-specific preview image)
- **JSON-LD**: Structured data per tracker page (schema.org `Dataset` type — name, description, dateModified, spatialCoverage)
- **Sitemap**: Add `@astrojs/sitemap` integration
- **Canonical URLs**: Ensure each tracker page has a canonical link

---

## Layer 2: Automated Content Engine

Leverage the nightly update pipeline to generate social content with zero manual effort.

### 2.1 Post-Update Social Drafts

- **Where**: New step at the end of `update-data.yml` finalize phase
- **How**: Claude summarizes changes across all updated trackers into platform-appropriate posts:
  - X/Twitter: 280 chars, 2-3 hashtags, link to tracker
  - LinkedIn: 1-2 paragraphs, professional tone, link
  - Reddit drafts: subreddit-appropriate summaries (different tone per sub)
- **Output**: `public/_social/YYYY-MM-DD.json` — array of `{platform, text, hashtags, trackerSlug, link}`
- **Posting**:
  - Phase 1 (start here): Save drafts only, review manually, one-click post
  - Phase 2 (after confidence): Auto-post via X API v2 + LinkedIn API

### 2.2 Weekly Digest Thread

- **Trigger**: Separate scheduled Action, runs Sundays at 16:00 UTC
- **Format**: Numbered thread (X) or carousel post (LinkedIn) summarizing the week:
  - Top 3-5 events across all active trackers
  - KPI deltas (casualty updates, economic shifts)
  - New trackers added (if any)
  - Link to full dashboard
- **Output**: Same `_social/` directory, tagged as `weekly`

### 2.3 RSS-to-Social Bridge

- Existing per-tracker RSS feeds (`/[tracker]/rss.xml`) already produce digest entries
- Connect to X/LinkedIn via:
  - **Zapier** (free tier: 100 tasks/month — likely sufficient)
  - **IFTTT** (alternative)
  - **n8n** (self-hosted, unlimited)
- Each new digest entry → social post with tracker name, summary, link
- Deduplicate with 2.1 to avoid double-posting

### 2.4 Auto-Generated Visual Clips

- **GitHub Action** using Playwright:
  1. Launch headless browser, navigate to globe page of a featured tracker
  2. Trigger camera preset sequence (e.g., "Full Theater" → "Tehran" → "Natanz")
  3. Capture screen recording (5-10 seconds)
  4. Convert to MP4 via ffmpeg (for YouTube Shorts / TikTok) and GIF (for X/Reddit)
- **Overlay**: Add date + tracker name text overlay via ffmpeg drawtext
- **Schedule**: Weekly, or triggered when a tracker has significant new data
- **Output**: `public/_social/clips/YYYY-MM-DD-{slug}.mp4`

### 2.5 Reddit Semi-Automation

- Generate subreddit-specific drafts (tone-adapted):
  - r/OSINT: technical, methodology-focused
  - r/geopolitics: analysis-focused, neutral
  - r/webdev: architecture/tech-focused
  - r/dataisbeautiful: visualization-focused
- Save as drafts — manual review + post (Reddit penalizes bot posting)
- Estimated effort: 5 min/week to review and click submit

---

## Layer 3: Platform Play — Amplification

Position Watchboard as an open-source tool, not just a project.

### 3.1 "Build Your Own Tracker" Tutorial

- **Blog post**: New `/blog` route in Astro (or standalone page at `/guide`)
  - Step-by-step: dispatch `init-tracker.yml` → watch Claude Code generate config → see live tracker
  - Include screenshots at each step
  - End with "ideas for your own tracker" inspiration list
- **YouTube video**: Screen recording of the same flow with text overlay narration
  - Target: 3-5 minutes
  - Thumbnail: globe screenshot + "Build an Intelligence Dashboard in 25 Minutes"
- **Cross-post**: Dev.to, Hashnode, Medium (for SEO reach)

### 3.2 Contributor Experience

- **`CONTRIBUTING.md`**: How to add trackers, fix data, improve components, run locally
- **Issue templates**:
  - "Request a Tracker" — topic, region, why it matters, suggested sources
  - "Data Correction" — tracker, section, what's wrong, source for correct data
  - "Bug Report" — standard template
- **Labels**: `good first issue`, `tracker-request`, `data-quality`, `help wanted`
- **GitHub Discussion category**: "Tracker Requests" — community votes on what to track next

### 3.3 OSINT & Tool List Submissions

One-time PRs/submissions to high-traffic curated lists:

| List | Stars/Traffic | Angle |
|------|--------------|-------|
| `awesome-osint` | 19k+ stars | Multi-topic OSINT dashboard platform |
| Bellingcat Digital Investigation Toolkit | High authority | AI-powered conflict tracking |
| OSINT Framework | Major hub | Interactive intelligence dashboards |
| `awesome-astro` | Astro community | Real-world Astro 5 + CesiumJS showcase |
| Astro official showcase | astro.build/showcase | Production Astro site |
| Hacker News "Show HN" | Massive reach | "Show HN: I built 48 AI-powered intelligence dashboards" |

### 3.4 Subreddit Seeding

One-time posts (not spam — genuine contributions with context):

| Subreddit | Angle | Tracker to Feature |
|-----------|-------|--------------------|
| r/OSINT | Platform + methodology (4-pole sourcing, tier system) | Iran Conflict |
| r/geopolitics | Live intelligence dashboard for ongoing conflicts | Iran / Ukraine / Taiwan |
| r/dataisbeautiful | 3D globe visualization + strike trajectory maps | Iran Conflict (globe) |
| r/webdev | Astro 5 + CesiumJS + AI automation architecture | Platform overview |
| r/javascript | React islands + Leaflet + CesiumJS integration | Technical deep-dive |
| r/artificial | Claude Code Action running 48 trackers nightly | Automation angle |
| r/space | NASA Artemis program tracker | Artemis tracker |
| r/iran, r/ukraine | Dedicated dashboards for their topics | Respective trackers |
| r/mexico | AMLO, Sheinbaum, Ayotzinapa, Culiacanazo trackers | Mexican trackers |

### 3.5 Product Hunt Launch

- **Timing**: After README polish + 2-3 weeks of automated social posts (profile looks active)
- **Tagline**: "Watchboard — AI-powered intelligence dashboards for any topic. Create one in 25 minutes."
- **Assets**: 5+ screenshots (dashboard, globe, map, timeline, metrics), GIF demo, 60s video
- **Prep**: Line up 5-10 people to upvote/comment on launch day (friends, colleagues, Twitter followers)

### 3.6 Talks & Community Engagement

- **OSINT conferences**: Submit talk proposals (e.g., "Automating OSINT Dashboards with AI")
- **Astro Discord**: Share in #showcase channel
- **Anthropic/Claude community**: Showcase Claude Code Action at scale (48 parallel tracker updates)
- **Local meetups**: Present at JavaScript/TypeScript or data visualization meetups

---

## Implementation Order

| Phase | What | Timeline | Manual Effort |
|-------|------|----------|---------------|
| **1** | README overhaul, GitHub discoverability, analytics, SEO/meta | Week 1 | One-time |
| **2** | Social draft automation in `update-data.yml` | Week 1-2 | One-time setup |
| **3** | RSS-to-social bridge (Zapier/IFTTT) | Week 2 | 30 min setup |
| **4** | Weekly digest Action | Week 2 | One-time setup |
| **5** | CONTRIBUTING.md, issue templates, Discussions | Week 2 | One-time |
| **6** | "Build Your Own Tracker" blog post + video | Week 3 | One-time creation |
| **7** | Hacker News "Show HN" + subreddit seeding | Week 3 | One day |
| **8** | OSINT tool list submissions | Week 3-4 | One-time PRs |
| **9** | Auto-generated video clips | Week 4 | One-time setup |
| **10** | Product Hunt launch | Week 5+ | One day |
| **11** | Auto-posting (X API, LinkedIn API) | Week 6+ | One-time setup |
| **12** | Conference talk submissions | Ongoing | As opportunities arise |

---

## Success Metrics

- **GitHub**: Stars, forks, "Tracker Request" discussion activity
- **Site**: Unique visitors per week (via analytics), page views per tracker
- **Social**: Follower growth, engagement rate on automated posts
- **Community**: External tracker requests, contributor PRs, OSINT list inclusions
- **Content**: Blog post views, YouTube video views, Product Hunt upvotes

---

## Key Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Automated posts feel robotic | Claude generates natural language; start with draft review before auto-posting |
| Reddit bans for self-promotion | Space posts out, contribute to discussions first, follow subreddit rules |
| Product Hunt flop | Don't launch until foundation + content engine are running smoothly |
| Low engagement on video clips | Start with GIFs (lower effort), upgrade to video only if GIFs perform well |
| Hacker News buried | Time the post for US morning (9-11 AM ET), Tuesday-Thursday optimal |
