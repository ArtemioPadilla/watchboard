# Desktop Home Unified Broadcast Sync — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `useBroadcastMode` the single source of truth for the desktop homepage, so `DesktopStoryStrip`, `BroadcastOverlay`, `SidebarPanel`, and the globe camera all reflect the same featured tracker on every tick.

**Architecture:** Keep all three desktop surfaces (lower-third, story strip, sidebar directory) and the globe. Replace the strip's independent `useStoryState` timer with broadcast-driven props. Add a `featuredSlug` prop to the sidebar that scrolls the matching row into view and pulses a LIVE badge. Change `handleSelect` so user clicks on any surface jump the broadcast cycle (and pause it) rather than tear down the experience.

**Tech Stack:** Astro 5 + React 19 islands, TypeScript, CSS, Vitest (for non-UI unit tests; no React Testing Library setup exists, so UI verification is via Playwright / manual browser test).

**Spec:** `docs/superpowers/specs/2026-04-16-desktop-home-sync-design.md`

---

## File Structure

**Modify:**
- `src/components/islands/CommandCenter/DesktopStoryStrip.tsx` — drop `useStoryState`, accept broadcast-driven props, single progress bar
- `src/components/islands/CommandCenter/CommandCenter.tsx` — decouple `broadcastEnabled` from `activeTracker`, rewrite `handleSelect`, thread broadcast state into strip and sidebar, delete `handleStoryTrackerChange`
- `src/components/islands/CommandCenter/SidebarPanel.tsx` — add `featuredSlug` prop, auto-scroll on change, LIVE badge on matching row
- `src/styles/desktop-stories.css` — simplify progress bar to single segment driven by inline style width
- `src/styles/global.css` — add `.cc-tracker-live-pulse` animation (small, lives with other global CC styles)

**Leave alone:**
- `src/components/islands/CommandCenter/useStoryState.ts` — still used by `MobileStoryCarousel`, don't touch
- `src/components/islands/CommandCenter/useBroadcastMode.ts` — already exposes everything we need
- `src/components/islands/CommandCenter/BroadcastOverlay.tsx` — already broadcast-driven
- `src/components/islands/CommandCenter/MobileStoryCarousel.tsx` — mobile only, not affected

---

## Task 1: Rewrite DesktopStoryStrip to props-driven

**Files:**
- Modify (rewrite): `src/components/islands/CommandCenter/DesktopStoryStrip.tsx`

- [ ] **Step 1.1: Replace DesktopStoryStrip with props-driven version**

Overwrite the file with:

