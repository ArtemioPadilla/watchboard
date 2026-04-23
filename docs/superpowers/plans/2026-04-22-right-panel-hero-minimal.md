# Right Panel — Hero + Minimal Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the decoration-heavy tracker list in the homepage sidebar with a two-part layout — one editorial hero card on top (static, highest-relevance tracker) and a minimal two-line feed below. Drop tier chips, colored borders, freshness dots, and group-header labels; tabs become inline text-only with an underline indicator.

**Architecture:** Small-scoped migration. One new pure helper (`selectHeroTracker`), two new components (`HeroCard`, `FeedRow`), a restyled `ViewModeToggle`, and a rewritten body in `SidebarPanel`. No change to broadcast state flow, search logic, or the expanded active-tracker row.

**Tech Stack:** Astro 5 + React 19 islands, TypeScript, CSS. Vitest for the hero-selection pure function. No React Testing Library — UI verified via Playwright (existing `/tmp/verify_final.py` pattern).

**Spec:** `docs/superpowers/specs/2026-04-22-right-panel-hero-minimal-design.md`

---

## File Structure

**Create:**
- `src/lib/hero-selection.ts` — `selectHeroTracker` pure function
- `src/lib/hero-selection.test.ts` — Vitest tests
- `src/components/islands/CommandCenter/HeroCard.tsx` — top hero component
- `src/components/islands/CommandCenter/FeedRow.tsx` — minimal two-line row

**Modify:**
- `src/components/islands/CommandCenter/ViewModeToggle.tsx` — restyle to inline underline tabs
- `src/components/islands/CommandCenter/SidebarPanel.tsx` — replace collapsed-row rendering with `FeedRow`, insert hero above the list, drop `RecentEventsFeed` + group headers + sort dropdown + domain-mode tab row
- `src/styles/global.css` — add `.cc-hero-card`, `.cc-feed-row`, `.cc-feed-tabs` rules; update the PR #106 `.cc-tracker-live` pulse selector to also target `.cc-feed-row.cc-tracker-live`

**Leave alone:**
- `src/lib/relevance.ts` — `sortByRelevance` used as-is
- `src/components/islands/CommandCenter/GeoAccordion.tsx` — reused unchanged in GEO view
- `src/components/islands/CommandCenter/CommandCenter.tsx` — no changes; `featuredSlug` prop already wired

---

## Task 1: `selectHeroTracker` pure helper + tests

**Files:**
- Create: `src/lib/hero-selection.ts`
- Create: `src/lib/hero-selection.test.ts`

- [ ] **Step 1.1: Write the failing tests**

Create `src/lib/hero-selection.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { selectHeroTracker } from './hero-selection';
import type { TrackerCardData } from './tracker-directory-utils';

function makeTracker(overrides: Partial<TrackerCardData> & { slug: string }): TrackerCardData {
  return {
    slug: overrides.slug,
    shortName: overrides.shortName ?? overrides.slug,
    name: overrides.name ?? overrides.slug,
    description: '',
    icon: '',
    color: '#3498db',
    status: 'active',
    temporal: 'live',
    domain: 'conflict',
    region: 'global',
    startDate: '2024-01-01',
    sections: [],
    dayCount: 0,
    lastUpdated: '2026-04-22T00:00:00Z',
    topKpis: [],
    headline: 'Default headline',
    latestEventMedia: { url: 'https://example.com/a.jpg', source: 'Src', tier: 1 },
    eventImages: [],
    isBreaking: false,
    recentEventCount: 0,
    avgSourceTier: 2,
    sectionsUpdatedCount: 0,
    ...(overrides as TrackerCardData),
  } as TrackerCardData;
}

describe('selectHeroTracker', () => {
  it('returns null when the list is empty', () => {
    expect(selectHeroTracker([], [])).toBeNull();
  });

  it('returns null when no tracker has a headline', () => {
    const trackers = [
      makeTracker({ slug: 'a', headline: undefined }),
      makeTracker({ slug: 'b', headline: '' }),
    ];
    expect(selectHeroTracker(trackers, [])).toBeNull();
  });

  it('excludes trackers with no media and empty eventImages', () => {
    const trackers = [
      makeTracker({ slug: 'no-media', latestEventMedia: undefined, eventImages: [] }),
      makeTracker({ slug: 'has-media', latestEventMedia: { url: 'x', source: 's', tier: 1 } }),
    ];
    expect(selectHeroTracker(trackers, [])?.slug).toBe('has-media');
  });

  it('accepts trackers with eventImages even if latestEventMedia is missing', () => {
    const trackers = [
      makeTracker({
        slug: 'by-events',
        latestEventMedia: undefined,
        eventImages: [{ url: 'x', source: 's', tier: 1 }],
      }),
    ];
    expect(selectHeroTracker(trackers, [])?.slug).toBe('by-events');
  });

  it('excludes archived trackers', () => {
    const trackers = [
      makeTracker({ slug: 'archived', status: 'archived' }),
      makeTracker({ slug: 'active' }),
    ];
    expect(selectHeroTracker(trackers, [])?.slug).toBe('active');
  });

  it('prefers breaking > followed > editorial > recency', () => {
    const trackers = [
      makeTracker({
        slug: 'breaking',
        isBreaking: true,
        lastUpdated: '2026-04-01T00:00:00Z',
      }),
      makeTracker({
        slug: 'followed',
        isBreaking: false,
        lastUpdated: '2026-04-22T00:00:00Z',
      }),
    ];
    expect(selectHeroTracker(trackers, ['followed'])?.slug).toBe('breaking');
  });

  it('returns the followed tracker when nothing is breaking', () => {
    const trackers = [
      makeTracker({ slug: 'a' }),
      makeTracker({ slug: 'b' }),
    ];
    expect(selectHeroTracker(trackers, ['b'])?.slug).toBe('b');
  });

  it('is stable — same input, same output', () => {
    const trackers = [
      makeTracker({ slug: 'x', recentEventCount: 5 }),
      makeTracker({ slug: 'y', recentEventCount: 2 }),
    ];
    const a = selectHeroTracker(trackers, []);
    const b = selectHeroTracker(trackers, []);
    expect(a?.slug).toBe(b?.slug);
  });
});
```

