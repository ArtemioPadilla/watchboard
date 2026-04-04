# Watchboard Growth Engine — Design Spec

**Date:** 2026-04-03
**Goal:** Take Watchboard from 20 DAU to 1,000+ DAU through organic growth — no budget, pure product-led.
**Strategy:** SEO content engine + first-visit conversion + viral sharing mechanics, phased in order of leverage.

---

## Problem

Watchboard has 48 trackers with daily-updated, source-tiered data on topics people actively search for. The product is feature-rich (cinematic globe, broadcast mode, embeds, 4 languages). But:

- **Value isn't obvious fast enough** — new visitors see a command center with 48 items and no context
- **Content is invisible to search** — thousands of events are locked inside React islands with no individual URLs
- **Nothing is shareable** — you can share a dashboard link but not a specific event or insight
- **No return hooks** — no email, no notifications, no reason to come back tomorrow

## Target Audience

Broad: casual news followers to expert OSINT analysts. The design must have a low barrier to entry with depth that reveals itself progressively.

## Success Metrics

- 1,000 DAU (50x growth)
- Viral moments (event cards shared on social, picked up by media)
- Steady 10-20% month-over-month organic growth
- Community formation (tracker requests, embed usage, RSS subscribers)

---

## Phase 1: SEO Content Engine

The highest-leverage change. Each event becomes a landing page that Google can index.

### 1.1 Event Permalink Pages

**Route:** `src/pages/[tracker]/events/[...slug].astro`

**URL pattern:** `/{tracker}/events/{date}-{id-slug}`
Example: `/iran-conflict/events/2026-03-31-idf-day32-170-targets`

**Slug generation:** Derive from event `id` field, kebab-cased. If the id is already kebab-case (most are), use directly. Prefix with date for uniqueness and SEO.

**Page structure:**
- `<h1>`: Event title
- Date + confidence badge
- Full detail text (the `detail` field, rendered as paragraphs)
- Source list with tier badges (colored: Tier 1 red, Tier 2 blue, etc.)
- Media gallery if `media` array is present (images/article links with thumbnails)
- Mini map showing event location (static image or lightweight Leaflet instance, only if event has lat/lon from map-points matching the date)
- Sidebar: "More from this tracker" — 5 chronologically adjacent events with links
- Breadcrumb: `Watchboard > {Tracker Name} > Events > {Date}`
- CTA footer: "See the full {Tracker Name} dashboard →" linking to `/{tracker}/`

**Data flow:**
- `getStaticPaths()` iterates all non-draft trackers, loads event data via `loadTrackerData()`, flattens all events, generates one path per event
- Each event's `id` + `date` forms the slug
- Props include the event object, tracker config, and adjacent events for the sidebar

**SEO markup per page:**
- JSON-LD `@type: NewsArticle` with `headline`, `datePublished`, `dateModified`, `author` (Watchboard), `publisher` (Watchboard with logo), `description` (first 160 chars of detail)
- JSON-LD `@type: BreadcrumbList`
- `<link rel="canonical">` pointing to the event URL
- `<meta name="robots" content="max-image-preview:large">` (Google Discover eligibility)
- Dynamic OG image (see 1.2)
- `og:type: article`
- `article:published_time`, `article:section` (tracker domain)
- hreflang alternates if translated event data exists

### 1.2 Per-Event OG Image Generation

**Route:** `src/pages/og/[tracker]/[eventSlug].png.ts`

Extends the existing satori-based pipeline in `src/pages/og/[tracker].png.ts`.