```tsx
import { useRef, useEffect, useMemo } from 'react';
import type { TrackerCardData } from '../../../lib/tracker-directory-utils';
import { relativeTime } from '../../../lib/event-utils';
import { t, getPreferredLocale } from '../../../i18n/translations';

// ── Types ──

interface Props {
  basePath: string;
  trackerQueue: TrackerCardData[];
  featuredTracker: TrackerCardData | null;
  currentIndex: number;
  progress: number;            // 0..1
  isPaused: boolean;
  pauseCountdown: number;
  onCircleClick: (slug: string) => void;
  onCardClick: () => void;
}

// ── Constants ──

const MAX_CIRCLES = 20;

const KPI_COLORS = [
  'var(--accent-red)',
  'var(--accent-amber)',
] as const;

const DOMAIN_GRADIENTS: Record<string, string> = {
  military: 'linear-gradient(135deg, #1a0a0a, #2c1010, #0d1117)',
  conflict: 'linear-gradient(135deg, #1a0a0a, #2c1010, #0d1117)',
  politics: 'linear-gradient(135deg, #0a0a1a, #101030, #0d1117)',
  sports: 'linear-gradient(135deg, #0a1a0a, #102010, #0d1117)',
  crisis: 'linear-gradient(135deg, #1a0f00, #2c1a05, #0d1117)',
  culture: 'linear-gradient(135deg, #1a0a1a, #2c102c, #0d1117)',
  default: 'linear-gradient(135deg, #12141a, #181b23, #0d1117)',
};

// ── Helpers ──

function domainGradient(domain?: string): string {
  if (!domain) return DOMAIN_GRADIENTS.default;
  return DOMAIN_GRADIENTS[domain] ?? DOMAIN_GRADIENTS.default;
}

// ── Component ──

export default function DesktopStoryStrip({
  basePath,
  trackerQueue,
  featuredTracker,
  currentIndex,
  progress,
  isPaused,
  pauseCountdown,
  onCircleClick,
  onCardClick,
}: Props) {
  const locale = getPreferredLocale();
  const circlesRef = useRef<HTMLDivElement>(null);
  const seenRef = useRef<Set<string>>(new Set());

  // Accumulate "seen" slugs as cycle advances
  useEffect(() => {
    if (featuredTracker) seenRef.current.add(featuredTracker.slug);
  }, [featuredTracker]);

  // Auto-scroll circle column to keep active circle visible
  useEffect(() => {
    const container = circlesRef.current;
    if (!container) return;
    const activeCircle = container.children[currentIndex] as HTMLElement | undefined;
    if (activeCircle) {
      activeCircle.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [currentIndex]);

  const visibleCircles = useMemo(
    () => trackerQueue.slice(0, MAX_CIRCLES),
    [trackerQueue],
  );

  if (visibleCircles.length === 0 || !featuredTracker) return null;

  const kpis = featuredTracker.topKpis.slice(0, 2);
  const progressPct = Math.max(0, Math.min(100, progress * 100));

  return (
    <div className="desktop-story-strip">
      {/* Circle column */}
      <div className="desktop-story-circles" ref={circlesRef}>
        {visibleCircles.map((tr, i) => (
          <div
            key={tr.slug}
            className={
              `desktop-story-circle` +
              (i === currentIndex ? ' active' : '') +
              (seenRef.current.has(tr.slug) && i !== currentIndex ? ' seen' : '')
            }
            onClick={() => onCircleClick(tr.slug)}
            title={tr.shortName}
          >
            {tr.icon ?? '?'}
          </div>
        ))}
      </div>

      {/* Story card */}
      <div
        key={featuredTracker.slug}
        className="desktop-story-card desktop-story-card-enter"
        onClick={onCardClick}
      >
        {/* Single progress bar driven by broadcast progress */}
        <div className="desktop-story-progress">
          <div className="desktop-story-progress-seg">
            <div
              className="desktop-story-progress-fill"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Image */}
        <div className="desktop-story-image">
          <DesktopStoryImage tracker={featuredTracker} />
        </div>

        {/* Paused badge */}
        {isPaused && (
          <div className="desktop-story-paused">
            {t('story.paused', locale)} · {pauseCountdown}s
          </div>
        )}

        {/* Header: icon + name + age */}
        <div className="desktop-story-header">
          <span className="desktop-story-icon">{featuredTracker.icon ?? '?'}</span>
          <span className="desktop-story-name">{featuredTracker.shortName}</span>
          <span className="desktop-story-age" suppressHydrationWarning>
            {relativeTime(featuredTracker.lastUpdated)}
          </span>
        </div>

        {/* Headline */}
        {featuredTracker.headline && (
          <div className="desktop-story-content">
            <p className="desktop-story-headline">{featuredTracker.headline}</p>
          </div>
        )}

        {/* KPIs (max 2) */}
        {kpis.length > 0 && (
          <div className="desktop-story-kpis">
            {kpis.map((kpi, i) => (
              <div key={i} className="desktop-story-kpi">
                <div
                  className="desktop-story-kpi-value"
                  style={{ color: KPI_COLORS[i % KPI_COLORS.length] }}
                >
                  {kpi.value}
                </div>
                <div className="desktop-story-kpi-label">{kpi.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Read More link */}
        <a
          className="desktop-story-open"
          href={`${basePath}${featuredTracker.slug}/`}
          onClick={(e) => e.stopPropagation()}
        >
          {t('story.readMore', locale)}
        </a>
      </div>
    </div>
  );
}

// ── Image Sub-component (3-tier fallback) ──

function DesktopStoryImage({ tracker }: { tracker: TrackerCardData }) {
  const slideImage = tracker.eventImages?.[0];
  if (slideImage) {
    return (
      <>
        <img
          src={slideImage.url}
          alt={tracker.headline ?? tracker.shortName}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
        <div className="desktop-story-image-gradient" />
      </>
    );
  }

  if (tracker.latestEventMedia) {
    return (
      <>
        <img
          src={tracker.latestEventMedia.url}
          alt={tracker.headline ?? tracker.shortName}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
        <div className="desktop-story-image-gradient" />
      </>
    );
  }

  return (
    <>
      <div
        style={{
          background: domainGradient(tracker.domain),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '36px',
          width: '100%',
          height: '100%',
        }}
      >
        {tracker.icon ?? '?'}
      </div>
      <div className="desktop-story-image-gradient" />
    </>
  );
}
```

