# Growth Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take Watchboard from 20 DAU to 1,000+ DAU via SEO content engine, improved first-visit experience, and viral sharing mechanics.

**Architecture:** Four phases executed sequentially — (1) SEO: event permalink pages + OG images + structured data unlock thousands of indexable URLs, (2) Front Door: hero section + curated row + trust strip convert visitors into retained users, (3) Viral: share buttons + embed discovery + email signup create organic distribution, (4) Briefings: daily summary pages compound SEO and add return-visit hooks. All changes are Astro static pages + server-rendered components — no new React islands needed (except replacing WelcomeOverlay behavior).

**Tech Stack:** Astro 5, TypeScript, satori + @resvg/resvg-js (OG images), Zod (data validation), Vitest (unit tests). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-04-03-growth-engine-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `src/lib/event-slug.ts` | Event slug generation + permalink URL building |
| `src/lib/event-slug.test.ts` | Unit tests for slug generation |
| `src/pages/[tracker]/events/[...slug].astro` | Event permalink pages (SEO landing pages) |
| `src/pages/og/[tracker]/[eventSlug].png.ts` | Per-event OG card images (1200x630) |
| `src/pages/sitemap-news.xml.ts` | Google News sitemap (last 48h events) |
| `src/pages/briefing/[date].astro` | Daily cross-tracker briefing pages |
| `src/pages/briefing/index.astro` | Briefing calendar/index |
| `src/components/static/HeroSection.astro` | Homepage hero with tagline + breaking + stats |
| `src/components/static/StartHereRow.astro` | Curated trending trackers row |
| `src/components/static/TrustStrip.astro` | Social proof strip |
| `src/components/static/ShareButton.astro` | Copy-link / native share button |
| `src/components/static/EmbedModal.astro` | Embed code modal (dialog element) |

### Modified Files

| File | Change |
|------|--------|
| `src/pages/index.astro` | Add HeroSection, StartHereRow, TrustStrip above CommandCenter |
| `src/pages/[tracker]/index.astro` | Add server-rendered event previews, embed button, intro section, FAQ schema |
| `src/layouts/BaseLayout.astro` | Accept optional `structuredData` prop for custom JSON-LD; add WebSite SearchAction |
| `src/components/islands/CommandCenter/CommandCenter.tsx` | Remove WelcomeOverlay import + rendering, add non-blocking toast |
| `public/robots.txt` | Add news sitemap reference |

---

## Task 1: Event Slug Utility

**Files:**
- Create: `src/lib/event-slug.ts`
- Create: `src/lib/event-slug.test.ts`

- [ ] **Step 1: Write failing tests for slug generation**

Create `src/lib/event-slug.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { eventToSlug, eventPermalink } from './event-slug';

describe('eventToSlug', () => {
  it('generates slug from date + id', () => {
    expect(eventToSlug('2026-03-31', 'idf_day32_170_targets_mar31'))
      .toBe('2026-03-31-idf-day32-170-targets-mar31');
  });

  it('handles already-kebab-case ids', () => {
    expect(eventToSlug('2026-04-01', 'us-strike-tehran'))
      .toBe('2026-04-01-us-strike-tehran');
  });

  it('strips unsafe characters', () => {
    expect(eventToSlug('2026-01-15', 'test@event#with!chars'))
      .toBe('2026-01-15-test-event-with-chars');
  });

  it('collapses multiple hyphens', () => {
    expect(eventToSlug('2026-02-01', 'too___many___underscores'))
      .toBe('2026-02-01-too-many-underscores');
  });

  it('lowercases everything', () => {
    expect(eventToSlug('2026-03-01', 'IDF_Strike_TEHRAN'))
      .toBe('2026-03-01-idf-strike-tehran');
  });
});

describe('eventPermalink', () => {
  it('builds full permalink path', () => {
    expect(eventPermalink('iran-conflict', '2026-03-31', 'idf_day32'))
      .toBe('/iran-conflict/events/2026-03-31-idf-day32');
  });

  it('accepts custom basePath', () => {
    expect(eventPermalink('iran-conflict', '2026-03-31', 'idf_day32', '/watchboard/'))
      .toBe('/watchboard/iran-conflict/events/2026-03-31-idf-day32');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/event-slug.test.ts`
Expected: FAIL — module `./event-slug` not found

- [ ] **Step 3: Implement the slug utility**

Create `src/lib/event-slug.ts`:

```typescript
/**
 * Event slug generation and permalink URL building.
 *
 * Slug format: {YYYY-MM-DD}-{kebab-id}
 * Permalink: /{trackerSlug}/events/{slug}
 */

/** Convert an event's date + id into a URL-safe slug. */
export function eventToSlug(date: string, eventId: string): string {
  const kebabId = eventId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${date}-${kebabId}`;
}

/** Build the full permalink path for an event. */
export function eventPermalink(
  trackerSlug: string,
  date: string,
  eventId: string,
  basePath = '/',
): string {
  const slug = eventToSlug(date, eventId);
  const base = basePath.endsWith('/') ? basePath : `${basePath}/`;
  return `${base}${trackerSlug}/events/${slug}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/event-slug.test.ts`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/event-slug.ts src/lib/event-slug.test.ts
git commit -m "feat(seo): add event slug generation utility"
```

---

## Task 2: Event Permalink Pages

**Files:**
- Create: `src/pages/[tracker]/events/[...slug].astro`
- Read: `src/lib/data.ts`, `src/lib/timeline-utils.ts`, `src/lib/event-slug.ts`

- [ ] **Step 1: Create the event permalink page**

Create `src/pages/[tracker]/events/[...slug].astro`:

```astro
---
/**
 * Event permalink page — individual event landing page for SEO.
 *
 * URL: /{tracker}/events/{date}-{event-id-slug}
 * Each event gets its own indexable page with NewsArticle structured data.
 */
import BaseLayout from '../../../layouts/BaseLayout.astro';
import ShareButton from '../../../components/static/ShareButton.astro';
import { loadAllTrackers } from '../../../lib/tracker-registry';
import { loadTrackerData } from '../../../lib/data';
import { flattenTimelineEvents } from '../../../lib/timeline-utils';
import { eventToSlug, eventPermalink } from '../../../lib/event-slug';
import type { TrackerConfig } from '../../../lib/tracker-config';
import type { FlatEvent } from '../../../lib/timeline-utils';

export function getStaticPaths() {
  const trackers = loadAllTrackers();
  const paths: Array<{
    params: { tracker: string; slug: string };
    props: { config: TrackerConfig; event: FlatEvent; adjacentEvents: FlatEvent[] };
  }> = [];

  for (const t of trackers.filter(t => t.status !== 'draft')) {
    let data;
    try {
      data = loadTrackerData(t.slug, t.eraLabel);
    } catch {
      continue;
    }
    const flatEvents = flattenTimelineEvents(data.timeline);
    for (let i = 0; i < flatEvents.length; i++) {
      const ev = flatEvents[i];
      const slug = eventToSlug(ev.resolvedDate, ev.id);
      // Adjacent events: 2 before + 2 after
      const start = Math.max(0, i - 2);
      const end = Math.min(flatEvents.length, i + 3);
      const adjacent = flatEvents.slice(start, end).filter((_, idx) => idx !== i - start);

      paths.push({
        params: { tracker: t.slug, slug },
        props: { config: t, event: ev, adjacentEvents: adjacent },
      });
    }
  }
  return paths;
}

interface Props {
  config: TrackerConfig;
  event: FlatEvent;
  adjacentEvents: FlatEvent[];
}

const { config, event, adjacentEvents } = Astro.props;
const base = import.meta.env.BASE_URL || '/';
const basePath = base.endsWith('/') ? base : `${base}/`;
const siteUrl = import.meta.env.SITE || 'https://watchboard.dev';
const slug = eventToSlug(event.resolvedDate, event.id);
const pageUrl = `${siteUrl}${basePath}${config.slug}/events/${slug}`;
const ogImageUrl = `${siteUrl}${basePath}og/${config.slug}/${slug}.png`;

// Format date for display
const dateObj = new Date(event.resolvedDate + 'T00:00:00Z');
const displayDate = dateObj.toLocaleDateString('en-US', {
  year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
});

// First 160 chars of detail for meta description
const metaDesc = event.detail
  ? event.detail.replace(/<[^>]+>/g, '').slice(0, 157) + '...'
  : `${event.title} — ${config.name}`;

// Tier color mapping
const tierColors: Record<number, string> = {
  1: 'var(--accent-red)', 2: 'var(--accent-blue)',
  3: 'var(--accent-amber)', 4: 'var(--text-muted)',
};
const tierLabels: Record<number, string> = {
  1: 'Official/Primary', 2: 'Major Outlet',
  3: 'Institutional', 4: 'Unverified',
};

// Type color mapping
const typeColors: Record<string, string> = {
  strike: 'var(--accent-red)', attack: 'var(--accent-red)',
  retaliation: 'var(--accent-amber)', response: 'var(--accent-amber)',
  diplomatic: 'var(--accent-blue)', politics: 'var(--accent-blue)',
  ceasefire: 'var(--accent-green)', peace: 'var(--accent-green)',
};
const typeColor = typeColors[event.type] || 'var(--border-light)';

// NewsArticle JSON-LD
const newsArticleSchema = {
  "@context": "https://schema.org",
  "@type": "NewsArticle",
  "headline": event.title,
  "datePublished": event.resolvedDate,
  "description": metaDesc,
  "image": ogImageUrl,
  "author": { "@type": "Organization", "name": "Watchboard", "url": siteUrl },
  "publisher": {
    "@type": "Organization",
    "name": "Watchboard",
    "url": siteUrl,
    "logo": { "@type": "ImageObject", "url": `${siteUrl}${basePath}og/watchboard-logo.png` },
  },
  "mainEntityOfPage": { "@type": "WebPage", "@id": pageUrl },
};

// Breadcrumb JSON-LD
const breadcrumbSchema = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Watchboard", "item": `${siteUrl}${basePath}` },
    { "@type": "ListItem", "position": 2, "name": config.shortName, "item": `${siteUrl}${basePath}${config.slug}/` },
    { "@type": "ListItem", "position": 3, "name": displayDate, "item": pageUrl },
  ],
};
---
<BaseLayout
  title={`${event.title} — ${config.shortName}`}
  description={metaDesc}
  trackerSlug={config.slug}
  githubRepo={config.githubRepo}