- [ ] **Step 1.2: Run tests — confirm they fail**

Run: `npm test -- --run src/lib/hero-selection.test.ts`

Expected: FAIL with "Cannot find module './hero-selection'".

- [ ] **Step 1.3: Implement the pure function**

Create `src/lib/hero-selection.ts`:

```ts
import type { TrackerCardData } from './tracker-directory-utils';
import { sortByRelevance } from './relevance';

/**
 * Pick the hero tracker for the sidebar: the highest-relevance active tracker
 * that has a headline and at least one usable image. Returns null if none qualify.
 *
 * Stable for a given (trackers, followedSlugs) pair.
 */
export function selectHeroTracker(
  trackers: TrackerCardData[],
  followedSlugs: string[],
): TrackerCardData | null {
  const eligible = trackers.filter(t =>
    t.status === 'active' &&
    typeof t.headline === 'string' &&
    t.headline.length > 0 &&
    (t.latestEventMedia != null || (t.eventImages?.length ?? 0) > 0)
  );
  if (eligible.length === 0) return null;
  const sorted = sortByRelevance(eligible, followedSlugs);
  return sorted[0] ?? null;
}
```

- [ ] **Step 1.4: Run tests — confirm they pass**

Run: `npm test -- --run src/lib/hero-selection.test.ts`

Expected: PASS — all 8 tests.

- [ ] **Step 1.5: Commit**

```bash
git add src/lib/hero-selection.ts src/lib/hero-selection.test.ts
git commit -m "feat(home): add selectHeroTracker pure helper

Picks the highest-relevance active tracker with a headline and
image to feature in the sidebar hero card. Reuses the existing
sortByRelevance scoring. Stable for a given (trackers, follows)
pair — broadcast cycling does not change the hero."
```

---

## Task 2: `HeroCard` component + CSS

**Files:**
- Create: `src/components/islands/CommandCenter/HeroCard.tsx`
- Modify: `src/styles/global.css` (append)

- [ ] **Step 2.1: Write the component**

Create `src/components/islands/CommandCenter/HeroCard.tsx`:

```tsx
import { memo } from 'react';
import type { TrackerCardData } from '../../../lib/tracker-directory-utils';
import { relativeTime } from '../../../lib/event-utils';
import { t, type Locale } from '../../../i18n/translations';

const DOMAIN_GRADIENTS: Record<string, string> = {
  military: 'linear-gradient(135deg, #1a0a0a, #2c1010, #0d1117)',
  conflict: 'linear-gradient(135deg, #1a0a0a, #2c1010, #0d1117)',
  politics: 'linear-gradient(135deg, #0a0a1a, #101030, #0d1117)',
  sports: 'linear-gradient(135deg, #0a1a0a, #102010, #0d1117)',
  crisis: 'linear-gradient(135deg, #1a0f00, #2c1a05, #0d1117)',
  culture: 'linear-gradient(135deg, #1a0a1a, #2c102c, #0d1117)',
  default: 'linear-gradient(135deg, #12141a, #181b23, #0d1117)',
};

interface Props {
  tracker: TrackerCardData;
  isBroadcastFeatured: boolean;
  basePath: string;
  locale: Locale;
  onSelect: (slug: string) => void;
}

export default memo(function HeroCard({
  tracker,
  isBroadcastFeatured,
  basePath: _basePath,
  locale,
  onSelect,
}: Props) {
  const thumbUrl = tracker.latestEventMedia?.url ?? tracker.eventImages?.[0]?.url ?? null;
  const gradient = DOMAIN_GRADIENTS[tracker.domain ?? 'default'] ?? DOMAIN_GRADIENTS.default;
  const headline = (locale === 'es' && tracker.headlineEs) ? tracker.headlineEs : tracker.headline;
  const source = tracker.latestEventMedia?.source;
  const tier = tracker.latestEventMedia?.tier;

  const handleClick = () => onSelect(tracker.slug);
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(tracker.slug);
    }
  };

  return (
    <div
      className={`cc-hero-card${isBroadcastFeatured ? ' cc-hero-card-live' : ''}`}
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-label={`Open ${tracker.shortName} dashboard`}
    >
      <div
        className="cc-hero-thumb"
        style={thumbUrl ? undefined : { background: gradient }}
      >
        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <span className="cc-hero-thumb-icon">{tracker.icon ?? '?'}</span>
        )}
      </div>
      <div className="cc-hero-body">
        <div className="cc-hero-context">
          {tracker.dayCount > 0 && `${t('hero.day', locale)} ${tracker.dayCount} · `}
          {(tracker.domain ?? '').toUpperCase()}
        </div>
        <div className="cc-hero-name-row">
          <span className="cc-hero-name">{tracker.shortName}</span>
          {isBroadcastFeatured && (
            <span className="cc-hero-live" role="status" aria-label="Currently featured by broadcast">
              <span className="cc-hero-live-dot" />LIVE
            </span>
          )}
        </div>
        {headline && <div className="cc-hero-headline">{headline}</div>}
        <div className="cc-hero-meta">
          {source && tier != null && (
            <span className="cc-hero-source">T{tier} · {source}</span>
          )}
          <span className="cc-hero-time" suppressHydrationWarning>
            {relativeTime(tracker.lastUpdated).toUpperCase()}
          </span>
        </div>
      </div>
    </div>
  );
});
```