Notes:
- The previous internal nav-zone overlays (left/right click zones), multi-slide progress segments, and internal `useStoryState` are all removed. Navigation back/forward happens via circle clicks and the broadcast cycle itself.
- `onCircleClick` and `onCardClick` are the only interaction callbacks, both routed through broadcast in `CommandCenter`.

- [ ] **Step 1.2: Type-check**

Run: `npm run build`

Expected: build fails in `CommandCenter.tsx` because the call site still passes old props (`trackers`, `followedSlugs`, `onTrackerChange`). That's expected — we fix it in Task 2.

- [ ] **Step 1.3: Commit**

```bash
git add src/components/islands/CommandCenter/DesktopStoryStrip.tsx
git commit -m "refactor(home): make DesktopStoryStrip props-driven

Drop internal useStoryState hook and per-slide progress. The strip
now renders whatever tracker and progress the parent passes in,
making it a dumb view of broadcast state.

Note: this commit intentionally breaks the build; Task 2 updates
the call site in CommandCenter."
```

---

## Task 2: Thread broadcast state into CommandCenter, decouple broadcastEnabled

**Files:**
- Modify: `src/components/islands/CommandCenter/CommandCenter.tsx`

- [ ] **Step 2.1: Change `broadcastEnabled` to only depend on `broadcastOff`**

Find the line (currently ~line 148):

```tsx
const broadcastEnabled = !activeTracker && !broadcastOff;
```

Replace with:

```tsx
const broadcastEnabled = !broadcastOff;
```

- [ ] **Step 2.2: Delete `handleStoryTrackerChange`**

Find the block starting at `const handleStoryTrackerChange = useCallback((slug: string) => {` (roughly lines 336–368) and delete the entire `useCallback` assignment (from `const handleStoryTrackerChange` through its closing `}, [trackers]);`). This function is no longer called anywhere after we rewire the strip.

- [ ] **Step 2.3: Rewire DesktopStoryStrip call site**

Find the block (currently ~line 664) that renders `<DesktopStoryStrip ...>`:

```tsx
<DesktopStoryStrip
  trackers={trackers}
  basePath={basePath}
  followedSlugs={followedSlugs}
  onTrackerChange={handleStoryTrackerChange}
/>
```

Replace with:

```tsx
<DesktopStoryStrip
  basePath={basePath}
  trackerQueue={broadcast.trackerQueue as typeof trackers}
  featuredTracker={(broadcast.featuredTracker as (typeof trackers)[number] | null) ?? null}
  currentIndex={broadcast.currentIndex}
  progress={broadcast.progress}
  isPaused={broadcast.isUserPaused}
  pauseCountdown={broadcast.pauseCountdown}
  onCircleClick={(slug) => {
    broadcast.jumpTo(slug);
    if (broadcast.isUserPaused) broadcast.userResume();
    handleDiscoverFeature('story-circle');
  }}
  onCardClick={() => {
    if (broadcast.isUserPaused) {
      broadcast.userResume();
    } else {
      broadcast.userPause();
    }
  }}
/>
```

