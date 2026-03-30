# Mobile Story Carousel Implementation Plan

**Status: COMPLETED** (2026-03-29)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Instagram Stories-style carousel to the mobile homepage that auto-cycles through tracker briefs with a 3-tier image fallback (verified event media → static map tile → domain gradient).

**Architecture:** A new `MobileStoryCarousel.tsx` React component renders inside the CommandCenter when `window.innerWidth < 768`. It replaces the globe area on mobile. Uses `TrackerCardData` (extended with `latestEventMedia`) and auto-advances every 10s. CSS in a separate `mobile-stories.css` file imported via `global.css`.

**Tech Stack:** React 19, CSS (scroll-snap, keyframes), OpenStreetMap static tiles, existing Zod schemas.

---

### Task 1: Extend TrackerCardData with event media

**Files:**
- Modify: `src/lib/tracker-directory-utils.ts`

- [ ] **Step 1: Add latestEventMedia field to TrackerCardData**

```typescript
// In the TrackerCardData interface, add after digestSectionsUpdated:
latestEventMedia?: { url: string; source: string; tier: number };
```

- [ ] **Step 2: Verify build**

Run: `npm run build 2>&1 | tail -3`
Expected: Build succeeds (new field is optional, no consumers yet)

- [ ] **Step 3: Commit**

```bash
git add src/lib/tracker-directory-utils.ts
git commit -m "feat(data): add latestEventMedia to TrackerCardData"
```

---

### Task 2: Populate latestEventMedia at build time

**Files:**
- Modify: `src/pages/index.astro`

- [ ] **Step 1: Read current serialization logic**

Read `src/pages/index.astro` to find the `serializedTrackers` map block where `TrackerCardData` objects are built.

- [ ] **Step 2: Add media extraction from latest event file**

Inside the tracker serialization loop (after the `digestSummary` population), add:

```typescript
// Extract latest event media (Tier 1-2 only)
let latestEventMedia: { url: string; source: string; tier: number } | undefined;
try {
  const events = (data as any).timeline?.flatMap((era: any) => era.events) || [];
  // Also check partitioned daily events
  const allEvents = [...events];
  // Find the most recent event with media from a Tier 1-2 source
  for (const evt of allEvents.reverse()) {
    if (evt.media?.length > 0) {
      const img = evt.media.find((m: any) => m.type === 'image');
      if (img) {
        // Check sources for tier
        const bestSource = evt.sources?.find((s: any) => s.tier <= 2);
        if (bestSource) {
          latestEventMedia = {
            url: img.url,
            source: img.source || bestSource.name,
            tier: bestSource.tier,
          };
          break;
        }
      }
    }
  }
} catch {}
```

Add `latestEventMedia` to the returned TrackerCardData object.

- [ ] **Step 3: Verify build**

Run: `npm run build 2>&1 | tail -3`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/pages/index.astro
git commit -m "feat(data): populate latestEventMedia from event files at build time"
```

---

### Task 3: Create mobile-stories.css

**Files:**
- Create: `src/styles/mobile-stories.css`
- Modify: `src/styles/global.css` (add import)

- [ ] **Step 1: Write the CSS file**

Create `src/styles/mobile-stories.css` with all story carousel styles. Key classes:

```css
/* ── Mobile Story Carousel ── */

/* Only visible on mobile */
.story-carousel {
  display: none;
}