- [ ] **Step 2.2: Append CSS to `global.css`**

Add to the end of `/Users/artemiopadilla/Documents/repos/GitHub/personal/watchboard/src/styles/global.css`:

```css
/* ─── Sidebar Hero Card ─── */
.cc-hero-card {
  display: flex;
  gap: 12px;
  padding: 14px;
  margin: 8px 10px 4px;
  background: var(--bg-card, #181b23);
  border: 1px solid var(--border, #2a2d3a);
  border-radius: 8px;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.cc-hero-card:hover {
  border-color: var(--accent-blue, #58a6ff);
  background: var(--bg-card-hover, #1e2130);
}
.cc-hero-card:focus-visible {
  outline: 2px solid var(--accent-blue);
  outline-offset: 2px;
}
.cc-hero-card.cc-hero-card-live {
  border-color: rgba(46, 204, 113, 0.35);
}

.cc-hero-thumb {
  width: 96px;
  height: 96px;
  border-radius: 6px;
  flex-shrink: 0;
  overflow: hidden;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}
.cc-hero-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.cc-hero-thumb-icon {
  font-size: 42px;
  opacity: 0.7;
}

.cc-hero-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.cc-hero-context {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.5rem;
  letter-spacing: 0.15em;
  color: var(--text-muted, #8b8fa2);
  text-transform: uppercase;
}
.cc-hero-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.cc-hero-name {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--text-primary, #e8e9ed);
  text-transform: uppercase;
}
.cc-hero-live {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 5px;
  background: rgba(46, 204, 113, 0.15);
  border: 1px solid rgba(46, 204, 113, 0.4);
  border-radius: 3px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.45rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: #3fb950;
}
.cc-hero-live-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #3fb950;
  animation: ccLivePulse 1.6s ease-in-out infinite;
}
.cc-hero-headline {
  font-family: 'Inter', 'DM Sans', sans-serif;
  font-size: 0.82rem;
  font-weight: 500;
  line-height: 1.35;
  color: var(--text-primary, #e8e9ed);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-top: 2px;
}
.cc-hero-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 4px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.5rem;
  letter-spacing: 0.08em;
  color: var(--text-muted, #8b8fa2);
  text-transform: uppercase;
}

/* Mid-width (768-1279px): smaller thumb */
@media (min-width: 768px) and (max-width: 1279px) {
  .cc-hero-thumb { width: 64px; height: 64px; }
  .cc-hero-thumb-icon { font-size: 30px; }
  .cc-hero-headline { font-size: 0.74rem; -webkit-line-clamp: 2; }
}
```

- [ ] **Step 2.3: Add i18n key for hero**

Open `/Users/artemiopadilla/Documents/repos/GitHub/personal/watchboard/src/i18n/translations.ts` and add a `hero.day` entry.

Find the English block (search for `"cc.day"` or similar short keys near the top of the `en` translations). Add:

```ts
'hero.day': 'DAY',
```

Mirror it in `es`, `fr`, `pt` blocks (same key, same value — "DAY" is a common-enough English term that the untranslated fallback is acceptable; if you prefer localized, use "DÍA" / "JOUR" / "DIA").

- [ ] **Step 2.4: Build check**

Run: `npm run build 2>&1 | tail -10`

Expected: TypeScript compiles. Pre-existing Zod/data errors may remain — those are unrelated.

- [ ] **Step 2.5: Commit**

```bash
git add src/components/islands/CommandCenter/HeroCard.tsx src/styles/global.css src/i18n/translations.ts
git commit -m "feat(home): add HeroCard component + CSS

Editorial hero card for the sidebar top. Shows thumbnail, day/domain
context line, tracker shortName (with LIVE pulse when broadcast-
featured), headline (3-line clamp), and a T{tier} · source · time
meta footer. Click or Enter/Space opens the tracker dashboard.
Responsive thumb size at 768-1279px."
```

---

## Task 3: `FeedRow` component + CSS

**Files:**
- Create: `src/components/islands/CommandCenter/FeedRow.tsx`
- Modify: `src/styles/global.css` (append + update existing `.cc-tracker-live` rule)

- [ ] **Step 3.1: Write the component**

Create `src/components/islands/CommandCenter/FeedRow.tsx`:

```tsx
import { memo, useRef, useEffect } from 'react';
import type { TrackerCardData } from '../../../lib/tracker-directory-utils';
import { relativeTime } from '../../../lib/event-utils';
import { t, type Locale } from '../../../i18n/translations';

interface Props {
  tracker: TrackerCardData;
  isHovered: boolean;
  isFollowed: boolean;
  isCompared: boolean;
  isLive: boolean;
  isDimmed: boolean;
  basePath: string;
  locale: Locale;
  onSelect: (slug: string | null) => void;
  onHover: (slug: string | null) => void;
  onToggleFollow: (slug: string) => void;
  onToggleCompare: (slug: string) => void;
}

export default memo(function FeedRow({
  tracker,
  isHovered,
  isFollowed,
  isCompared,
  isLive,
  isDimmed,
  basePath: _basePath,
  locale,
  onSelect,
  onHover,
  onToggleFollow,
  onToggleCompare,
}: Props) {
  const rowRef = useRef<HTMLDivElement>(null);

  // Auto-scroll into view when hovered (mirrors old TrackerRow behavior)
  useEffect(() => {
    if (isHovered && rowRef.current) {
      rowRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [isHovered]);

  const headline = (locale === 'es' && tracker.headlineEs) ? tracker.headlineEs : tracker.headline;

  return (
    <div
      ref={rowRef}
      className={`cc-feed-row${isLive ? ' cc-tracker-live' : ''}${isDimmed ? ' cc-feed-row-dim' : ''}`}
      data-tracker-slug={tracker.slug}
      onClick={(e) => {
        if (e.shiftKey) {
          onToggleCompare(tracker.slug);
        } else {
          onSelect(tracker.slug);
        }
      }}
      onMouseEnter={() => onHover(tracker.slug)}
      onMouseLeave={() => onHover(null)}
      title={tracker.shortName}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onSelect(tracker.slug);
        }
      }}
    >
      <span className="cc-feed-icon">{tracker.icon ?? ''}</span>
      <div className="cc-feed-body">
        <div className="cc-feed-top">
          <span className="cc-feed-name">{tracker.shortName}</span>
          {isLive && <span className="cc-feed-live-dot" role="status" aria-label="Live" />}
        </div>
        {headline && <div className="cc-feed-headline">{headline}</div>}
      </div>
      <div className="cc-feed-right">
        <span className="cc-feed-time" suppressHydrationWarning>
          {relativeTime(tracker.lastUpdated)}
        </span>
        <div className="cc-feed-actions">
          <button
            type="button"
            className={`cc-feed-action cc-feed-follow${isFollowed ? ' is-on' : ''}`}
            onClick={(e) => { e.stopPropagation(); onToggleFollow(tracker.slug); }}
            title={isFollowed ? t('sidebar.unfollow', locale) : t('sidebar.follow', locale)}
            aria-label={isFollowed ? t('sidebar.unfollow', locale) : t('sidebar.follow', locale)}
          >
            {isFollowed ? '★' : '☆'}
          </button>
          <button
            type="button"
            className={`cc-feed-action cc-feed-compare${isCompared ? ' is-on' : ''}`}
            onClick={(e) => { e.stopPropagation(); onToggleCompare(tracker.slug); }}
            title={isCompared ? t('sidebar.removeFromComparison', locale) : t('sidebar.addToComparison', locale)}
            aria-label={isCompared ? t('sidebar.removeFromComparison', locale) : t('sidebar.addToComparison', locale)}
          >
            {isCompared ? '◆' : '◇'}
          </button>
        </div>
      </div>
    </div>
  );
});
```

- [ ] **Step 3.2: Append feed-row CSS + update PR #106 live pulse selector**

First, find the PR #106 live pulse rule in `global.css` (search for `.cc-tracker-row.cc-tracker-live`). It should look like:

```css
.cc-tracker-row.cc-tracker-live,
.cc-tracker-expanded.cc-tracker-live {
  animation: ccLivePulse 2s ease-in-out infinite;
}
```

Replace that selector with:

```css
.cc-feed-row.cc-tracker-live,
.cc-tracker-expanded.cc-tracker-live {
  animation: none; /* the inline live-dot pulses on its own; avoid pulsing the whole row */
}
```

Rationale: the old pulsing `box-shadow` on the entire row was flagged in PR #106's code review as a potential paint-cost hotspot on low-end devices. The feed row uses a dedicated `.cc-feed-live-dot` pseudo-element instead. We keep the selector for the expanded row case (existing) but disable the row-level pulse in the new design.

Now append at the end of the file:

```css
/* ─── Sidebar Feed Row ─── */
.cc-feed-row {
  display: grid;
  grid-template-columns: 22px 1fr auto;
  gap: 4px 10px;
  padding: 8px 12px;
  cursor: pointer;
  transition: background 0.15s ease, opacity 0.2s ease;
  align-items: start;
  border-left: 2px solid transparent;
}
.cc-feed-row:hover {
  background: var(--bg-card-hover, #1e2130);
}
.cc-feed-row:focus-visible {
  outline: 2px solid var(--accent-blue);
  outline-offset: -2px;
}
.cc-feed-row.cc-tracker-live {
  border-left-color: #3fb950;
}
.cc-feed-row.cc-feed-row-dim .cc-feed-icon,
.cc-feed-row.cc-feed-row-dim .cc-feed-name {
  opacity: 0.55;
}
.cc-feed-row.cc-feed-row-dim .cc-feed-headline {
  opacity: 0.45;
}

.cc-feed-icon {
  font-size: 1rem;
  line-height: 1.2;
  grid-row: 1 / span 2;
  align-self: center;
  text-align: center;
}

.cc-feed-body {
  min-width: 0;
}
.cc-feed-top {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-bottom: 2px;
}
.cc-feed-name {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--text-primary, #e8e9ed);
  text-transform: uppercase;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cc-feed-live-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #3fb950;
  box-shadow: 0 0 6px rgba(46, 204, 113, 0.6);
  animation: ccLivePulse 1.6s ease-in-out infinite;
  flex-shrink: 0;
}
.cc-feed-headline {
  font-family: 'Inter', 'DM Sans', sans-serif;
  font-size: 0.66rem;
  line-height: 1.3;
  color: var(--text-secondary, #9498a8);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cc-feed-right {
  grid-row: 1 / span 2;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: center;
  gap: 4px;
  flex-shrink: 0;
}
.cc-feed-time {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.5rem;
  letter-spacing: 0.04em;
  color: var(--text-muted, #8b8fa2);
}
.cc-feed-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s ease;
}
.cc-feed-row:hover .cc-feed-actions {
  opacity: 1;
}
.cc-feed-action {
  background: none;
  border: none;
  cursor: pointer;
  padding: 0 3px;
  font-size: 0.6rem;
  color: var(--text-muted, #8b8fa2);
  line-height: 1;
}
.cc-feed-action.is-on {
  opacity: 1;
  color: #f39c12;
}
.cc-feed-compare.is-on {
  color: var(--accent-blue, #58a6ff);
}
.cc-feed-follow:hover,
.cc-feed-compare:hover {
  color: var(--text-primary, #e8e9ed);
}

/* Follow star stays visible when followed, even without hover */
.cc-feed-row .cc-feed-follow.is-on {
  opacity: 1;
}
.cc-feed-row:not(:hover) .cc-feed-actions:has(.is-on) {
  opacity: 1;
}
```