Notes:
- The `as typeof trackers` casts are because `useBroadcastMode`'s internal `TrackerForBroadcast` is structurally a subset of `TrackerCardData` but TypeScript sees them as different types. The cast is safe because `trackerQueue` is filtered from the same `trackers` array passed into `useBroadcastMode`.
- `handleDiscoverFeature('story-circle')` is OK even if that feature key isn't in the coach hint list; the onboarding util will just record an unknown key.

- [ ] **Step 2.4: Thread `featuredSlug` into SidebarPanel**

Find both `<SidebarPanel ... />` call sites. There is one main usage (currently ~line 732). Add a `featuredSlug` prop:

```tsx
<SidebarPanel
  isMobile={isMobile}
  trackers={trackers}
  basePath={basePath}
  activeTracker={activeTracker}
  hoveredTracker={hoveredTracker}
  followedSlugs={followedSlugs}
  liveCount={liveCount}
  historicalCount={historicalCount}
  onSelectTracker={handleSelect}
  onHoverTracker={handleHover}
  onToggleFollow={handleToggleFollow}
  compareSlugs={compareSlugs}
  onToggleCompare={handleToggleCompare}
  locale={locale}
  onToggleLocale={handleToggleLocale}
  searchRef={searchRef}
  viewMode={viewMode}
  onChangeViewMode={setViewMode}
  geoExpandedKeys={viewMode === 'geographic' ? geoExpandedKeys : undefined}
  onGeoExpandedKeysChange={viewMode === 'geographic' ? setGeoExpandedKeys : undefined}
  onHoverGeoNode={handleHoverGeoNode}
  onLeaveGeoNode={handleLeaveGeoNode}
  onClickGeoNode={handleClickGeoNode}
  activeGeoPath={activeGeoPath}
  featuredSlug={broadcastEnabled ? (broadcast.featuredTracker?.slug ?? null) : null}
/>
```

The only addition is the final `featuredSlug` line. Leave the other props unchanged.

- [ ] **Step 2.5: Type-check**

Run: `npm run build`

Expected: build still fails because `SidebarPanel` doesn't accept `featuredSlug` yet — we add the prop in Task 4. The `DesktopStoryStrip` call should now type-check. If it doesn't, the cast expression in Step 2.3 may need adjustment.

- [ ] **Step 2.6: Commit**

```bash
git add src/components/islands/CommandCenter/CommandCenter.tsx
git commit -m "feat(home): thread broadcast state into strip and sidebar

Decouple broadcastEnabled from activeTracker so clicking a tracker
no longer tears down the broadcast experience. DesktopStoryStrip
now reads featured/progress/index from useBroadcastMode directly.

Note: SidebarPanel featuredSlug prop added in next commit; build
still breaks until Task 4."
```

---

## Task 3: Rewrite handleSelect to jump broadcast instead of tearing it down

**Files:**
- Modify: `src/components/islands/CommandCenter/CommandCenter.tsx`

- [ ] **Step 3.1: Replace `handleSelect` body**

Find `handleSelect` (currently ~line 239):

```tsx
const handleSelect = useCallback((slug: string | null) => {
  setActiveTracker(slug);
  if (slug) {
    setActiveGeoPath(null);
    setSidebarCollapsed(false);
  }
}, []);
```

Replace with:

```tsx
const handleSelect = useCallback((slug: string | null) => {
  setActiveTracker(slug);
  if (slug) {
    setActiveGeoPath(null);
    // Jump broadcast to this tracker and user-pause, so every surface
    // (lower-third, story strip, sidebar) stays in sync without tearing
    // down the broadcast experience. Esc or pauseCountdown resumes.
    if (!broadcastOff) {
      broadcast.jumpTo(slug);
      broadcast.userPause();
    }
  }
}, [broadcastOff, broadcast]);
```