>
  <Fragment slot="head">
    <meta property="og:type" content="article" />
    <meta property="og:image" content={ogImageUrl} />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="article:published_time" content={event.resolvedDate} />
    <meta property="article:section" content={config.domain || 'news'} />
    <meta name="robots" content="max-image-preview:large" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content={ogImageUrl} />
    <script is:inline type="application/ld+json" set:html={JSON.stringify(newsArticleSchema)} />
    <script is:inline type="application/ld+json" set:html={JSON.stringify(breadcrumbSchema)} />
  </Fragment>

  <main id="main-content" class="event-page">
    <div class="event-container">
      <!-- Breadcrumb -->
      <nav class="event-breadcrumb" aria-label="Breadcrumb">
        <a href={`${basePath}`}>Watchboard</a>
        <span class="sep">/</span>
        <a href={`${basePath}${config.slug}/`}>{config.shortName}</a>
        <span class="sep">/</span>
        <span>Events</span>
        <span class="sep">/</span>
        <span class="current">{displayDate}</span>
      </nav>

      <article class="event-article">
        <!-- Header -->
        <header class="event-header">
          <div class="event-meta-row">
            <time datetime={event.resolvedDate} class="event-date">{displayDate}</time>
            <span class="event-type-badge" style={`border-color: ${typeColor}`}>{event.type}</span>
            {event.confidence && (
              <span class={`confidence-badge confidence-${event.confidence}`}>
                {event.confidence} confidence
              </span>
            )}
          </div>
          <h1 class="event-title">{event.title}</h1>
          <div class="event-actions">
            <ShareButton url={pageUrl} title={event.title} />
          </div>
        </header>

        <!-- Detail -->
        {event.detail && (
          <div class="event-detail">
            {event.detail.split('\n').filter(Boolean).map(p => <p>{p}</p>)}
          </div>
        )}

        <!-- Sources -->
        <section class="event-sources">
          <h2>Sources</h2>
          <ul class="source-list">
            {event.sources.map(src => (
              <li class="source-item">
                <span class="tier-dot" style={`background: ${tierColors[src.tier] || tierColors[4]}`}
                  title={`Tier ${src.tier}: ${tierLabels[src.tier] || 'Unknown'}`}></span>
                <span class="source-name">
                  {src.url ? <a href={src.url} target="_blank" rel="noopener noreferrer">{src.name}</a> : src.name}
                </span>
                <span class="tier-label">Tier {src.tier}</span>
                {src.pole && <span class="pole-label">{src.pole.replace('_', ' ')}</span>}
              </li>
            ))}
          </ul>
        </section>

        <!-- Media -->
        {event.media && event.media.length > 0 && (
          <section class="event-media">
            <h2>Media</h2>
            <div class="media-grid">
              {event.media.map(m => (
                <a href={m.url} target="_blank" rel="noopener noreferrer" class="media-item">
                  {m.thumbnail && <img src={m.thumbnail} alt={m.caption || m.source || ''} loading="lazy" />}
                  <div class="media-info">
                    {m.caption && <span class="media-caption">{m.caption}</span>}
                    {m.source && <span class="media-source">{m.source}</span>}
                  </div>
                </a>
              ))}
            </div>
          </section>
        )}
      </article>

      <!-- Sidebar: adjacent events -->
      <aside class="event-sidebar">
        <h2>More from {config.shortName}</h2>
        <ul class="adjacent-events">
          {adjacentEvents.map(adj => (
            <li>
              <a href={eventPermalink(config.slug, adj.resolvedDate, adj.id, basePath)}>
                <time datetime={adj.resolvedDate}>
                  {new Date(adj.resolvedDate + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}
                </time>
                <span>{adj.title}</span>
              </a>
            </li>
          ))}
        </ul>
        <a class="cta-dashboard" href={`${basePath}${config.slug}/`}>
          See the full {config.shortName} dashboard &rarr;
        </a>
      </aside>
    </div>
  </main>
</BaseLayout>

<style>
  .event-page {
    max-width: 1100px;
    margin: 0 auto;
    padding: 2rem 1.5rem 4rem;
  }
  .event-container {
    display: grid;
    grid-template-columns: 1fr 280px;
    gap: 3rem;
  }

  /* Breadcrumb */
  .event-breadcrumb {
    grid-column: 1 / -1;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.72rem;
    color: var(--text-muted);
    margin-bottom: 1rem;
  }
  .event-breadcrumb a {
    color: var(--text-muted);
    text-decoration: none;
    transition: color 0.2s;
  }
  .event-breadcrumb a:hover { color: var(--accent-blue); }
  .event-breadcrumb .sep { margin: 0 0.4rem; opacity: 0.4; }
  .event-breadcrumb .current { color: var(--text-secondary); }

  /* Article */
  .event-article { grid-column: 1; }

  .event-header { margin-bottom: 2rem; }
  .event-meta-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
    flex-wrap: wrap;
  }
  .event-date {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.78rem;
    color: var(--text-muted);
  }
  .event-type-badge {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-secondary);
    border: 1px solid;
    padding: 0.15rem 0.5rem;
    border-radius: 4px;
  }
  .confidence-badge {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 0.15rem 0.5rem;
    border-radius: 4px;
    background: var(--bg-card);
    border: 1px solid var(--border);
  }
  .confidence-high { color: var(--accent-green); border-color: var(--accent-green); }
  .confidence-medium { color: var(--accent-amber); border-color: var(--accent-amber); }
  .confidence-low { color: var(--accent-red); border-color: var(--accent-red); }

  .event-title {
    font-family: 'Cormorant Garamond', serif;
    font-size: clamp(1.4rem, 4vw, 2rem);
    font-weight: 700;
    color: var(--text-primary);
    line-height: 1.3;
    margin: 0;
  }
  .event-actions {
    margin-top: 1rem;
  }

  /* Detail */
  .event-detail {
    margin-bottom: 2.5rem;
  }
  .event-detail p {
    font-family: 'DM Sans', sans-serif;
    font-size: 0.9rem;
    color: var(--text-secondary);
    line-height: 1.8;
    margin-bottom: 0.75rem;
  }

  /* Sources */
  .event-sources h2,
  .event-media h2 {
    font-family: 'DM Sans', sans-serif;
    font-size: 0.85rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-primary);
    margin-bottom: 0.75rem;
  }
  .source-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .source-item {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--border);
    font-family: 'DM Sans', sans-serif;
    font-size: 0.82rem;
  }
  .source-item:last-child { border-bottom: none; }
  .tier-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .source-name { color: var(--text-secondary); flex: 1; }
  .source-name a { color: var(--accent-blue); text-decoration: none; }
  .source-name a:hover { text-decoration: underline; }
  .tier-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.68rem;
    color: var(--text-muted);
    text-transform: uppercase;
  }
  .pole-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.65rem;
    color: var(--text-muted);
    text-transform: capitalize;
    background: var(--bg-card);
    padding: 0.1rem 0.4rem;
    border-radius: 3px;
  }

  /* Media */
  .event-media { margin-top: 2rem; }
  .media-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 0.75rem;
  }
  .media-item {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
    text-decoration: none;
    transition: border-color 0.2s;
  }
  .media-item:hover { border-color: var(--border-light); }
  .media-item img {
    width: 100%;
    height: 120px;
    object-fit: cover;
  }
  .media-info {
    padding: 0.5rem 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }
  .media-caption {
    font-family: 'DM Sans', sans-serif;
    font-size: 0.75rem;
    color: var(--text-secondary);
    line-height: 1.4;
  }
  .media-source {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.65rem;
    color: var(--text-muted);
  }

  /* Sidebar */
  .event-sidebar {
    grid-column: 2;
    position: sticky;
    top: 5rem;
    align-self: start;
  }
  .event-sidebar h2 {
    font-family: 'DM Sans', sans-serif;
    font-size: 0.82rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-primary);
    margin-bottom: 0.75rem;
  }
  .adjacent-events {
    list-style: none;
    padding: 0;
    margin: 0 0 1.5rem;
  }
  .adjacent-events li {
    border-bottom: 1px solid var(--border);
  }
  .adjacent-events a {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    padding: 0.6rem 0;
    text-decoration: none;
    transition: background 0.2s;
  }
  .adjacent-events a:hover { background: var(--bg-card); }
  .adjacent-events time {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.68rem;
    color: var(--text-muted);
  }
  .adjacent-events span {
    font-family: 'DM Sans', sans-serif;
    font-size: 0.78rem;
    color: var(--text-secondary);
    line-height: 1.4;
  }
  .cta-dashboard {
    display: block;
    font-family: 'DM Sans', sans-serif;
    font-size: 0.82rem;
    color: var(--accent-blue);
    text-decoration: none;
    padding: 0.6rem 0;
    transition: color 0.2s;
  }
  .cta-dashboard:hover { color: var(--text-primary); }

  @media (max-width: 768px) {
    .event-container {
      grid-template-columns: 1fr;
      gap: 2rem;
    }
    .event-sidebar {
      grid-column: 1;
      position: static;
    }
  }