- [ ] **Step 3.3: Build check**

Run: `npm run build 2>&1 | tail -10`

Expected: TypeScript compiles.

- [ ] **Step 3.4: Commit**

```bash
git add src/components/islands/CommandCenter/FeedRow.tsx src/styles/global.css
git commit -m "feat(home): add FeedRow component

Two-line minimal row: icon + UPPERCASE name + truncated headline +
relative time. Follow/compare buttons fade in on hover (or stay on
when toggled). LIVE pulse shows as a small green dot + left-edge
accent for the broadcast-featured tracker. Older-than-48h rows
dim via the cc-feed-row-dim modifier. Update PR #106 selector
target to .cc-feed-row; disable row-level box-shadow pulse
(replaced by the inline live dot) per prior review feedback."
```

---

## Task 4: Restyle `ViewModeToggle` to inline underline tabs

**Files:**
- Modify: `src/components/islands/CommandCenter/ViewModeToggle.tsx`
- Modify: `src/styles/global.css`

- [ ] **Step 4.1: Rewrite ViewModeToggle to a class-based underline layout**

Open `src/components/islands/CommandCenter/ViewModeToggle.tsx` and replace the entire file content with:

```tsx
import { memo } from 'react';

export type ViewMode = 'operations' | 'geographic' | 'domain';

interface Props {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
}

const MODES: { id: ViewMode; label: string }[] = [
  { id: 'operations', label: 'OPS' },
  { id: 'geographic', label: 'GEO' },
  { id: 'domain', label: 'DOMAIN' },
];

export default memo(function ViewModeToggle({ mode, onChange }: Props) {
  return (
    <div className="cc-feed-tabs" role="tablist" aria-label="Tracker list view">
      {MODES.map(m => (
        <button
          key={m.id}
          type="button"
          role="tab"
          aria-selected={mode === m.id}
          className={`cc-feed-tab${mode === m.id ? ' is-active' : ''}`}
          onClick={() => onChange(m.id)}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
});
```

- [ ] **Step 4.2: Append tab CSS to `global.css`**

Append:

```css
/* ─── Sidebar Inline Tabs ─── */
.cc-feed-tabs {
  display: flex;
  gap: 0;
  padding: 0 12px;
  border-bottom: 1px solid var(--border, #2a2d3a);
  margin-bottom: 4px;
}
.cc-feed-tab {
  background: none;
  border: none;
  padding: 8px 10px 6px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.55rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  color: var(--text-muted, #8b8fa2);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px; /* overlap the container's bottom border */
  transition: color 0.15s ease, border-color 0.15s ease;
}
.cc-feed-tab:hover {
  color: var(--text-primary, #e8e9ed);
}
.cc-feed-tab.is-active {
  color: var(--accent-blue, #58a6ff);
  border-bottom-color: var(--accent-blue, #58a6ff);
}
.cc-feed-tab:focus-visible {
  outline: 2px solid var(--accent-blue);
  outline-offset: 2px;
}
```

- [ ] **Step 4.3: Build check**

Run: `npm run build 2>&1 | tail -10`

Expected: TypeScript compiles (file imports are simpler now, no inline styles).

- [ ] **Step 4.4: Commit**

```bash
git add src/components/islands/CommandCenter/ViewModeToggle.tsx src/styles/global.css
git commit -m "style(home): inline underline tabs for ViewModeToggle

Drop the pill/chip styling; tabs are now text-only (OPS / GEO /
DOMAIN) with an underline indicator under the active tab, sitting
directly above the feed list. Accessible via role=tablist /
role=tab with aria-selected."
```

---

## Task 5: Rewrite `SidebarPanel` body

This is the largest task — the `SidebarPanel` body currently uses `RecentEventsFeed` + `groupTrackers` + a sort dropdown + a domain-tabs row + `TrackerRow`s with colored borders and dots. We replace the render output with: search → inline tabs → hero → divider-separated feed.

**Files:**
- Modify: `src/components/islands/CommandCenter/SidebarPanel.tsx`

- [ ] **Step 5.1: Import new components and helper**

Near the top of `SidebarPanel.tsx`, add imports:

```tsx
import FeedRow from './FeedRow';
import HeroCard from './HeroCard';
import { selectHeroTracker } from '../../../lib/hero-selection';
```

- [ ] **Step 5.2: Remove the collapsed branch from `TrackerRow`; delegate to `FeedRow`**