Notes:
- Intentionally NOT force-expanding the sidebar (`setSidebarCollapsed(false)`). The rail can stay collapsed and show the strip+lower-third sync. Users who want the full directory open can still click the hamburger.
- `setActiveTracker(slug)` is preserved so the `O` and `C` hotkeys continue to work against a user-selected tracker.
- If broadcast is off, selection behaves as before (no broadcast interaction).

- [ ] **Step 3.2: Verify Escape still clears active**

Look at the existing keydown handler (`useEffect` near line 371). The `Escape` branch currently does:

```tsx
if (e.key === 'Escape') {
  if (showHelp) { setShowHelp(false); return; }
  if (compareSlugs.length > 0) { setCompareSlugs([]); return; }
  if (isInput) { (target as HTMLInputElement).blur(); return; }
  setActiveTracker(null);
  return;
}
```

Change the final `setActiveTracker(null);` line to also resume broadcast if user-paused:

```tsx
if (e.key === 'Escape') {
  if (showHelp) { setShowHelp(false); return; }
  if (compareSlugs.length > 0) { setCompareSlugs([]); return; }
  if (isInput) { (target as HTMLInputElement).blur(); return; }
  setActiveTracker(null);
  if (broadcast.isUserPaused) broadcast.userResume();
  return;
}
```

Add `broadcast` to the effect's dependency array at the bottom of the `useEffect`:

Find:
```tsx
}, [activeTracker, showHelp, compareSlugs.length, handleToggleFollow, handleToggleCompare, basePath, locale]);
```

Change to:
```tsx
}, [activeTracker, showHelp, compareSlugs.length, handleToggleFollow, handleToggleCompare, basePath, locale, broadcast]);
```

- [ ] **Step 3.3: Commit**

```bash
git add src/components/islands/CommandCenter/CommandCenter.tsx
git commit -m "feat(home): clicking a tracker jumps broadcast instead of tearing down

handleSelect now calls broadcast.jumpTo + userPause when a tracker
is selected, keeping the globe, lower-third, strip, and sidebar in
sync. Esc clears selection AND resumes broadcast from the paused
position."
```

---

## Task 4: Add featuredSlug + LIVE pulse to SidebarPanel

**Files:**
- Modify: `src/components/islands/CommandCenter/SidebarPanel.tsx`
- Modify: `src/styles/global.css`

- [ ] **Step 4.1: Add LIVE pulse animation to global.css**

Open `src/styles/global.css`. Append at the end of the file:

```css
/* ── CommandCenter: broadcast-featured row LIVE pulse ── */
@keyframes ccLivePulse {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(46, 204, 113, 0.5);
  }
  50% {
    box-shadow: 0 0 0 4px rgba(46, 204, 113, 0);
  }
}
.cc-tracker-row.cc-tracker-live,
.cc-tracker-expanded.cc-tracker-live {
  animation: ccLivePulse 2s ease-in-out infinite;
}
.cc-tracker-live-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  margin-left: 6px;
  padding: 1px 5px;
  background: rgba(46, 204, 113, 0.15);
  border: 1px solid rgba(46, 204, 113, 0.4);
  border-radius: 3px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.42rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: #3fb950;
  text-transform: uppercase;
}
.cc-tracker-live-badge::before {
  content: '';
  display: inline-block;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #3fb950;
  animation: ccLivePulse 1.5s ease-in-out infinite;
}
```

- [ ] **Step 4.2: Add `featuredSlug` to SidebarPanel Props**

In `src/components/islands/CommandCenter/SidebarPanel.tsx`, find the `interface Props` (currently ~line 18) and add one field near the end (before the closing `}`):

```ts
// Current tracker featured by broadcast cycle (drives LIVE pulse + auto-scroll)
featuredSlug?: string | null;
```