@media (max-width: 767px) {
  .story-carousel {
    display: block;
    width: 100%;
    background: var(--bg-primary);
    padding: 12px 0 0;
  }

  /* Circle row */
  .story-circles {
    display: flex;
    gap: 12px;
    padding: 0 16px 12px;
    overflow-x: auto;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }
  .story-circles::-webkit-scrollbar { display: none; }

  .story-circle {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  .story-circle-ring {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    padding: 3px;
    background: var(--border);
    transition: all 0.3s;
  }

  .story-circle-ring.active {
    background: linear-gradient(135deg, var(--accent-red), var(--accent-amber), var(--accent-blue));
    animation: ring-rotate 3s linear infinite;
  }

  .story-circle-ring.seen {
    opacity: 0.4;
  }

  .story-circle-inner {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    background: var(--bg-card);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 22px;
  }

  .story-circle-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.45rem;
    letter-spacing: 0.08em;
    color: var(--text-muted);
    text-transform: uppercase;
    max-width: 56px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: center;
  }

  @keyframes ring-rotate {
    from { filter: hue-rotate(0deg); }
    to { filter: hue-rotate(360deg); }
  }

  /* Story card */
  .story-card {
    position: relative;
    background: var(--bg-secondary);
    border-top: 1px solid var(--border);
    overflow: hidden;
  }

  /* Progress bars */
  .story-progress {
    display: flex;
    gap: 3px;
    padding: 8px 12px 4px;
  }

  .story-progress-segment {
    flex: 1;
    height: 2px;
    background: var(--border);
    border-radius: 1px;
    overflow: hidden;
  }

  .story-progress-fill {
    height: 100%;
    background: var(--accent-blue);
    border-radius: 1px;
    transition: width 0.3s linear;
  }

  .story-progress-segment.complete .story-progress-fill {
    width: 100% !important;
  }

  .story-progress-segment.upcoming .story-progress-fill {
    width: 0 !important;
  }

  /* Story header */
  .story-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
  }

  .story-avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
  }

  .story-meta {
    flex: 1;
  }

  .story-name {
    font-family: 'DM Sans', sans-serif;
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  .story-date {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.5rem;
    color: var(--text-muted);
  }

  .story-live-badge {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.5rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: var(--accent-red);
    padding: 2px 6px;
    background: var(--accent-red-dim);
    border-radius: 3px;
  }

  /* Image area */
  .story-image {
    width: 100%;
    height: 200px;
    position: relative;
    overflow: hidden;
  }

  .story-image img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .story-image-map {
    width: 100%;
    height: 100%;
    filter: brightness(0.3) saturate(0.5);
    object-fit: cover;
  }

  .story-image-gradient {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 48px;
    opacity: 0.4;
  }

  .story-image-attribution {
    position: absolute;
    bottom: 6px;
    right: 8px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.4rem;
    color: rgba(255, 255, 255, 0.5);
    background: rgba(0, 0, 0, 0.6);
    padding: 2px 5px;
    border-radius: 2px;
  }

  .story-map-markers {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .story-map-marker {
    position: absolute;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    transform: translate(-50%, -50%);
    box-shadow: 0 0 6px currentColor;
  }

  /* Content area */
  .story-content {
    padding: 12px 16px;
  }

  .story-headline {
    font-family: 'DM Sans', sans-serif;
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--text-primary);
    line-height: 1.3;
    margin-bottom: 6px;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .story-summary {
    font-family: 'DM Sans', sans-serif;
    font-size: 0.75rem;
    color: var(--text-secondary);
    line-height: 1.5;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
    margin-bottom: 10px;
  }

  /* KPI strip */
  .story-kpis {
    display: flex;
    gap: 6px;
  }

  .story-kpi {
    flex: 1;
    background: var(--bg-card);
    border-radius: 4px;
    padding: 6px;
    text-align: center;
  }

  .story-kpi-value {
    font-family: 'Cormorant Garamond', serif;
    font-size: 1.1rem;
    font-weight: 700;
    color: var(--accent-red);
  }

  .story-kpi-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.4rem;
    letter-spacing: 0.1em;
    color: var(--text-muted);
    text-transform: uppercase;
  }

  /* Swipe up hint */
  .story-swipe-hint {
    text-align: center;
    padding: 10px 0 6px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.5rem;
    color: var(--text-muted);
    letter-spacing: 0.1em;
  }

  /* Touch zones */
  .story-touch-left,
  .story-touch-right {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 30%;
    z-index: 5;
  }
  .story-touch-left { left: 0; }
  .story-touch-right { right: 0; }

  /* Transition */
  .story-card-enter {
    animation: story-fade-in 0.3s ease;
  }

  @keyframes story-fade-in {
    from { opacity: 0; transform: translateX(8px); }
    to { opacity: 1; transform: translateX(0); }
  }
}
```

- [ ] **Step 2: Import in global.css**

Add to `src/styles/global.css` after the broadcast import:
```css
@import './mobile-stories.css';
```

- [ ] **Step 3: Verify build**

Run: `npm run build 2>&1 | tail -3`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/styles/mobile-stories.css src/styles/global.css
git commit -m "feat(mobile): add story carousel CSS with circle row, card, and KPI strip"
```

---

### Task 4: Create MobileStoryCarousel component

**Files:**
- Create: `src/components/islands/CommandCenter/MobileStoryCarousel.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/islands/CommandCenter/MobileStoryCarousel.tsx`. This is the core component — circle row + story card with auto-advance, tap navigation, swipe-up, and 3-tier image fallback.