</style>
```

- [ ] **Step 2: Update BaseLayout to accept head slot**

In `src/layouts/BaseLayout.astro`, the `<head>` tag needs a `<slot name="head" />` so that child pages can inject additional meta tags (OG image overrides, structured data, etc.).

Add this line inside `<head>`, just before the closing `</head>` tag (after the PostHog script block, before line 81):

```astro
  <slot name="head" />
```

- [ ] **Step 3: Build and verify**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds. New event pages appear in `dist/` under `{tracker}/events/` directories.

Verify a page exists:
Run: `ls dist/iran-conflict/events/ | head -5`
Expected: Several directories like `2026-03-31-idf-day32-170-targets/`

- [ ] **Step 4: Commit**

```bash
git add src/pages/[tracker]/events/ src/layouts/BaseLayout.astro
git commit -m "feat(seo): add event permalink pages with NewsArticle schema"
```

---

## Task 3: Per-Event OG Images

**Files:**
- Create: `src/pages/og/[tracker]/[eventSlug].png.ts`
- Read: `src/pages/og/[tracker].png.ts` (existing pattern)

- [ ] **Step 1: Create per-event OG image generator**

Create `src/pages/og/[tracker]/[eventSlug].png.ts`:

```typescript
/**
 * Per-event OG card image generator.
 *
 * Produces a 1200x630 PNG for each event at build time.
 * Extends the tracker-level OG pipeline with event-specific content:
 * headline, date, source tier badges, tracker branding.
 *
 * IMPORTANT: satori requires every <div> to have explicit display:'flex'.
 */
import type { APIRoute, GetStaticPaths } from 'astro';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadAllTrackers } from '../../../lib/tracker-registry';
import { loadTrackerData } from '../../../lib/data';
import { flattenTimelineEvents } from '../../../lib/timeline-utils';
import { eventToSlug } from '../../../lib/event-slug';
import type { TrackerConfig } from '../../../lib/tracker-config';
import type { FlatEvent } from '../../../lib/timeline-utils';

const WIDTH = 1200;
const HEIGHT = 630;

const BG_COLOR = '#0d1117';
const BG_SUBTLE = '#161b22';
const TEXT_PRIMARY = '#e6edf3';
const TEXT_SECONDARY = '#8b949e';
const BORDER_COLOR = '#30363d';
const BRANDING_COLOR = '#484f58';

const TIER_COLORS: Record<number, string> = {
  1: '#f85149', 2: '#58a6ff', 3: '#d29922', 4: '#8b949e',
};

let fontDataCache: ArrayBuffer | null = null;
function loadFont(): ArrayBuffer {
  if (fontDataCache) return fontDataCache;
  const fontPath = join(process.cwd(), 'public/fonts/JetBrainsMono-Regular.ttf');
  const buf = readFileSync(fontPath);
  fontDataCache = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return fontDataCache;
}

type SatoriNode = Record<string, unknown>;
function el(
  style: Record<string, unknown>,
  children: SatoriNode[] | SatoriNode | string,
): SatoriNode {
  return {
    type: 'div',
    props: {
      style: { display: 'flex', ...style },
      children,
    },
  };
}

function buildEventCardMarkup(config: TrackerConfig, event: FlatEvent): SatoriNode {
  const accentColor = config.color || '#58a6ff';
  const titleText = config.shortName || config.name;

  // Format date
  const dateObj = new Date(event.resolvedDate + 'T00:00:00Z');
  const displayDate = dateObj.toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  });

  // Truncate headline
  const headline = event.title.length > 120
    ? event.title.slice(0, 117) + '...'
    : event.title;

  // Source badges (unique sources, max 4)
  const uniqueSources = event.sources
    .filter((s, i, arr) => arr.findIndex(x => x.name === s.name) === i)
    .slice(0, 4);

  const sourceBadges = uniqueSources.map(src =>
    el(
      { alignItems: 'center', gap: '6px' },
      [
        el(
          {
            width: '8px', height: '8px', borderRadius: '50%',
            backgroundColor: TIER_COLORS[src.tier] || TIER_COLORS[4],
          },
          [],
        ),
        el(
          { fontSize: '14px', color: TEXT_SECONDARY },
          src.name,
        ),
      ],
    ),
  );

  return el(
    {
      flexDirection: 'column',
      width: '100%', height: '100%',
      backgroundColor: BG_COLOR,
      padding: '48px 56px',
      fontFamily: 'JetBrains Mono',
    },
    [
      // Top accent line
      el(
        {
          position: 'absolute', top: '0', left: '0',
          width: '100%', height: '4px',
          backgroundColor: accentColor,
        },
        [],
      ),

      // Header: tracker name + date
      el(
        { alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' },
        [
          el(
            { alignItems: 'center', gap: '12px' },
            [
              el(
                {
                  width: '36px', height: '36px', borderRadius: '50%',
                  backgroundColor: accentColor,
                  color: '#ffffff', fontSize: '16px', fontWeight: 700,
                  alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                },
                titleText.charAt(0).toUpperCase(),
              ),
              el(
                { fontSize: '18px', fontWeight: 700, color: TEXT_SECONDARY },
                titleText,
              ),
            ],
          ),
          el(
            {
              fontSize: '16px', color: TEXT_SECONDARY,
              backgroundColor: BG_SUBTLE,
              border: `1px solid ${BORDER_COLOR}`,
              padding: '6px 16px', borderRadius: '6px',
            },
            displayDate,
          ),
        ],
      ),

      // Headline
      el(
        {
          fontSize: '38px', fontWeight: 700, color: TEXT_PRIMARY,
          lineHeight: 1.2, flex: '1', maxWidth: '1000px',
        },
        headline,
      ),

      // Bottom: sources + branding
      el(
        { justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '24px' },
        [
          el(
            { gap: '16px', flexWrap: 'wrap', alignItems: 'center' },
            sourceBadges.length > 0 ? sourceBadges : [el({ fontSize: '14px', color: BRANDING_COLOR }, '')],
          ),
          el({ alignItems: 'center', gap: '8px' }, [
            el(
              { width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#f85149' },
              [],
            ),
            el(
              { fontSize: '18px', fontWeight: 700, color: BRANDING_COLOR, letterSpacing: '3px' },
              'WATCHBOARD',
            ),
          ]),
        ],
      ),
    ],
  );
}

export const getStaticPaths: GetStaticPaths = () => {
  const trackers = loadAllTrackers();
  const paths: Array<{
    params: { tracker: string; eventSlug: string };
    props: { config: TrackerConfig; event: FlatEvent };
  }> = [];

  for (const t of trackers.filter(t => t.status !== 'draft')) {
    let data;
    try {
      data = loadTrackerData(t.slug, t.eraLabel);
    } catch {
      continue;
    }
    const flatEvents = flattenTimelineEvents(data.timeline);
    for (const ev of flatEvents) {
      paths.push({
        params: { tracker: t.slug, eventSlug: eventToSlug(ev.resolvedDate, ev.id) },
        props: { config: t, event: ev },
      });
    }
  }
  return paths;
};

export const GET: APIRoute = async ({ props }) => {
  const config = props.config as TrackerConfig;
  const event = props.event as FlatEvent;

  const fontData = loadFont();
  const markup = buildEventCardMarkup(config, event);

  const svg = await satori(markup as unknown as React.ReactNode, {
    width: WIDTH,
    height: HEIGHT,
    fonts: [
      { name: 'JetBrains Mono', data: fontData, weight: 400, style: 'normal' },
    ],
  });

  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: WIDTH } });
  const pngData = resvg.render();
  const pngBuffer = pngData.asPng();

  return new Response(Buffer.from(pngBuffer), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400',
    },
  });
};
```

- [ ] **Step 2: Build and verify**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds. OG images generated under `dist/og/{tracker}/` directories.

Verify:
Run: `ls dist/og/iran-conflict/ | head -5`
Expected: PNG files like `2026-03-31-idf-day32-170-targets.png`

- [ ] **Step 3: Commit**

```bash
git add src/pages/og/[tracker]/[eventSlug].png.ts
git commit -m "feat(seo): add per-event OG card images via satori"
```

---

## Task 4: News Sitemap + robots.txt

**Files:**
- Create: `src/pages/sitemap-news.xml.ts`
- Modify: `public/robots.txt`

- [ ] **Step 1: Create news sitemap endpoint**

Create `src/pages/sitemap-news.xml.ts`:

```typescript
/**
 * Google News sitemap — lists events published in the last 48 hours.
 *
 * Google News requires a dedicated sitemap with <news:news> entries
 * for recently published articles. This complements the main sitemap.
 */
import type { APIRoute } from 'astro';
import { loadAllTrackers } from '../lib/tracker-registry';
import { loadTrackerData } from '../lib/data';
import { flattenTimelineEvents } from '../lib/timeline-utils';
import { eventToSlug } from '../lib/event-slug';