- [ ] **Step 4.3: Add `featuredSlug` to TrackerRow Props + rendering**

Find the `TrackerRow` component's props type (currently ~line 60–71). Add one field:

```ts
isLive: boolean;
```

So the full inner type becomes:

```ts
}: {
  tracker: TrackerCardData;
  basePath: string;
  isActive: boolean;
  isHovered: boolean;
  isFollowed: boolean;
  isCompared: boolean;
  isLive: boolean;
  onSelect: (slug: string | null) => void;
  onHover: (slug: string | null) => void;
  onToggleFollow: (slug: string) => void;
  onToggleCompare: (slug: string) => void;
  locale?: Locale;
}) {
```

And add `isLive` to the destructured params at the top of the component (currently ~line 48):

```tsx
const TrackerRow = memo(function TrackerRow({
  tracker,
  basePath,
  isActive,
  isHovered,
  isFollowed,
  isCompared,
  isLive,
  onSelect,
  onHover,
  onToggleFollow,
  onToggleCompare,
  locale = 'en',
}: {
```

- [ ] **Step 4.4: Apply `cc-tracker-live` class + LIVE badge in TrackerRow**

The LIVE badge shows only in the collapsed-row case. In the expanded row, `isActive` is true and the existing active styling already highlights it — only the pulse class gets added there.

**Expanded row** — find (in `TrackerRow`) the block starting `if (isActive) { return (` and the outer `<div>`:

```tsx
<div
  ref={rowRef}
  className="cc-tracker-expanded"
  style={{
```

Change the className to:

```tsx
<div
  ref={rowRef}
  className={`cc-tracker-expanded${isLive ? ' cc-tracker-live' : ''}`}
  style={{
```

Do NOT add a separate LIVE badge inside the expanded row.

**Collapsed row** — find the `<div>` opening (currently ~line 196: `<div ref={rowRef} className="cc-tracker-row" ...>`). Change the className:

```tsx
<div
  ref={rowRef}
  className={`cc-tracker-row${isLive && !isActive ? ' cc-tracker-live' : ''}`}
```

Then in the collapsed row, inside `<div style={S.collapsedLeft}>`, find the line:

```tsx
<span className="cc-tracker-name" style={S.collapsedName}>{tracker.shortName}</span>
```

Add a LIVE badge right after it:

```tsx
<span className="cc-tracker-name" style={S.collapsedName}>{tracker.shortName}</span>
{isLive && !isActive && (
  <span className="cc-tracker-live-badge" aria-label="Currently featured by broadcast">
    LIVE
  </span>
)}
```

- [ ] **Step 4.5: Pass `featuredSlug` through and compute `isLive`**

In the main `SidebarPanel` function, destructure the new prop. Find the signature (currently ~line 577):

```tsx
export default function SidebarPanel({
  trackers,
  basePath,
  activeTracker,
  ...
  activeGeoPath,
}: Props) {
```

Add `featuredSlug` to the destructure (before the closing `}: Props`):

```tsx
  activeGeoPath,
  featuredSlug,
}: Props) {
```

Then find both `<TrackerRow` render sites in this file. There are TWO — one in the main grouped list (~line 834) and any others. Use grep if needed: `grep -n "<TrackerRow" SidebarPanel.tsx`.

For each `<TrackerRow` usage, add:

```tsx
isLive={featuredSlug === t.slug}
```

e.g., the main one becomes:

```tsx
<TrackerRow
  key={t.slug}
  tracker={t}
  basePath={basePath}
  isActive={activeTracker === t.slug}
  isHovered={hoveredTracker === t.slug}
  isFollowed={followedSlugs.includes(t.slug)}
  isCompared={compareSlugs.includes(t.slug)}
  isLive={featuredSlug === t.slug}
  onSelect={onSelectTracker}
  onHover={onHoverTracker}
  onToggleFollow={onToggleFollow}
  onToggleCompare={onToggleCompare}
  locale={locale}
/>
```