The component:
- Accepts `trackers: TrackerCardData[]` and `basePath: string`
- Filters to active trackers with headlines, sorted by lastUpdated desc
- Uses `useState` for `currentIndex`, `paused`, `seenSlugs`
- Uses `useEffect` with a 10s interval for auto-advance (clears on pause)
- Renders circle row (scrollable) + story card
- Image resolution: checks `latestEventMedia` → `mapCenter` (OSM tile) → domain gradient
- Touch zones: left 30% = prev, right 30% = next, center = pause
- Swipe up detection via `onTouchStart`/`onTouchEnd` y-delta > 50px → navigate to tracker

Key helper for map tile URL:
```typescript
function mapTileUrl(lat: number, lon: number, zoom = 5): string {
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lon + 180) / 360) * n);
  const y = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n);
  return `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`;
}
```

Domain gradient map:
```typescript
const DOMAIN_GRADIENTS: Record<string, string> = {
  military: 'linear-gradient(135deg, #1a0a0a, #2c1010, #0d1117)',
  conflict: 'linear-gradient(135deg, #1a0a0a, #2c1010, #0d1117)',
  politics: 'linear-gradient(135deg, #0a0a1a, #101030, #0d1117)',
  sports: 'linear-gradient(135deg, #0a1a0a, #102010, #0d1117)',
  crisis: 'linear-gradient(135deg, #1a0f00, #2c1a05, #0d1117)',
  culture: 'linear-gradient(135deg, #1a0a1a, #2c102c, #0d1117)',
  default: 'linear-gradient(135deg, #12141a, #181b23, #0d1117)',
};
```

KPI color cycling:
```typescript
const KPI_COLORS = ['var(--accent-red)', 'var(--accent-amber)', 'var(--accent-blue)'];
```

- [ ] **Step 2: Verify build**

Run: `npm run build 2>&1 | tail -3`
Expected: Build succeeds (component created but not yet rendered)

- [ ] **Step 3: Commit**

```bash
git add src/components/islands/CommandCenter/MobileStoryCarousel.tsx
git commit -m "feat(mobile): create MobileStoryCarousel with auto-advance and 3-tier images"
```

---

### Task 5: Integrate into CommandCenter

**Files:**
- Modify: `src/components/islands/CommandCenter/CommandCenter.tsx`

- [ ] **Step 1: Read CommandCenter.tsx**

Read the full file to find the mobile layout area and understand where to conditionally render the carousel.

- [ ] **Step 2: Add mobile detection and carousel rendering**

Add to CommandCenter.tsx:

1. Import the carousel:
```typescript
import MobileStoryCarousel from './MobileStoryCarousel';
```

2. Add mobile detection state:
```typescript
const [isMobile, setIsMobile] = useState(false);
useEffect(() => {
  const check = () => setIsMobile(window.innerWidth < 768);
  check();
  window.addEventListener('resize', check);
  return () => window.removeEventListener('resize', check);
}, []);
```

3. Render the carousel inside the globe container div, before or after `<GlobePanel>`, conditionally on mobile:
```tsx
{isMobile && (
  <MobileStoryCarousel trackers={trackers} basePath={basePath} />
)}
```

The globe will still render on mobile (it's CSS-hidden via `command-center-mobile.css`), but the story carousel overlays/replaces it visually.

- [ ] **Step 3: Verify build**

Run: `npm run build 2>&1 | tail -3`
Expected: Build succeeds

- [ ] **Step 4: Test on mobile viewport**

Run: `npm run dev`
Open browser at localhost:4321, set viewport to 375px width.
Expected: Circle row + story card visible, auto-advancing every 10s.

- [ ] **Step 5: Verify desktop unaffected**

Set viewport to 1200px width.
Expected: No carousel visible, globe + sidebar as before.

- [ ] **Step 6: Commit**

```bash
git add src/components/islands/CommandCenter/CommandCenter.tsx
git commit -m "feat(mobile): integrate story carousel into homepage mobile view"
```

---

### Task 6: Final verification and push

- [ ] **Step 1: Full build check**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds with all pages

- [ ] **Step 2: Run tests**

Run: `npm run test`
Expected: All tests pass

- [ ] **Step 3: Push**

```bash
git push origin main
```

- [ ] **Step 4: Verify deploy**

Check GitHub Actions for deploy workflow success.