**Card layout (1200x630):**
- Top-left: Tracker icon + tracker name + domain badge
- Center: Event headline (large, max 3 lines, truncated with ellipsis)
- Below headline: Date formatted as "March 31, 2026"
- Bottom-left: Source tier badges (e.g., colored dots + "Reuters · AP · IRNA")
- Bottom-right: Watchboard logo + URL
- Background: Dark (#0a0b0e) with subtle gradient matching tracker `color`

**Implementation:** Same satori + resvg approach as existing tracker OG images. Reuse font loading (JetBrains Mono, DM Sans). Accept event data as props from `getStaticPaths()`.

### 1.3 Enhanced Structured Data

**On tracker dashboard pages (`/[tracker]/`):**
- Upgrade from `@type: WebPage` to `@type: CollectionPage`
- Add `hasPart` array with references to the 10 most recent event permalinks
- Add `@type: Organization` for Watchboard as publisher

**On event permalink pages:**
- `@type: NewsArticle` (detailed in 1.1)

**Global (BaseLayout):**
- Add `@type: WebSite` with `potentialAction: SearchAction` pointing to `/search/?q={search_term_string}` (enables Google sitelinks search box)

### 1.4 News Sitemap

**Route:** `src/pages/sitemap-news.xml.ts`

Google News requires a dedicated news sitemap with articles published in the last 48 hours.

**Content:**
- Iterates all non-draft trackers
- Includes events from the last 48 hours
- Each entry: URL (event permalink), publication name (Watchboard), language, title, publication date
- Registered in `robots.txt` alongside the existing sitemap

**Note:** Google News inclusion isn't guaranteed but the sitemap is a prerequisite. The source-tiered, multi-perspective approach aligns with Google News quality guidelines.

### 1.5 Server-Rendered Event Previews on Tracker Pages

Currently, events on the tracker page are rendered entirely by React islands (`LatestEvents`, `TimelineSection`), which means crawlers see empty containers.

**Change:** Render the 5 most recent events as static HTML in the Astro template, below the `HeroKpiCombo`. Each includes:
- Event title as an `<a>` linking to the permalink
- Date
- One-line summary (first sentence of `detail`)
- Source tier indicator

This gives crawlers indexable content and internal links to event pages. The React islands still render the full interactive experience below.

---

## Phase 2: Fix the Front Door

Converts the organic traffic from Phase 1 into retained users.

### 2.1 Hero Section

Add a server-rendered section **above** the CommandCenter island in `src/pages/index.astro`.

**Structure:**
```
┌─────────────────────────────────────────────────┐
│  48 global trackers. Source-verified.            │
│  Updated daily by AI.                           │
│                                                 │
│  ● BREAKING: [headline from breaking tracker]   │
│                                                 │
│  3 updated today · 127 events this week · 4 lang│
│                                                 │
│  [Explore Trackers]        [How It Works]       │
└─────────────────────────────────────────────────┘
```

**Data source:** All data is already computed in `index.astro` frontmatter:
- Tracker count: `nonDraft.length`
- Breaking: find first tracker with `isBreaking === true`, use its `headline`
- "Updated today": count trackers where `lastUpdated` is within 24h
- "Events this week": sum `recentEventCount` across all trackers

**Styling:** Full-width, dark background with subtle noise overlay (existing pattern), large sans-serif text (DM Sans), accent color for breaking banner. Compact — should be ~200px tall max so the CommandCenter is still visible above the fold on most screens.

### 2.2 Curated "Start Here" Row

Horizontal scrollable row of 3-5 tracker cards between the hero and the full CommandCenter grid.

**Auto-selection algorithm (computed in frontmatter):**
1. Any tracker with `isBreaking === true` (priority)
2. Sort remaining by `recentEventCount` descending
3. Take top 5 (or fewer if less than 5 are active)

**Card design:** Compact horizontal card — tracker icon, name, one-line headline (truncated), freshness badge ("2h ago"), accent color border-left. Click navigates to `/{slug}/`.

**Rendering:** Server-rendered Astro HTML (no React island needed). Scrollable on mobile via `overflow-x: auto`.

### 2.3 Trust Strip

Thin horizontal strip below the hero:

```
Open Source · Source-Tiered (Tier 1-4) · 48 Trackers · 12,000+ Events · EN ES FR PT
```

Computed at build time. Each item is a subtle text badge. "Open Source" links to GitHub repo. "Source-Tiered" links to `/about/#source-tiers`.

### 2.4 Replace Welcome Overlay

Remove the blocking `WelcomeOverlay` component. Replace with:
- On first visit (localStorage flag `watchboard-welcomed`): show a single non-blocking toast at the bottom: "Press `/` to search, `B` for broadcast mode, `?` for all shortcuts"
- Auto-dismiss after 8 seconds
- No modal, no required interaction

---

## Phase 3: Viral Mechanics

Turns engaged users into distribution channels.

### 3.1 Share Button on Events

**On event permalink pages:**
- "Share" button in the event header
- Mobile: `navigator.share({ title, url })` (native share sheet)
- Desktop: copies URL to clipboard, shows toast "Link copied"
- Fallback: if `navigator.share` unavailable and clipboard fails, show URL in a small input for manual copy

**In timeline/events panels (dashboard):**
- Small share icon on each event row
- On click: copies the event permalink URL (requires generating the slug client-side, same logic as `getStaticPaths`)

### 3.2 Embed Discovery

**On each tracker dashboard page:**
- "Embed" button in the header (next to existing nav items, or in the footer)
- Opens a lightweight modal (not a full React island — can be a `<dialog>` element):
  - Preview of the embed widget (screenshot or live iframe at small scale)
  - `<iframe>` code snippet with copy button
  - Theme toggle (dark/light) that updates the snippet
  - Size note: "~4 KB, self-contained, auto-updates"

**On the Guide page (`/guide/`):**
- Add an "Embed on Your Site" section with the same snippet format

### 3.3 Email Digest Signup

**Provider:** Buttondown (free tier: 100 subscribers, no credit card, API available, supports RSS-to-email).

**Signup form placement:**
- Homepage hero section: single email input + "Subscribe" button, inline below the CTAs
- Tracker page footer: same form, contextualized ("Get {Tracker Name} updates by email")
- Event permalink pages: after the event content ("Stay informed — get the daily briefing")

**Implementation:** Simple `<form>` POST to Buttondown's subscribe endpoint. No JavaScript required for the basic form. Add a hidden `tag` field with the tracker slug for per-tracker segmentation later.

**Content source:** Point Buttondown's RSS-to-email feature at `/rss.xml` for the daily digest. Zero maintenance — when the nightly pipeline updates data and builds the site, the RSS updates, and Buttondown sends the email.

### 3.4 Breaking Event Social Loop

Enhance the existing social pipeline (`scripts/generate-social-queue.ts`):

**Current flow:** digest data → LLM generates tweet → judge scores → schedule → post
**Enhanced flow:** digest data → LLM generates tweet → **attach event permalink URL** (not dashboard URL) → **attach per-event OG image path** → judge scores → schedule → post with image

**Changes to `generate-social-queue.ts`:**
- For `breaking` type tweets: include the specific event permalink URL as the link
- For `data_viz` type tweets: continue linking to dashboard
- Tweet text includes the permalink; Twitter/X auto-unfurls the OG card

**Changes to `post-social-queue.ts`:**
- If tweet has an associated event image path, upload it as media attachment via Twitter API (produces richer cards than URL unfurling alone)

**Result:** Breaking event → auto-tweet with rich image card → clicks land on event permalink → event page has "explore the full dashboard" CTA → conversion to dashboard user.

---

## Phase 4: Daily Briefings

Compounds SEO value and provides return-visit hooks.

### 4.1 Daily Briefing Pages

**Route:** `src/pages/briefing/[date].astro`

**URL pattern:** `/briefing/2026-04-02`

**Page structure:**
- `<h1>`: "Daily Briefing — April 2, 2026"
- Summary stats: "X events across Y trackers"
- Events grouped by tracker, each tracker section:
  - Tracker icon + name + link to dashboard
  - Event list with titles linking to permalinks
  - Digest summary (from `digests.json`) if available
- Cross-tracker context paragraph (from sibling brief data if available, otherwise auto-generated from the events)
- Breadcrumb: `Watchboard > Briefings > April 2, 2026`
- Previous/Next day navigation links

**SEO value:** Targets queries like "world news April 2 2026," "what happened today," etc. Each briefing page links to 10-30 event permalinks, strengthening internal link structure.

**Generation:** `getStaticPaths()` generates one page per date that has events across any tracker. Scans all tracker event files, collects unique dates.

### 4.2 Briefing Index Page

**Route:** `src/pages/briefing/index.astro`

Calendar-style view of available briefings. Simple list of dates with event counts, linking to each briefing page. Most recent first.

### 4.3 Enhanced Tracker Landing Page SEO

On each `/{tracker}/` page:

**Auto-generated intro section** (server-rendered, above the dashboard):
- One paragraph from `config.description`
- Latest digest summary sentence
- "Last updated {relative time} · {eventCount} events tracked since {startDate}"
- This is static HTML, visible to crawlers, provides keyword-rich content

**FAQ Schema:**
- Add JSON-LD `@type: FAQPage` with 3-5 auto-generated Q&A pairs per tracker:
  - "What is the {tracker name}?" → config.description
  - "How often is this tracker updated?" → "Every {updateIntervalDays} day(s), powered by AI research"
  - "What sources does this tracker use?" → "Data from {count} sources across Tier 1-4 classifications"
  - "How many events are tracked?" → "{count} events since {startDate}"

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/pages/[tracker]/events/[...slug].astro` | Event permalink pages |
| `src/pages/og/[tracker]/[eventSlug].png.ts` | Per-event OG images |
| `src/pages/sitemap-news.xml.ts` | Google News sitemap |
| `src/pages/briefing/[date].astro` | Daily briefing pages |
| `src/pages/briefing/index.astro` | Briefing calendar/index |
| `src/components/static/EventPage.astro` | Event permalink layout component |
| `src/components/static/HeroSection.astro` | Homepage hero section |
| `src/components/static/StartHereRow.astro` | Curated trending trackers row |
| `src/components/static/TrustStrip.astro` | Social proof strip |
| `src/components/static/ShareButton.astro` | Share/copy-link button (inline script) |
| `src/components/static/EmbedModal.astro` | Embed code modal (dialog element) |
| `src/lib/event-utils.ts` | Event slug generation, permalink URL building |

## Files to Modify

| File | Change |
|------|--------|
| `src/pages/index.astro` | Add HeroSection, StartHereRow, TrustStrip above CommandCenter |
| `src/pages/[tracker]/index.astro` | Add server-rendered event previews, embed button, intro section, FAQ schema |
| `src/layouts/BaseLayout.astro` | Add WebSite SearchAction schema, upgrade structured data |
| `src/components/islands/CommandCenter/CommandCenter.tsx` | Remove WelcomeOverlay, add non-blocking toast |
| `public/robots.txt` | Add news sitemap reference |
| `scripts/generate-social-queue.ts` | Include event permalink URLs for breaking tweets |
| `scripts/post-social-queue.ts` | Upload event card images as media attachments |

## What We're NOT Doing

- No user accounts or authentication
- No comments or reactions system
- No paid tools beyond Buttondown free tier (100 subscribers)
- No dashboard redesign (the dashboard is strong)
- No new data pipelines (leveraging existing digest/event data)
- No real-time features (static site + nightly updates is the right model)
- No API changes (read-only static APIs remain as-is)

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Build time increases with thousands of event pages | Astro handles static generation well; monitor and consider pagination if >10K pages |
| Per-event OG images add build time | Satori is fast (~50ms/image); cache with content hash if needed |
| Google News rejection | News sitemap is a prerequisite, not a guarantee; the structured data improves regular search regardless |
| Email signup adds GDPR surface | Buttondown handles compliance; add privacy note to form |
| Event slugs could collide | Prefix with date + use full event ID; collision is extremely unlikely |