- [ ] **Step 4.6: Add `data-tracker-slug` attributes to TrackerRow**

In `TrackerRow` (both the expanded and collapsed branches), add `data-tracker-slug={tracker.slug}` to the outer `<div>`:

Expanded branch `<div>`:
```tsx
<div
  ref={rowRef}
  className={`cc-tracker-expanded${isLive ? ' cc-tracker-live' : ''}`}
  data-tracker-slug={tracker.slug}
  style={{
```

Collapsed branch `<div>`:
```tsx
<div
  ref={rowRef}
  className={`cc-tracker-row${isLive && !isActive ? ' cc-tracker-live' : ''}`}
  data-tracker-slug={tracker.slug}
  style={{
```

- [ ] **Step 4.7: Add auto-scroll effect in SidebarPanel**

In `SidebarPanel`'s main function, after the existing `useMemo`s and `flatSlugs`, before `handleKeyDown`, add:

```tsx
// Auto-scroll the broadcast-featured tracker row into view when it changes
useEffect(() => {
  if (!featuredSlug) return;
  const el = document.querySelector<HTMLElement>(
    `.cc-sidebar [data-tracker-slug="${featuredSlug}"]`,
  );
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}, [featuredSlug]);
```

The `.cc-sidebar` class is applied by `CommandCenter.tsx` to the `<nav>` wrapping the sidebar, which scopes the query correctly. No new ref or wrapper needed. Ensure `useEffect` is imported (already is — check the existing imports at the top of the file).

- [ ] **Step 4.8: Type-check and build**

Run: `npm run build`

Expected: PASS. If type errors remain about missing `isLive` in any `<TrackerRow`, add it. If the build complains about unused imports, remove them.

- [ ] **Step 4.9: Commit**

```bash
git add src/components/islands/CommandCenter/SidebarPanel.tsx src/styles/global.css
git commit -m "feat(home): LIVE pulse + auto-scroll for broadcast-featured row

Sidebar now highlights the current broadcast tracker with a LIVE
badge and pulse animation, and auto-scrolls its row into view as
the cycle advances — making the sidebar feel part of the same
broadcast surface as the globe and lower-third."
```

---

## Task 5: Simplify desktop-stories.css for single progress bar

**Files:**
- Modify: `src/styles/desktop-stories.css`

- [ ] **Step 5.1: Ensure progress-fill transitions smoothly**

In `src/styles/desktop-stories.css`, the existing `.desktop-story-progress-fill` rule is:

```css
.desktop-story-progress-fill {
  height: 100%;
  width: 0%;
  background: var(--accent-blue, #58a6ff);
  border-radius: 1px;
  transition: width 0.1s linear;
}
```

Change `transition: width 0.1s linear;` to `transition: width 0.15s linear;` — because broadcast `progress` updates on RAF (~60Hz) but re-renders may be less frequent. A slightly longer transition smooths visual jitter. If jitter isn't observed in manual testing (Task 6), revert this.

- [ ] **Step 5.2: Remove `.complete` / `.upcoming` rules (dead code)**

These classes are no longer set by the component after Task 1. Delete these two rules:

```css
.desktop-story-progress-fill.complete {
  width: 100%;
}
.desktop-story-progress-fill.upcoming {
  width: 0%;
}
```

- [ ] **Step 5.3: Commit**

```bash
git add src/styles/desktop-stories.css
git commit -m "style(home): simplify story-strip progress bar CSS

Remove dead .complete/.upcoming rules (the strip now uses a single
progress bar driven by an inline width) and relax transition
duration slightly to absorb render jitter."
```

---

## Task 6: Manual verification

**Files:** none (uses running dev server + browser)

- [ ] **Step 6.1: Start the dev server**

Run: `npm run dev`

Expected: Astro reports dev server at `http://localhost:4321/` (or similar). Leave it running.

- [ ] **Step 6.2: Open the homepage in a desktop-width viewport**