Find the `TrackerRow` component (around line 48) and the collapsed-row return block (around line 195, starts with `// Collapsed row`).

Replace the entire collapsed branch (from the `// Collapsed row` comment through the closing `);` of its return) with a single call to `FeedRow`:

```tsx
  // Collapsed: delegate to FeedRow
  return (
    <FeedRow
      tracker={tracker}
      isHovered={isHovered}
      isFollowed={isFollowed}
      isCompared={isCompared}
      isLive={isLive}
      isDimmed={false} /* the parent SidebarPanel controls dimming via wrappers — keep false here */
      basePath={basePath}
      locale={locale}
      onSelect={onSelect}
      onHover={onHover}
      onToggleFollow={onToggleFollow}
      onToggleCompare={onToggleCompare}
    />
  );
```

The `TrackerRow` expanded branch (the `if (isActive) { return ( ... ) }` block) stays untouched — that's the active-tracker detail view.

Clean up now-unused locals in `TrackerRow` if lint flags them (e.g., `getFreshnessDot`, `computeFreshness` usage in the collapsed block). Leave them if still used elsewhere.

- [ ] **Step 5.3: Compute hero tracker in `SidebarPanel`**

Inside the main `SidebarPanel` function body, after the existing `useMemo` calls for `filtered`, `sortedFiltered`, `groups`, etc., add:

```tsx
const heroTracker = useMemo(
  () => selectHeroTracker(trackers, followedSlugs),
  [trackers, followedSlugs],
);
```

Place this before the `return` statement. `trackers` is the full directory prop, NOT `filtered` — the hero is independent of search/filter state.

- [ ] **Step 5.4: Remove the sort dropdown block**

Find the "Sort dropdown" block (search for `{(viewMode || 'operations') !== 'geographic' && (`). Delete the entire block including the closing `)}`.

Also remove the `sortTrackers` call and the `sortKey` state. Locate:
- `const [sortKey, setSortKey] = useState<SortKey>('name');`
- `const sortedFiltered = useMemo(() => sortTrackers(filtered, sortKey), [filtered, sortKey]);`

Replace the `sortedFiltered` line with:

```tsx
const sortedFiltered = useMemo(
  () => sortByRelevance(filtered, followedSlugs),
  [filtered, followedSlugs],
);
```

And delete the `sortKey` state line. Ensure `sortByRelevance` is imported (add `import { sortByRelevance } from '../../../lib/relevance';` if not already there).

Also remove `SortKey`, `getSortOptions`, `sortTrackers`, and `RecentEventsFeed` if they're unused after this edit (check with grep). If `RecentEventsFeed` is only referenced from its render site, delete its declaration too — it's a large ~150 line block.

- [ ] **Step 5.5: Remove the domain-tabs block from the render (replaced by inline tabs)**

Find the "Domain tabs — only in domain mode" block (search for `(viewMode || 'operations') === 'domain' && (`). Delete the entire block.

The domain filter logic (`activeDomain`) will now be accessed through a different UX: for v1, remove domain filtering entirely when in DOMAIN view — each domain is its own group header. (Trackers are still grouped by domain via `groupTrackers(sortedFiltered)`.) Clicking a group header to filter is deferred.

Also delete the `activeDomain` state and the call to `setActiveDomain` if present. Remove the call from `filterTrackers` arguments:

```tsx
// Before
const filtered = useMemo(
  () => filterTrackers(trackers, activeDomain, searchQuery),
  [trackers, activeDomain, searchQuery],
);

// After
const filtered = useMemo(
  () => filterTrackers(trackers, null, searchQuery),
  [trackers, searchQuery],
);
```

- [ ] **Step 5.6: Replace the list render block with the new hero + feed layout**

Find the `{/* Tracker list */}` block. Replace the entire `<div style={S.list}>...</div>` with:

```tsx
{/* Hero — hidden during search */}
{!isSearching && heroTracker && (
  <HeroCard
    tracker={heroTracker}
    isBroadcastFeatured={featuredSlug === heroTracker.slug}
    basePath={basePath}
    locale={locale}
    onSelect={onSelectTracker}
  />
)}

{/* Tracker list */}
<div style={S.list}>
  {(viewMode || 'operations') === 'geographic' ? (
    <GeoAccordion
      trackers={filtered}
      basePath={basePath}
      activeTracker={activeTracker}
      onSelectTracker={onSelectTracker}
      onHoverTracker={onHoverTracker}
      expandedKeys={geoExpandedKeys}
      onExpandedKeysChange={onGeoExpandedKeysChange}
      onHoverGeoNode={onHoverGeoNode}
      onLeaveGeoNode={onLeaveGeoNode}
      onClickGeoNode={onClickGeoNode}
      activeGeoPath={activeGeoPath}
    />
  ) : (
    <FeedList
      trackers={sortedFiltered}
      followedSlugs={followedSlugs}
      activeTracker={activeTracker}
      hoveredTracker={hoveredTracker}
      compareSlugs={compareSlugs}
      featuredSlug={featuredSlug ?? null}
      basePath={basePath}
      locale={locale}
      viewMode={(viewMode || 'operations') as ViewMode}
      onSelectTracker={onSelectTracker}
      onHoverTracker={onHoverTracker}
      onToggleFollow={onToggleFollow}
      onToggleCompare={onToggleCompare}
      isSearching={isSearching}
    />
  )}
</div>
```

- [ ] **Step 5.7: Add the `FeedList` subcomponent inside `SidebarPanel.tsx`**

Near the other sub-component declarations at the top of the file (after `TrackerRow`, before `SidebarPanel`), add:

```tsx
// ── FeedList ──

const OLDER_THRESHOLD_MS = 48 * 3600 * 1000;

interface FeedListProps {
  trackers: TrackerCardData[];
  followedSlugs: string[];
  activeTracker: string | null;
  hoveredTracker: string | null;
  compareSlugs: string[];
  featuredSlug: string | null;
  basePath: string;
  locale: Locale;
  viewMode: ViewMode;
  onSelectTracker: (slug: string | null) => void;
  onHoverTracker: (slug: string | null) => void;
  onToggleFollow: (slug: string) => void;
  onToggleCompare: (slug: string) => void;
  isSearching: boolean;
}

const FeedList = memo(function FeedList({
  trackers,
  followedSlugs,
  activeTracker,
  hoveredTracker,
  compareSlugs,
  featuredSlug,
  basePath,
  locale,
  viewMode,
  onSelectTracker,
  onHoverTracker,
  onToggleFollow,
  onToggleCompare,
  isSearching,
}: FeedListProps) {
  const now = Date.now();
  const followed = new Set(followedSlugs);

  const renderOne = (tracker: TrackerCardData, isDimmed: boolean) => {
    const isActive = activeTracker === tracker.slug;
    if (isActive) {
      return (
        <TrackerRow
          key={tracker.slug}
          tracker={tracker}
          basePath={basePath}
          isActive
          isHovered={hoveredTracker === tracker.slug}
          isFollowed={followed.has(tracker.slug)}
          isCompared={compareSlugs.includes(tracker.slug)}
          isLive={featuredSlug === tracker.slug}
          onSelect={onSelectTracker}
          onHover={onHoverTracker}
          onToggleFollow={onToggleFollow}
          onToggleCompare={onToggleCompare}
          locale={locale}
        />
      );
    }
    return (
      <FeedRow
        key={tracker.slug}
        tracker={tracker}
        isHovered={hoveredTracker === tracker.slug}
        isFollowed={followed.has(tracker.slug)}
        isCompared={compareSlugs.includes(tracker.slug)}
        isLive={featuredSlug === tracker.slug}
        isDimmed={isDimmed && !isSearching}
        basePath={basePath}
        locale={locale}
        onSelect={onSelectTracker}
        onHover={onHoverTracker}
        onToggleFollow={onToggleFollow}
        onToggleCompare={onToggleCompare}
      />
    );
  };

  if (trackers.length === 0) {
    return (
      <div style={{
        padding: '24px 12px',
        textAlign: 'center',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: '0.62rem',
        color: 'var(--text-muted)',
      }}>
        No trackers match.
      </div>
    );
  }

  // DOMAIN view: group by tracker.domain, no dim-older split (user asked for
  // domain groups to drive visual hierarchy).
  if (viewMode === 'domain') {
    const byDomain = new Map<string, TrackerCardData[]>();
    for (const t of trackers) {
      const key = t.domain ?? 'other';
      const arr = byDomain.get(key) ?? [];
      arr.push(t);
      byDomain.set(key, arr);
    }
    return (
      <>
        {Array.from(byDomain.entries()).map(([domain, list]) => (
          <div key={domain}>
            <div className="cc-feed-group-divider" aria-label={domain.toUpperCase()}>
              {domain.toUpperCase()}
            </div>
            {list.map(tr => renderOne(tr, false))}
          </div>
        ))}
      </>
    );
  }

  // OPS view: followed first, then recent, then older (dimmed), separated by
  // 1px dividers (no text labels).
  const followedTrackers: TrackerCardData[] = [];
  const recent: TrackerCardData[] = [];
  const older: TrackerCardData[] = [];

  for (const t of trackers) {
    if (followed.has(t.slug)) {
      followedTrackers.push(t);
      continue;
    }
    const age = now - new Date(t.lastUpdated).getTime();
    if (age > OLDER_THRESHOLD_MS) older.push(t);
    else recent.push(t);
  }

  return (
    <>
      {followedTrackers.length > 0 && (
        <>
          {followedTrackers.map(tr => renderOne(tr, false))}
          {(recent.length > 0 || older.length > 0) && <div className="cc-feed-divider" />}
        </>
      )}
      {recent.map(tr => renderOne(tr, false))}
      {older.length > 0 && <div className="cc-feed-divider" />}
      {older.map(tr => renderOne(tr, true))}
    </>
  );
});
```

Ensure `ViewMode` and `Locale` types are imported at the top of the file (check — they likely already are).

- [ ] **Step 5.8: Add divider CSS**

Append to `global.css`:

```css
.cc-feed-divider {
  height: 1px;
  background: var(--border, #2a2d3a);
  margin: 6px 10px;
  opacity: 0.5;
}
.cc-feed-group-divider {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.5rem;
  letter-spacing: 0.22em;
  color: var(--text-muted, #8b8fa2);
  padding: 14px 12px 4px;
  border-top: 1px solid var(--border, #2a2d3a);
  margin-top: 6px;
}
.cc-feed-group-divider:first-child {
  border-top: none;
  margin-top: 0;
}
```

- [ ] **Step 5.9: Build + verify**

Run: `npm run build 2>&1 | tail -10`

Expected: TypeScript compiles. Pre-existing Zod errors remain.

If there are TS errors about unused imports or props on the now-deleted blocks, remove them. Common cleanups:
- `SortKey`, `getSortOptions`, `sortTrackers` — delete
- `computeDomainCounts`, `getVisibleDomains` usage in the old domain-tabs block — deleted with the block
- The `tab` and `tabCount` style functions in `S = { ... }` — delete