export const GET: APIRoute = ({ site }) => {
  const siteUrl = site?.toString().replace(/\/$/, '') || 'https://watchboard.dev';
  const trackers = loadAllTrackers().filter(t => t.status !== 'draft');
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  const entries: string[] = [];

  for (const t of trackers) {
    let data;
    try {
      data = loadTrackerData(t.slug, t.eraLabel);
    } catch {
      continue;
    }
    const flatEvents = flattenTimelineEvents(data.timeline);
    for (const ev of flatEvents) {
      if (ev.resolvedDate < cutoffStr) continue;
      const slug = eventToSlug(ev.resolvedDate, ev.id);
      const url = `${siteUrl}/${t.slug}/events/${slug}`;
      entries.push(`  <url>
    <loc>${url}</loc>
    <news:news>
      <news:publication>
        <news:name>Watchboard</news:name>
        <news:language>en</news:language>
      </news:publication>
      <news:publication_date>${ev.resolvedDate}</news:publication_date>
      <news:title>${escapeXml(ev.title)}</news:title>
    </news:news>
  </url>`);
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${entries.join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
```

- [ ] **Step 2: Update robots.txt**

Add the news sitemap reference to `public/robots.txt` so it becomes:

```
User-agent: *
Allow: /

Sitemap: https://watchboard.dev/sitemap-index.xml
Sitemap: https://watchboard.dev/sitemap-news.xml
```

- [ ] **Step 3: Build and verify**

Run: `npm run build && cat dist/sitemap-news.xml | head -20`
Expected: Valid XML with `<news:news>` entries for recent events.

- [ ] **Step 4: Commit**

```bash
git add src/pages/sitemap-news.xml.ts public/robots.txt
git commit -m "feat(seo): add Google News sitemap and update robots.txt"
```

---

## Task 5: Server-Rendered Event Previews on Tracker Pages

**Files:**
- Modify: `src/pages/[tracker]/index.astro`

- [ ] **Step 1: Add server-rendered latest events below HeroKpiCombo**

In `src/pages/[tracker]/index.astro`, add an import for `eventPermalink` in the frontmatter section (after the existing imports):

```typescript
import { eventPermalink } from '../../lib/event-slug';
```

Then add this block between `<HeroKpiCombo>` and `<div class="theater-layout">` (after line 63 in the current file), inside the `<main>` in the desktop layout:

```astro
      <!-- Server-rendered event previews for SEO crawlability -->
      <div class="seo-event-previews">
        <h2 class="seo-events-heading">Latest Events</h2>
        {flatEvents.slice(-5).reverse().map(ev => (
          <a href={eventPermalink(config.slug, ev.resolvedDate, ev.id, basePath)} class="seo-event-link">
            <time datetime={ev.resolvedDate}>
              {new Date(ev.resolvedDate + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}
            </time>
            <span class="seo-event-title">{ev.title}</span>
            <span class="seo-event-tier">
              {ev.sources[0] && `Tier ${ev.sources[0].tier}`}
            </span>
          </a>
        ))}
      </div>
```

- [ ] **Step 2: Add the basePath variable computation**

In the frontmatter of `[tracker]/index.astro`, add (if not already present):

```typescript
const base = import.meta.env.BASE_URL || '/';
const basePath = base.endsWith('/') ? base : `${base}/`;
```

- [ ] **Step 3: Add styles for the SEO event previews**

Add at the bottom of the existing `<style>` block in `[tracker]/index.astro`:

```css
  .seo-event-previews {
    max-width: 900px;
    margin: 0 auto 1.5rem;
    padding: 0 1rem;
  }
  .seo-events-heading {
    font-family: 'DM Sans', sans-serif;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-muted);
    margin-bottom: 0.5rem;
  }
  .seo-event-link {
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
    padding: 0.4rem 0;
    border-bottom: 1px solid var(--border);
    text-decoration: none;
    font-family: 'DM Sans', sans-serif;
    font-size: 0.82rem;
    transition: background 0.15s;
  }
  .seo-event-link:hover { background: var(--bg-card); }
  .seo-event-link time {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.7rem;
    color: var(--text-muted);
    flex-shrink: 0;
    min-width: 50px;
  }
  .seo-event-title {
    color: var(--text-secondary);
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .seo-event-tier {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.65rem;
    color: var(--text-muted);
    flex-shrink: 0;
  }
```

- [ ] **Step 4: Build and verify**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds.

Verify crawlable content:
Run: `grep -c 'seo-event-link' dist/iran-conflict/index.html`
Expected: 5 (one per previewed event)

- [ ] **Step 5: Commit**

```bash
git add src/pages/[tracker]/index.astro
git commit -m "feat(seo): add server-rendered event previews on tracker pages"
```

---

## Task 6: Enhanced Structured Data in BaseLayout

**Files:**
- Modify: `src/layouts/BaseLayout.astro`

- [ ] **Step 1: Add WebSite SearchAction schema**

In `src/layouts/BaseLayout.astro`, replace the existing JSON-LD script block (lines 51-57) with:

```astro
  <script is:inline type="application/ld+json" set:html={JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": "Watchboard",
    "url": `${siteUrl}${basePath}`,
    "potentialAction": {
      "@type": "SearchAction",
      "target": {
        "@type": "EntryPoint",
        "urlTemplate": `${siteUrl}${basePath}search/?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  })} />
  <script is:inline type="application/ld+json" set:html={JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": title,
    "description": desc,
    "url": pageUrl,
  })} />
```

- [ ] **Step 2: Build and verify**

Run: `npm run build && grep -o 'SearchAction' dist/index.html | head -1`
Expected: `SearchAction`

- [ ] **Step 3: Commit**

```bash
git add src/layouts/BaseLayout.astro
git commit -m "feat(seo): add WebSite SearchAction schema for Google sitelinks"
```

---

## Task 7: Homepage Hero Section

**Files:**
- Create: `src/components/static/HeroSection.astro`
- Modify: `src/pages/index.astro`

- [ ] **Step 1: Create HeroSection component**

Create `src/components/static/HeroSection.astro`:

```astro
---
/**
 * Homepage hero section — communicates what Watchboard is in 5 seconds.
 * Server-rendered, zero JS.
 */
interface Props {
  trackerCount: number;
  updatedTodayCount: number;
  weeklyEventCount: number;
  breakingHeadline?: string;
  breakingSlug?: string;
  basePath: string;
}

const { trackerCount, updatedTodayCount, weeklyEventCount, breakingHeadline, breakingSlug, basePath } = Astro.props;
---

<section class="hero-section" aria-label="Platform overview">
  <div class="hero-content">
    <h1 class="hero-tagline">
      {trackerCount} global trackers. Source-verified.<br />
      Updated daily by AI.
    </h1>

    {breakingHeadline && breakingSlug && (
      <a href={`${basePath}${breakingSlug}/`} class="hero-breaking">
        <span class="breaking-dot"></span>
        <span class="breaking-label">BREAKING</span>
        <span class="breaking-text">{breakingHeadline.length > 100 ? breakingHeadline.slice(0, 97) + '...' : breakingHeadline}</span>
      </a>
    )}

    <div class="hero-stats">
      <span>{updatedTodayCount} updated today</span>
      <span class="stat-sep">&middot;</span>
      <span>{weeklyEventCount.toLocaleString()} events this week</span>
      <span class="stat-sep">&middot;</span>
      <span>4 languages</span>
    </div>

    <div class="hero-ctas">
      <a href="#command-center" class="cta-primary">Explore Trackers</a>
      <a href={`${basePath}about/`} class="cta-secondary">How It Works</a>
    </div>
  </div>
</section>

<style>
  .hero-section {
    padding: 3rem 1.5rem 2rem;
    text-align: center;
    border-bottom: 1px solid var(--border);
  }
  .hero-content {
    max-width: 700px;
    margin: 0 auto;
  }
  .hero-tagline {
    font-family: 'Cormorant Garamond', serif;
    font-size: clamp(1.3rem, 4vw, 1.8rem);
    font-weight: 700;
    color: var(--text-primary);
    line-height: 1.4;
    margin: 0 0 1.25rem;
    letter-spacing: -0.01em;
  }

  .hero-breaking {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    background: rgba(248, 81, 73, 0.08);
    border: 1px solid rgba(248, 81, 73, 0.2);
    border-radius: 6px;
    padding: 0.5rem 1rem;
    margin-bottom: 1.25rem;
    text-decoration: none;
    transition: border-color 0.2s;
    max-width: 100%;
  }
  .hero-breaking:hover { border-color: rgba(248, 81, 73, 0.5); }
  .breaking-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--accent-red);
    animation: pulse-dot 1.5s ease-in-out infinite;
    flex-shrink: 0;
  }
  @keyframes pulse-dot {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }
  .breaking-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.68rem;
    font-weight: 700;
    color: var(--accent-red);
    letter-spacing: 0.1em;
    flex-shrink: 0;
  }
  .breaking-text {
    font-family: 'DM Sans', sans-serif;
    font-size: 0.82rem;
    color: var(--text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .hero-stats {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.72rem;
    color: var(--text-muted);
    margin-bottom: 1.25rem;
  }
  .stat-sep { margin: 0 0.4rem; opacity: 0.4; }

  .hero-ctas {
    display: flex;
    gap: 0.75rem;
    justify-content: center;
  }
  .cta-primary,
  .cta-secondary {
    font-family: 'DM Sans', sans-serif;
    font-size: 0.82rem;
    font-weight: 600;
    padding: 0.5rem 1.25rem;
    border-radius: 6px;
    text-decoration: none;
    transition: all 0.2s;
  }
  .cta-primary {
    background: var(--accent-blue);
    color: #ffffff;
  }
  .cta-primary:hover { opacity: 0.9; }
  .cta-secondary {
    border: 1px solid var(--border);
    color: var(--text-secondary);
  }
  .cta-secondary:hover {
    border-color: var(--border-light);
    color: var(--text-primary);
  }

  @media (max-width: 480px) {
    .hero-section { padding: 2rem 1rem 1.5rem; }
    .hero-ctas { flex-direction: column; align-items: center; }
    .hero-breaking { flex-wrap: wrap; justify-content: center; }
    .breaking-text { white-space: normal; text-align: center; }
  }
</style>
```

- [ ] **Step 2: Create TrustStrip component**

Create `src/components/static/TrustStrip.astro`:

```astro
---
interface Props {
  trackerCount: number;
  totalEvents: number;
  githubUrl: string;
  basePath: string;
}
const { trackerCount, totalEvents, githubUrl, basePath } = Astro.props;
---

<div class="trust-strip">
  <a href={githubUrl} target="_blank" rel="noopener noreferrer" class="trust-item">Open Source</a>
  <span class="trust-sep">&middot;</span>
  <a href={`${basePath}about/`} class="trust-item">Source-Tiered (Tier 1-4)</a>
  <span class="trust-sep">&middot;</span>
  <span class="trust-item">{trackerCount} Trackers</span>
  <span class="trust-sep">&middot;</span>
  <span class="trust-item">{totalEvents.toLocaleString()}+ Events</span>
  <span class="trust-sep">&middot;</span>
  <span class="trust-item">EN ES FR PT</span>
</div>

<style>
  .trust-strip {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    gap: 0.3rem;
    padding: 0.6rem 1rem;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.65rem;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border);
    background: var(--bg-secondary);
  }
  .trust-item { letter-spacing: 0.04em; }
  .trust-sep { opacity: 0.3; }
  a.trust-item {
    color: var(--text-muted);
    text-decoration: none;
    transition: color 0.2s;
  }
  a.trust-item:hover { color: var(--accent-blue); }
</style>
```

- [ ] **Step 3: Create StartHereRow component**

Create `src/components/static/StartHereRow.astro`:

```astro
---
/**
 * Curated "start here" row — auto-selected trending trackers.
 * Shows 3-5 most active/breaking trackers as compact cards.
 */
interface TrackerCard {
  slug: string;
  shortName: string;
  icon: string;
  color: string;
  headline?: string;
  lastUpdated: string;
  isBreaking: boolean;
}

interface Props {
  trackers: TrackerCard[];
  basePath: string;
}

const { trackers, basePath } = Astro.props;

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600_000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
---

{trackers.length > 0 && (
  <section class="start-here" aria-label="Trending trackers">
    <h2 class="start-here-heading">Trending Now</h2>
    <div class="start-here-row">
      {trackers.map(t => (
        <a href={`${basePath}${t.slug}/`} class="start-card" style={`border-left-color: ${t.color}`}>
          <div class="start-card-header">
            <span class="start-card-icon">{t.icon}</span>
            <span class="start-card-name">{t.shortName}</span>
            {t.isBreaking && <span class="start-card-breaking">LIVE</span>}
          </div>
          {t.headline && (
            <p class="start-card-headline">
              {t.headline.length > 80 ? t.headline.slice(0, 77) + '...' : t.headline}
            </p>
          )}
          <span class="start-card-freshness">{relativeTime(t.lastUpdated)}</span>
        </a>
      ))}
    </div>
  </section>
)}

<style>
  .start-here {
    padding: 1rem 1.5rem;
    border-bottom: 1px solid var(--border);
  }
  .start-here-heading {
    font-family: 'DM Sans', sans-serif;
    font-size: 0.72rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-muted);
    margin-bottom: 0.6rem;
  }
  .start-here-row {
    display: flex;
    gap: 0.75rem;
    overflow-x: auto;
    padding-bottom: 0.5rem;
    scrollbar-width: thin;
  }
  .start-card {
    flex: 0 0 auto;
    min-width: 220px;
    max-width: 280px;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-left: 3px solid;
    border-radius: 6px;
    padding: 0.75rem;
    text-decoration: none;
    transition: border-color 0.2s, background 0.2s;
  }
  .start-card:hover {
    border-color: var(--border-light);
    background: var(--bg-secondary);
  }
  .start-card-header {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin-bottom: 0.4rem;
  }
  .start-card-icon { font-size: 0.9rem; }
  .start-card-name {
    font-family: 'DM Sans', sans-serif;
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--text-primary);
    flex: 1;
  }
  .start-card-breaking {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.6rem;
    font-weight: 700;
    color: var(--accent-red);
    letter-spacing: 0.1em;
    background: rgba(248, 81, 73, 0.1);
    padding: 0.1rem 0.35rem;
    border-radius: 3px;
  }
  .start-card-headline {
    font-family: 'DM Sans', sans-serif;
    font-size: 0.75rem;
    color: var(--text-secondary);
    line-height: 1.4;
    margin: 0 0 0.3rem;
  }
  .start-card-freshness {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.62rem;
    color: var(--text-muted);
  }

  @media (max-width: 480px) {
    .start-here { padding: 0.75rem 1rem; }
    .start-card { min-width: 180px; }
  }
</style>
```

- [ ] **Step 4: Integrate into index.astro**

In `src/pages/index.astro`, add imports at the top of the frontmatter:

```typescript
import HeroSection from '../components/static/HeroSection.astro';
import TrustStrip from '../components/static/TrustStrip.astro';
import StartHereRow from '../components/static/StartHereRow.astro';
```

After the `serializedTrackers` computation (after the `return { ... }` block and before the HTML template), add:

```typescript
// ── Hero section data ──
const now = Date.now();
const oneDayMs = 24 * 3600_000;
const updatedTodayCount = serializedTrackers.filter(t => {
  const updated = new Date(t.lastUpdated).getTime();
  return now - updated < oneDayMs;
}).length;
const weeklyEventCount = serializedTrackers.reduce((sum, t) => sum + (t.recentEventCount || 0), 0);
const breakingTracker = serializedTrackers.find(t => t.isBreaking);
const totalEvents = serializedTrackers.reduce((sum, t) => sum + (t.recentEventCount || 0), 0) * 4; // rough estimate

// ── Start Here row ──
const trendingTrackers = [...serializedTrackers]
  .filter(t => t.status === 'active')
  .sort((a, b) => {
    if (a.isBreaking && !b.isBreaking) return -1;
    if (!a.isBreaking && b.isBreaking) return 1;
    return (b.recentEventCount || 0) - (a.recentEventCount || 0);
  })
  .slice(0, 5)
  .map(t => ({
    slug: t.slug,
    shortName: t.shortName,
    icon: t.icon,
    color: t.color,
    headline: t.headline,
    lastUpdated: t.lastUpdated,
    isBreaking: t.isBreaking,
  }));
```

Then in the HTML template, add these three components **before** the CommandCenter island:

```astro
<HeroSection
  trackerCount={nonDraft.length}
  updatedTodayCount={updatedTodayCount}
  weeklyEventCount={weeklyEventCount}
  breakingHeadline={breakingTracker?.headline}
  breakingSlug={breakingTracker?.slug}
  basePath={basePath}
/>
<TrustStrip
  trackerCount={nonDraft.length}
  totalEvents={totalEvents}
  githubUrl="https://github.com/ArtemioPadilla/watchboard"
  basePath={basePath}
/>
<StartHereRow trackers={trendingTrackers} basePath={basePath} />

<div id="command-center">
```

Add a closing `</div>` after the CommandCenter island.

- [ ] **Step 5: Build and verify**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds.

Verify hero appears:
Run: `grep 'hero-tagline' dist/index.html | head -1`
Expected: Contains the tagline text.

- [ ] **Step 6: Commit**

```bash
git add src/components/static/HeroSection.astro src/components/static/TrustStrip.astro src/components/static/StartHereRow.astro src/pages/index.astro
git commit -m "feat(ux): add homepage hero section, trust strip, and trending row"
```

---

## Task 8: Replace WelcomeOverlay with Non-Blocking Toast

**Files:**
- Modify: `src/components/islands/CommandCenter/CommandCenter.tsx`

- [ ] **Step 1: Remove WelcomeOverlay and add toast**

In `src/components/islands/CommandCenter/CommandCenter.tsx`:

1. Remove the `WelcomeOverlay` import line
2. Remove the `showWelcome` state variable and its initialization
3. Remove the `<WelcomeOverlay>` JSX render block (search for `showWelcome &&`)
4. Remove imports of `isWelcomeDismissed` and `dismissWelcome` if they exist only for WelcomeOverlay

Add a toast notification after the existing onboarding logic. Add this state and effect:

```typescript
const [showToast, setShowToast] = useState(false);

useEffect(() => {
  if (!localStorage.getItem('watchboard-welcomed')) {
    setShowToast(true);
    localStorage.setItem('watchboard-welcomed', '1');
    const timer = setTimeout(() => setShowToast(false), 8000);
    return () => clearTimeout(timer);
  }
}, []);
```

Add this JSX at the end of the component's return, before the closing fragment:

```tsx
{showToast && (
  <div
    style={{
      position: 'fixed', bottom: '1.5rem', left: '50%', transform: 'translateX(-50%)',
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: '8px', padding: '0.6rem 1.2rem',
      fontFamily: "'JetBrains Mono', monospace", fontSize: '0.72rem',
      color: 'var(--text-secondary)', zIndex: 9999,
      animation: 'fadeIn 0.3s ease-out',
      cursor: 'pointer',
    }}
    onClick={() => setShowToast(false)}
    role="status"
    aria-live="polite"
  >
    Press <kbd style={{ background: 'var(--bg-secondary)', padding: '0.1rem 0.3rem', borderRadius: '3px', color: 'var(--text-primary)' }}>/</kbd> to search
    &nbsp;&middot;&nbsp;
    <kbd style={{ background: 'var(--bg-secondary)', padding: '0.1rem 0.3rem', borderRadius: '3px', color: 'var(--text-primary)' }}>B</kbd> for broadcast
    &nbsp;&middot;&nbsp;
    <kbd style={{ background: 'var(--bg-secondary)', padding: '0.1rem 0.3rem', borderRadius: '3px', color: 'var(--text-primary)' }}>?</kbd> for shortcuts
  </div>
)}
```

- [ ] **Step 2: Build and verify**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds. No references to WelcomeOverlay in output.

- [ ] **Step 3: Commit**

```bash
git add src/components/islands/CommandCenter/CommandCenter.tsx
git commit -m "feat(ux): replace WelcomeOverlay with non-blocking toast"
```

---

## Task 9: Share Button Component

**Files:**
- Create: `src/components/static/ShareButton.astro`

- [ ] **Step 1: Create the ShareButton component**

Create `src/components/static/ShareButton.astro`:

```astro
---
/**
 * Share/copy-link button — uses native share on mobile, clipboard on desktop.
 * Zero-dependency, inline script. No React island needed.
 */
interface Props {
  url: string;
  title: string;
}
const { url, title } = Astro.props;
---

<button
  class="share-btn"
  data-share-url={url}
  data-share-title={title}
  aria-label="Share this event"
  type="button"
>
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
    <polyline points="16 6 12 2 8 6"/>
    <line x1="12" y1="2" x2="12" y2="15"/>
  </svg>
  <span class="share-label">Share</span>
  <span class="share-toast" aria-live="polite"></span>
</button>

<script>
  document.querySelectorAll<HTMLButtonElement>('.share-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const url = btn.dataset.shareUrl!;
      const title = btn.dataset.shareTitle!;
      const toast = btn.querySelector('.share-toast')!;

      if (navigator.share) {
        try {
          await navigator.share({ title, url });
          return;
        } catch { /* user cancelled — fall through to clipboard */ }
      }

      try {
        await navigator.clipboard.writeText(url);
        toast.textContent = 'Link copied!';
        btn.classList.add('copied');
        setTimeout(() => {
          toast.textContent = '';
          btn.classList.remove('copied');
        }, 2000);
      } catch {
        // Clipboard API failed — show URL in prompt as last resort
        prompt('Copy this link:', url);
      }
    });
  });
</script>

<style>
  .share-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 5px;
    padding: 0.35rem 0.7rem;
    color: var(--text-muted);
    font-family: 'DM Sans', sans-serif;
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.2s;
    position: relative;
  }
  .share-btn:hover {
    border-color: var(--border-light);
    color: var(--text-secondary);
  }
  .share-btn.copied {
    border-color: var(--accent-green);
    color: var(--accent-green);
  }
  .share-toast {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.65rem;
    color: var(--accent-green);
    margin-left: 0.3rem;
  }
</style>
```

- [ ] **Step 2: Build and verify**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds. ShareButton is already used by event permalink pages (Task 2).

- [ ] **Step 3: Commit**

```bash
git add src/components/static/ShareButton.astro
git commit -m "feat(viral): add ShareButton component with native share + clipboard fallback"
```

---

## Task 10: Embed Discovery Modal

**Files:**
- Create: `src/components/static/EmbedModal.astro`
- Modify: `src/pages/[tracker]/index.astro`

- [ ] **Step 1: Create EmbedModal component**

Create `src/components/static/EmbedModal.astro`:

```astro
---
/**
 * Embed code modal — shows iframe snippet for embedding a tracker widget.
 * Uses native <dialog> element. No React island needed.
 */
interface Props {
  trackerSlug: string;
  trackerName: string;
  siteUrl?: string;
}
const { trackerSlug, trackerName, siteUrl = 'https://watchboard.dev' } = Astro.props;
const embedUrl = `${siteUrl}/embed/${trackerSlug}/`;
const snippet = `<iframe src="${embedUrl}" width="360" height="220" style="border:none;border-radius:8px;" title="${trackerName} — Watchboard"></iframe>`;
---

<button class="embed-trigger" data-embed-dialog={trackerSlug} aria-label="Embed this tracker" type="button">
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="16 18 22 12 16 6"/>
    <polyline points="8 6 2 12 8 18"/>
  </svg>
  <span>Embed</span>
</button>

<dialog class="embed-dialog" id={`embed-dialog-${trackerSlug}`}>
  <div class="embed-dialog-content">
    <div class="embed-dialog-header">
      <h3>Embed {trackerName}</h3>
      <button class="embed-close" aria-label="Close" type="button">&times;</button>
    </div>
    <p class="embed-desc">Copy this code to embed a live-updating widget on your site. ~4 KB, self-contained, auto-updates.</p>
    <div class="embed-code-block">
      <code class="embed-code">{snippet}</code>
      <button class="embed-copy" type="button" data-copy-text={snippet}>Copy</button>
    </div>
    <div class="embed-preview-label">Preview</div>
    <div class="embed-preview">
      <iframe src={embedUrl} width="360" height="220" style="border:none;border-radius:8px;" title={`${trackerName} preview`} loading="lazy"></iframe>
    </div>
  </div>
</dialog>

<script>
  // Open dialog
  document.querySelectorAll<HTMLButtonElement>('[data-embed-dialog]').forEach(btn => {
    btn.addEventListener('click', () => {
      const slug = btn.dataset.embedDialog!;
      const dialog = document.getElementById(`embed-dialog-${slug}`) as HTMLDialogElement;
      dialog?.showModal();
    });
  });
  // Close dialog
  document.querySelectorAll<HTMLButtonElement>('.embed-close').forEach(btn => {
    btn.addEventListener('click', () => {
      (btn.closest('dialog') as HTMLDialogElement)?.close();
    });
  });
  // Close on backdrop click
  document.querySelectorAll<HTMLDialogElement>('.embed-dialog').forEach(dialog => {
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) dialog.close();
    });
  });
  // Copy snippet
  document.querySelectorAll<HTMLButtonElement>('.embed-copy').forEach(btn => {
    btn.addEventListener('click', async () => {
      const text = btn.dataset.copyText!;
      await navigator.clipboard.writeText(text);
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
    });
  });
</script>

<style>
  .embed-trigger {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 5px;
    padding: 0.3rem 0.6rem;
    color: var(--text-muted);
    font-family: 'DM Sans', sans-serif;
    font-size: 0.72rem;
    cursor: pointer;
    transition: all 0.2s;
  }
  .embed-trigger:hover {
    border-color: var(--border-light);
    color: var(--text-secondary);
  }

  .embed-dialog {
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 0;
    max-width: 480px;
    width: 90vw;
    color: var(--text-primary);
  }
  .embed-dialog::backdrop { background: rgba(0, 0, 0, 0.6); }

  .embed-dialog-content { padding: 1.5rem; }
  .embed-dialog-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.75rem;
  }
  .embed-dialog-header h3 {
    font-family: 'DM Sans', sans-serif;
    font-size: 0.95rem;
    font-weight: 600;
    margin: 0;
  }
  .embed-close {
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 1.4rem;
    cursor: pointer;
    padding: 0;
    line-height: 1;
  }
  .embed-close:hover { color: var(--text-primary); }

  .embed-desc {
    font-family: 'DM Sans', sans-serif;
    font-size: 0.78rem;
    color: var(--text-secondary);
    margin-bottom: 1rem;
    line-height: 1.5;
  }
  .embed-code-block {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    background: var(--bg-primary);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.75rem;
    margin-bottom: 1rem;
  }
  .embed-code {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.68rem;
    color: var(--text-secondary);
    word-break: break-all;
    flex: 1;
    line-height: 1.5;
  }
  .embed-copy {
    background: var(--accent-blue);
    color: #fff;
    border: none;
    border-radius: 4px;
    padding: 0.3rem 0.6rem;
    font-family: 'DM Sans', sans-serif;
    font-size: 0.7rem;
    font-weight: 600;
    cursor: pointer;
    flex-shrink: 0;
    transition: opacity 0.2s;
  }
  .embed-copy:hover { opacity: 0.9; }

  .embed-preview-label {
    font-family: 'DM Sans', sans-serif;
    font-size: 0.72rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
    margin-bottom: 0.5rem;
  }
  .embed-preview {
    display: flex;
    justify-content: center;
    background: var(--bg-primary);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 1rem;
  }
</style>
```

- [ ] **Step 2: Add embed button to tracker dashboard**

In `src/pages/[tracker]/index.astro`, add the import:

```typescript
import EmbedModal from '../../components/static/EmbedModal.astro';
```

Add the `<EmbedModal>` component in the desktop layout, just before `<SourceLegend />`:

```astro
      <EmbedModal trackerSlug={config.slug} trackerName={config.shortName} />
```

- [ ] **Step 3: Build and verify**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds.

Verify:
Run: `grep 'embed-trigger' dist/iran-conflict/index.html | head -1`
Expected: Contains the embed button HTML.

- [ ] **Step 4: Commit**

```bash
git add src/components/static/EmbedModal.astro src/pages/[tracker]/index.astro
git commit -m "feat(viral): add embed discovery modal on tracker pages"
```

---

## Task 11: Daily Briefing Pages

**Files:**
- Create: `src/pages/briefing/[date].astro`
- Create: `src/pages/briefing/index.astro`

- [ ] **Step 1: Create daily briefing page**

Create `src/pages/briefing/[date].astro`:

```astro
---
/**
 * Daily briefing page — cross-tracker summary for a single day.
 * URL: /briefing/YYYY-MM-DD
 */
import BaseLayout from '../../layouts/BaseLayout.astro';
import { loadAllTrackers } from '../../lib/tracker-registry';
import { loadTrackerData } from '../../lib/data';
import { flattenTimelineEvents } from '../../lib/timeline-utils';
import { eventPermalink } from '../../lib/event-slug';
import type { FlatEvent } from '../../lib/timeline-utils';
import type { TrackerConfig } from '../../lib/tracker-config';

interface DayTrackerGroup {
  config: TrackerConfig;
  events: FlatEvent[];
  digestSummary?: string;
}

export function getStaticPaths() {
  const trackers = loadAllTrackers().filter(t => t.status !== 'draft');
  const dateMap = new Map<string, DayTrackerGroup[]>();

  for (const t of trackers) {
    let data;
    try { data = loadTrackerData(t.slug, t.eraLabel); } catch { continue; }
    const flatEvents = flattenTimelineEvents(data.timeline);
    const digestMap = new Map(data.digests.map(d => [d.date, d.summary]));

    for (const ev of flatEvents) {
      const date = ev.resolvedDate;
      if (!dateMap.has(date)) dateMap.set(date, []);
      const groups = dateMap.get(date)!;
      let group = groups.find(g => g.config.slug === t.slug);
      if (!group) {
        group = { config: t, events: [], digestSummary: digestMap.get(date) };
        groups.push(group);
      }
      group.events.push(ev);
    }
  }

  return [...dateMap.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, groups]) => ({
      params: { date },
      props: { date, groups },
    }));
}

interface Props {
  date: string;
  groups: DayTrackerGroup[];
}

const { date, groups } = Astro.props;
const base = import.meta.env.BASE_URL || '/';
const basePath = base.endsWith('/') ? base : `${base}/`;

const dateObj = new Date(date + 'T00:00:00Z');
const displayDate = dateObj.toLocaleDateString('en-US', {
  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
});

const totalEvents = groups.reduce((sum, g) => sum + g.events.length, 0);

// Compute prev/next dates from getStaticPaths (available via Astro.params context)
// We pass them as props would be complex — instead, just generate the nav links
const prevDate = new Date(dateObj.getTime() - 86400_000).toISOString().split('T')[0];
const nextDate = new Date(dateObj.getTime() + 86400_000).toISOString().split('T')[0];
---
<BaseLayout title={`Daily Briefing — ${displayDate}`} description={`${totalEvents} events across ${groups.length} trackers on ${displayDate}`}>
  <Fragment slot="head">
    <script is:inline type="application/ld+json" set:html={JSON.stringify({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Watchboard", "item": `https://watchboard.dev${basePath}` },
        { "@type": "ListItem", "position": 2, "name": "Briefings", "item": `https://watchboard.dev${basePath}briefing/` },
        { "@type": "ListItem", "position": 3, "name": displayDate },
      ],
    })} />
  </Fragment>

  <main id="main-content" class="briefing-page">
    <nav class="briefing-breadcrumb" aria-label="Breadcrumb">
      <a href={basePath}>Watchboard</a>
      <span class="sep">/</span>
      <a href={`${basePath}briefing/`}>Briefings</a>
      <span class="sep">/</span>
      <span class="current">{displayDate}</span>
    </nav>

    <header class="briefing-header">
      <h1>Daily Briefing</h1>
      <time datetime={date} class="briefing-date">{displayDate}</time>
      <p class="briefing-stats">{totalEvents} events across {groups.length} trackers</p>
    </header>

    <div class="briefing-nav">
      <a href={`${basePath}briefing/${prevDate}`} class="briefing-nav-link">&larr; Previous Day</a>
      <a href={`${basePath}briefing/${nextDate}`} class="briefing-nav-link">Next Day &rarr;</a>
    </div>

    {groups.map(group => (
      <section class="briefing-tracker-group">
        <h2 class="tracker-group-header">
          <span class="tracker-icon">{group.config.icon}</span>
          <a href={`${basePath}${group.config.slug}/`}>{group.config.shortName}</a>
          <span class="event-count">{group.events.length} events</span>
        </h2>
        {group.digestSummary && (
          <p class="tracker-digest">{group.digestSummary}</p>
        )}
        <ul class="briefing-event-list">
          {group.events.map(ev => (
            <li>
              <a href={eventPermalink(group.config.slug, ev.resolvedDate, ev.id, basePath)}>
                <span class="ev-title">{ev.title}</span>
                <span class="ev-type">{ev.type}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    ))}

    <div class="briefing-nav bottom">
      <a href={`${basePath}briefing/${prevDate}`} class="briefing-nav-link">&larr; Previous Day</a>
      <a href={`${basePath}briefing/${nextDate}`} class="briefing-nav-link">Next Day &rarr;</a>
    </div>
  </main>
</BaseLayout>

<style>
  .briefing-page {
    max-width: 800px;
    margin: 0 auto;
    padding: 2rem 1.5rem 4rem;
  }
  .briefing-breadcrumb {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.72rem;
    color: var(--text-muted);
    margin-bottom: 1.5rem;
  }
  .briefing-breadcrumb a { color: var(--text-muted); text-decoration: none; }
  .briefing-breadcrumb a:hover { color: var(--accent-blue); }
  .briefing-breadcrumb .sep { margin: 0 0.4rem; opacity: 0.4; }
  .briefing-breadcrumb .current { color: var(--text-secondary); }

  .briefing-header { margin-bottom: 1.5rem; }
  .briefing-header h1 {
    font-family: 'Cormorant Garamond', serif;
    font-size: clamp(1.4rem, 4vw, 1.8rem);
    font-weight: 700;
    color: var(--text-primary);
    margin: 0 0 0.3rem;
  }
  .briefing-date {
    font-family: 'DM Sans', sans-serif;
    font-size: 0.88rem;
    color: var(--text-secondary);
  }
  .briefing-stats {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.72rem;
    color: var(--text-muted);
    margin-top: 0.3rem;
  }

  .briefing-nav {
    display: flex;
    justify-content: space-between;
    margin-bottom: 2rem;
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--border);
  }
  .briefing-nav.bottom {
    border-bottom: none;
    border-top: 1px solid var(--border);
    margin-bottom: 0;
    margin-top: 2rem;
    padding-top: 1rem;
  }
  .briefing-nav-link {
    font-family: 'DM Sans', sans-serif;
    font-size: 0.78rem;
    color: var(--text-muted);
    text-decoration: none;
    transition: color 0.2s;
  }
  .briefing-nav-link:hover { color: var(--accent-blue); }

  .briefing-tracker-group {
    margin-bottom: 2rem;
    padding-bottom: 1.5rem;
    border-bottom: 1px solid var(--border);
  }
  .tracker-group-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-family: 'DM Sans', sans-serif;
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0 0 0.5rem;
  }
  .tracker-group-header a {
    color: var(--text-primary);
    text-decoration: none;
  }
  .tracker-group-header a:hover { color: var(--accent-blue); }
  .tracker-icon { font-size: 1.1rem; }
  .event-count {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.65rem;
    color: var(--text-muted);
    margin-left: auto;
  }
  .tracker-digest {
    font-family: 'DM Sans', sans-serif;
    font-size: 0.82rem;
    color: var(--text-secondary);
    line-height: 1.6;
    margin-bottom: 0.75rem;
  }
  .briefing-event-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .briefing-event-list li { border-bottom: 1px solid var(--border); }
  .briefing-event-list li:last-child { border-bottom: none; }
  .briefing-event-list a {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.75rem;
    padding: 0.5rem 0;
    text-decoration: none;
    transition: background 0.15s;
  }
  .briefing-event-list a:hover { background: var(--bg-card); }
  .ev-title {
    font-family: 'DM Sans', sans-serif;
    font-size: 0.82rem;
    color: var(--text-secondary);
    flex: 1;
  }
  .ev-type {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.65rem;
    color: var(--text-muted);
    text-transform: uppercase;
    flex-shrink: 0;
  }

  @media (max-width: 640px) {
    .briefing-page { padding: 1.5rem 1rem 3rem; }
  }
</style>
```

- [ ] **Step 2: Create briefing index page**

Create `src/pages/briefing/index.astro`:

```astro
---
/**
 * Briefing index — calendar-style list of available daily briefings.
 */
import BaseLayout from '../../layouts/BaseLayout.astro';
import { loadAllTrackers } from '../../lib/tracker-registry';
import { loadTrackerData } from '../../lib/data';
import { flattenTimelineEvents } from '../../lib/timeline-utils';

const trackers = loadAllTrackers().filter(t => t.status !== 'draft');
const base = import.meta.env.BASE_URL || '/';
const basePath = base.endsWith('/') ? base : `${base}/`;

// Collect all dates with event counts
const dateCountMap = new Map<string, { events: number; trackers: Set<string> }>();
for (const t of trackers) {
  let data;
  try { data = loadTrackerData(t.slug, t.eraLabel); } catch { continue; }
  const flatEvents = flattenTimelineEvents(data.timeline);
  for (const ev of flatEvents) {
    if (!dateCountMap.has(ev.resolvedDate)) {
      dateCountMap.set(ev.resolvedDate, { events: 0, trackers: new Set() });
    }
    const entry = dateCountMap.get(ev.resolvedDate)!;
    entry.events++;
    entry.trackers.add(t.slug);
  }
}

const sortedDates = [...dateCountMap.entries()]
  .sort(([a], [b]) => b.localeCompare(a))
  .slice(0, 90); // last 90 days of briefings
---
<BaseLayout title="Daily Briefings — Watchboard" description="Cross-tracker daily briefings covering global events.">
  <main id="main-content" class="briefing-index">
    <a class="back-link" href={basePath}>&larr; Watchboard</a>
    <h1>Daily Briefings</h1>
    <p class="index-desc">Cross-tracker summaries of global events, updated daily.</p>

    <div class="date-list">
      {sortedDates.map(([date, info]) => {
        const dateObj = new Date(date + 'T00:00:00Z');
        const display = dateObj.toLocaleDateString('en-US', {
          weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC',
        });
        return (
          <a href={`${basePath}briefing/${date}`} class="date-item">
            <span class="date-label">{display}</span>
            <span class="date-stats">
              {info.events} events &middot; {info.trackers.size} trackers
            </span>
          </a>
        );
      })}
    </div>
  </main>
</BaseLayout>

<style>
  .briefing-index {
    max-width: 700px;
    margin: 0 auto;
    padding: 2rem 1.5rem 4rem;
  }
  .back-link {
    display: inline-block;
    margin-bottom: 1.5rem;
    color: var(--text-muted);
    text-decoration: none;
    font-family: 'DM Sans', sans-serif;
    font-size: 0.82rem;
    border: 1px solid var(--border);
    padding: 0.3rem 0.7rem;
    border-radius: 5px;
    transition: all 0.2s;
  }
  .back-link:hover { color: var(--text-primary); border-color: var(--border-light); }
  .briefing-index h1 {
    font-family: 'Cormorant Garamond', serif;
    font-size: clamp(1.4rem, 4vw, 1.8rem);
    font-weight: 700;
    color: var(--text-primary);
    margin: 0 0 0.3rem;
  }
  .index-desc {
    font-family: 'DM Sans', sans-serif;
    font-size: 0.85rem;
    color: var(--text-secondary);
    margin-bottom: 2rem;
  }
  .date-list { display: flex; flex-direction: column; }
  .date-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.6rem 0.5rem;
    border-bottom: 1px solid var(--border);
    text-decoration: none;
    transition: background 0.15s;
  }
  .date-item:hover { background: var(--bg-card); }
  .date-label {
    font-family: 'DM Sans', sans-serif;
    font-size: 0.85rem;
    color: var(--text-secondary);
  }
  .date-stats {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.68rem;
    color: var(--text-muted);
  }
</style>
```

- [ ] **Step 3: Build and verify**

Run: `npm run build 2>&1 | tail -10`
Expected: Build succeeds. Briefing pages generated under `dist/briefing/`.

Verify:
Run: `ls dist/briefing/ | head -10`
Expected: Date directories and an `index.html`.

- [ ] **Step 4: Commit**

```bash
git add src/pages/briefing/
git commit -m "feat(seo): add daily briefing pages with cross-tracker summaries"
```

---

## Task 12: FAQ Schema on Tracker Pages

**Files:**
- Modify: `src/pages/[tracker]/index.astro`

- [ ] **Step 1: Add FAQ schema and intro section**

In `src/pages/[tracker]/index.astro`, add this to the frontmatter after the `statusLabel` computation:

```typescript
// ── SEO: tracker intro + FAQ schema ──
const siteUrl = import.meta.env.SITE || 'https://watchboard.dev';
const pageUrl = `${siteUrl}${basePath}${config.slug}/`;
const eventCount = flatEvents.length;
const latestDigest = data.digests[0];

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": `What is the ${config.name}?`,
      "acceptedAnswer": { "@type": "Answer", "text": config.description },
    },
    {
      "@type": "Question",
      "name": `How often is this tracker updated?`,
      "acceptedAnswer": { "@type": "Answer", "text": `This tracker is updated every ${config.updateIntervalDays || 1} day(s) via automated AI research across Tier 1-4 sources.` },
    },
    {
      "@type": "Question",
      "name": `How many events are tracked?`,
      "acceptedAnswer": { "@type": "Answer", "text": `${eventCount} events have been tracked since ${config.startDate}, with daily updates adding new developments.` },
    },
  ],
};
```

Add the FAQ schema and intro to the HTML. In the `<BaseLayout>` opening tag area, add a head slot:

```astro
  <Fragment slot="head">
    <script is:inline type="application/ld+json" set:html={JSON.stringify(faqSchema)} />
  </Fragment>
```

Add a brief intro section inside `<main>`, right after the Header and before `<HeroKpiCombo>`:

```astro
      <!-- SEO intro section (visible to crawlers, compact for users) -->
      <div class="tracker-intro">
        <p>{config.description}</p>
        {latestDigest && (
          <p class="tracker-latest-update">Latest: {latestDigest.summary?.slice(0, 150)}{(latestDigest.summary?.length ?? 0) > 150 ? '...' : ''}</p>
        )}
        <span class="tracker-meta-line">
          Last updated {data.meta.lastUpdated ? new Date(data.meta.lastUpdated).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'recently'}
          &middot; {eventCount} events tracked since {config.startDate}
        </span>
      </div>
```

Add styles:

```css
  .tracker-intro {
    max-width: 900px;
    margin: 0 auto;
    padding: 0.75rem 1rem;
  }
  .tracker-intro p {
    font-family: 'DM Sans', sans-serif;
    font-size: 0.82rem;
    color: var(--text-secondary);
    line-height: 1.6;
    margin: 0 0 0.3rem;
  }
  .tracker-latest-update {
    font-style: italic;
    opacity: 0.8;
  }
  .tracker-meta-line {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.65rem;
    color: var(--text-muted);
  }
```

- [ ] **Step 2: Build and verify**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds.

Verify FAQ schema:
Run: `grep -o 'FAQPage' dist/iran-conflict/index.html | head -1`
Expected: `FAQPage`

- [ ] **Step 3: Commit**

```bash
git add src/pages/[tracker]/index.astro
git commit -m "feat(seo): add FAQ schema and intro section to tracker pages"
```

---

## Task 13: Email Signup Form (Buttondown)

**Files:**
- Modify: `src/components/static/HeroSection.astro`
- Modify: `src/components/static/Footer.astro` (for tracker pages)

- [ ] **Step 1: Add email signup to HeroSection**

In `src/components/static/HeroSection.astro`, add an email form below the CTAs inside `hero-content`:

```astro
    <form
      action="https://buttondown.com/api/emails/embed-subscribe/watchboard"
      method="post"
      target="popupwindow"
      class="hero-email-form"
    >
      <input type="email" name="email" placeholder="Get the daily briefing — enter your email" required aria-label="Email address" class="email-input" />
      <button type="submit" class="email-submit">Subscribe</button>
    </form>
```

Add styles:

```css
  .hero-email-form {
    display: flex;
    gap: 0.5rem;
    justify-content: center;
    margin-top: 1rem;
    max-width: 420px;
    margin-left: auto;
    margin-right: auto;
  }
  .email-input {
    flex: 1;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.5rem 0.75rem;
    color: var(--text-primary);
    font-family: 'DM Sans', sans-serif;
    font-size: 0.78rem;
  }
  .email-input::placeholder { color: var(--text-muted); }
  .email-input:focus { outline: none; border-color: var(--accent-blue); }
  .email-submit {
    background: var(--accent-green);
    color: #ffffff;
    border: none;
    border-radius: 6px;
    padding: 0.5rem 1rem;
    font-family: 'DM Sans', sans-serif;
    font-size: 0.78rem;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.2s;
    flex-shrink: 0;
  }
  .email-submit:hover { opacity: 0.9; }
```

**Note:** Replace `watchboard` in the Buttondown URL with the actual Buttondown username once the account is created. This can be a placeholder initially.

- [ ] **Step 2: Build and verify**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds. Form appears in homepage HTML.

- [ ] **Step 3: Commit**

```bash
git add src/components/static/HeroSection.astro
git commit -m "feat(viral): add email digest signup form to homepage hero"
```

---

## Task 14: Final Build Verification

**Files:** None (verification only)

- [ ] **Step 1: Full build**

Run: `npm run build 2>&1 | tail -30`
Expected: Build succeeds with no errors. All new pages generated.

- [ ] **Step 2: Verify page counts**

Run: `find dist -name 'index.html' | wc -l`
Expected: Significantly more pages than before (event permalinks + briefings added).

- [ ] **Step 3: Spot-check key pages**

Run: `grep 'NewsArticle' dist/iran-conflict/events/*/index.html | head -3`
Expected: NewsArticle schema present on event pages.

Run: `grep 'hero-tagline' dist/index.html | head -1`
Expected: Hero section present on homepage.

Run: `grep 'FAQPage' dist/iran-conflict/index.html | head -1`
Expected: FAQ schema present on tracker pages.

Run: `cat dist/sitemap-news.xml | head -10`
Expected: Valid news sitemap XML.

- [ ] **Step 4: Commit any remaining changes**

```bash
git status
# If any unstaged files, add and commit
git add -A
git commit -m "feat: complete growth engine implementation — SEO + front door + viral mechanics"
```

---

## Follow-Up Tasks (Not in This Plan)

These items from the spec are deferred because they depend on external setup or are lower priority:

1. **Social pipeline enhancement** (`scripts/generate-social-queue.ts`, `scripts/post-social-queue.ts`) — Modify breaking tweets to link to event permalinks instead of dashboard URLs, and upload per-event OG images as media attachments. Requires the social pipeline to be actively posting.

2. **Buttondown account setup** — Create the Buttondown account and update the form action URL in `HeroSection.astro`. Then configure RSS-to-email pointing at `/rss.xml`.

3. **Build time monitoring** — After deploying, monitor build times. If event permalink + OG image generation exceeds acceptable limits, add content-hash caching for satori or limit OG generation to events from the last 90 days.