Open `http://localhost:4321/` (base path: `/watchboard/` on prod; locally depends on `ASTRO_BASE`). If the page is blank, check the console for hydration errors.

Resize the window to >= 1280×900 to guarantee desktop layout.

- [ ] **Step 6.3: Wait for broadcast to start and observe sync**

Expected within ~5 seconds:
- Globe begins auto-rotate and flies to a tracker.
- BroadcastOverlay lower-third appears bottom-left with that tracker's headline.
- DesktopStoryStrip in the right rail shows the SAME tracker's card, with a single progress bar ticking.
- After ~8s the cycle advances: globe flies, lower-third changes, strip card changes to the same new tracker. All three stay aligned.

If the strip card differs from the lower-third, Step 1/2 wiring is wrong. Check that `broadcast.featuredTracker` is the prop driving both.

- [ ] **Step 6.4: Expand the sidebar (click hamburger)**

Expected:
- Sidebar expands to full panel.
- The row matching the current broadcast tracker has a `LIVE` badge with a pulsing green ring.
- As the cycle advances, the pulsing badge moves to the new row and the list scrolls that row into view.

- [ ] **Step 6.5: Click a tracker row in the sidebar**

Expected:
- Globe flies to that tracker.
- Lower-third updates to that tracker.
- Strip card updates to match.
- LIVE badge follows to that tracker's row.
- A "PAUSED" countdown appears on the lower-third (existing behavior from `userPause`).
- Sidebar stays expanded (not torn down).

Press `Esc`. Expected: selection clears AND broadcast resumes cycling from the paused position.

- [ ] **Step 6.6: Click a circle in the story strip**

Collapse the sidebar (click collapse button). With broadcast running, click any circle in the strip.

Expected: globe + lower-third + strip card all jump to that tracker; broadcast resumes dwelling on it (no pause, since we called `userResume` after `jumpTo` in Step 2.3's `onCircleClick`).

- [ ] **Step 6.7: Press B to toggle broadcast off**

Expected:
- Lower-third disappears.
- DesktopStoryStrip disappears (collapsed rail shows the plain tracker-icon column instead).
- The bottom breaking-news ticker appears and starts its CSS marquee scroll.
- Sidebar LIVE badges disappear.

Press `B` again.

Expected: broadcast resumes from the start of the queue; all surfaces re-sync within ~5s.

- [ ] **Step 6.8: Mobile regression check**

Resize the window to ≤ 767px.

Expected:
- Mobile layout kicks in (globe 40vh at top, sidebar below).
- `MobileStoryCarousel` appears on the LIVE mobile tab exactly as before.
- No console errors.

- [ ] **Step 6.9: Lighthouse benchmark (optional, recommended)**

Run Lighthouse (Chrome DevTools → Lighthouse tab) on `http://localhost:4321/` in desktop mode. Record the Performance score.

Expected: score within ±3 points of the pre-change baseline. If it drops substantially, the strip's re-render frequency is the most likely culprit — memoize the circles list or switch `progress` to ref-based rendering.

- [ ] **Step 6.10: Commit any final tweaks**

If manual testing surfaces small issues (CSS spacing, z-index, etc.), fix and commit in one cleanup commit:

```bash
git add -A
git commit -m "fix(home): post-verification polish for broadcast sync"
```

(Skip this step if no tweaks are needed.)

---

## Post-implementation checklist

- [ ] `npm run build` passes
- [ ] `npm run test` (vitest) passes — no existing UI tests, but safety check
- [ ] All manual verification steps in Task 6 pass
- [ ] Commits are clean and incremental (one per task step, not squashed)
- [ ] Mobile layout untouched (visual check)

## Rollback plan

If something goes wrong in production:
- Revert the full set of commits on this feature (6 commits + optional cleanup)
- No data layer, build config, or workflow changes were made — revert is safe
- `useStoryState.ts` was never modified, so MobileStoryCarousel is unaffected