- [ ] **Step 5.10: Commit**

```bash
git add src/components/islands/CommandCenter/SidebarPanel.tsx src/styles/global.css
git commit -m "feat(home): rewrite SidebarPanel body around hero + feed

- Hero card shown above the list (hidden during search)
- Inline underline tabs replace the pill ViewModeToggle
- Remove sort dropdown, domain-tabs row, RecentEventsFeed, and
  group-header labels; grouping is done by divider + dim-older now
- OPS view: followed / recent / older (dimmed) split by dividers
- DOMAIN view: grouped by domain with small uppercase labels
- GEO view: hero above GeoAccordion, no other change
- TrackerRow collapsed branch delegates to FeedRow"
```

---

## Task 6: Manual verification + follow-up polish

**Files:** none (uses dev server + browser)

- [ ] **Step 6.1: Start the dev server**

Run: `npm run dev`

Wait for Astro to print the local URL (typically `http://localhost:4321/`).

- [ ] **Step 6.2: Open the homepage at 1440×900**

Open `http://localhost:4321/`. Default sidebar state after PR #115: expanded (~440 px).

**Verify:**
- Hero card visible near the top, below search + tabs.
- Thumbnail renders (event image OR gradient+icon fallback).
- Tracker name is uppercase, bold, monospace; LIVE pulse badge appears when the hero tracker is currently broadcast-featured.
- Headline clamps to 3 lines.
- Below the hero: followed trackers first (if any), then a faint divider, then recent rows, then another divider, then dim older rows.
- No tier chips, no colored left borders, no freshness dots on rows.
- Tabs row shows OPS / GEO / DOMAIN as text with an underline under the active tab.

- [ ] **Step 6.3: Click tabs — verify view transitions**

- Click `GEO`: hero remains at top; below it, the `GeoAccordion` renders with expandable region groups.
- Click `DOMAIN`: hero remains at top; below it, rows are grouped by domain with small `CULTURE`, `CONFLICT`, etc. labels.
- Click `OPS`: back to the divided layout.

- [ ] **Step 6.4: Type in search — verify hero + tabs hide**

Press `/` to focus search. Type `ir` (or any query).

**Verify:**
- Hero card disappears.
- Tabs remain visible (they're part of the chrome; the spec's "hide tabs during search" line was a design draft — keeping tabs visible is the pragmatic choice because filter still applies within the current tab). If you prefer hiding tabs during search, simply wrap the `<ViewModeToggle>` in `{!isSearching && (...)}`. **Your call in this step — pick one and proceed.**
- Feed shows only matching rows.

- [ ] **Step 6.5: Click the hero — verify navigation**

Click anywhere on the hero card. It should set the hero's tracker as `activeTracker`, which causes the corresponding `TrackerRow` expanded view to appear inline in the list below. Then click "Open Dashboard →" in that expanded view — verify it navigates to `/mencho-cjng/` (or whatever tracker slug the hero picked).

- [ ] **Step 6.6: Broadcast cycle — verify hero stays put**

Wait ~10 seconds. The lower-third on the globe should cycle through trackers. The LIVE pulse dot should move between feed rows (and the hero's LIVE badge should flash off/on when the hero tracker coincides with the broadcast-featured tracker). **The hero card itself must NOT change tracker** — that's the "static hero" contract from the spec.

- [ ] **Step 6.7: Hover a row — verify follow/compare buttons appear**

Hover a feed row. The ☆ follow and ◇ compare buttons should fade in at the right edge. Click ☆ — the row moves to the "followed" section at the top (above the first divider).

- [ ] **Step 6.8: Narrow viewport — 800×800**

Resize to 800×800.

**Verify:**
- Hero thumbnail shrinks from 96 px to 64 px.
- Headline clamp is 2 lines instead of 3.
- Feed rows remain readable.

- [ ] **Step 6.9: Mobile viewport — 375×812**

Resize to 375×812.

**Verify:**
- `MobileStoryCarousel` and existing mobile tabs behavior unchanged.
- No visual regressions.

- [ ] **Step 6.10: Console check**

DevTools console should be clean of errors related to these new components. Pre-existing THREE.Clock deprecation warnings and unrelated 500s can be ignored.

- [ ] **Step 6.11: Run Vitest suite**

Run: `npm test -- --run 2>&1 | tail -10`

Expected: all tests pass, including the 8 new `selectHeroTracker` tests. Pre-existing i18n translation test failures (accent assertions) are unrelated.

- [ ] **Step 6.12: Final polish commit (if needed)**

If steps 6.4's tabs-during-search decision went the "hide tabs" way, or step 6.5 revealed an ordering issue, commit a focused fix:

```bash
git add -A
git commit -m "fix(home): polish after manual verification"
```

Skip if no tweaks required.

---

## Post-implementation checklist

- [ ] `npm run build` passes
- [ ] `npm test -- --run` passes (except pre-existing i18n failures on accented characters — unrelated)
- [ ] All Task 6 manual checks pass
- [ ] Commits are clean and incremental (5 feature commits + maybe 1 polish)
- [ ] GEO view and mobile layout unchanged from user perspective
- [ ] Lighthouse Performance score within ±3 points of main

## Rollback plan

If the design regresses in production:
- Revert the full set of commits
- No data layer or workflow changes — revert is safe
- `TrackerRow` expanded branch, `GeoAccordion`, `GeoPanel`, and `SidebarPanel`'s outer chrome (header, search, footer) are preserved. Only the middle rendering region changes.
