# UnifiedTimelineBar Implementation Plan (Phase 1)

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 2D `TimelineSlider.tsx` (218 lines) and 3D `CesiumTimelineBar.tsx` (684 lines) with a single shared `UnifiedTimelineBar` component, giving the 2D map zoom levels, always-visible intra-day timeline, minimap, and clocks.

**Architecture:** Extract shared pure functions into `timeline-bar-utils.ts`. Build `UnifiedTimelineBar.tsx` as a discriminated union component (`context: '2d' | '3d'`) that renders the same UI rows for both contexts, with context-specific behavior for speed options, time source, and stats. CSS uses a new `utl-` namespace in a dedicated file imported by both pages.

**Tech Stack:** React 18, TypeScript, Astro 5, CSS custom properties

**Spec:** `docs/superpowers/specs/2026-03-19-unified-dashboard-design.md` (Phase 1 section)

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/lib/timeline-bar-utils.ts` | Pure functions, types, constants shared by both contexts |
| Create | `src/components/islands/UnifiedTimelineBar.tsx` | Merged timeline bar component (controls, zoom, slider, intra-day, stats, legend) |
| Create | `src/styles/unified-timeline.css` | All timeline bar styles with `utl-` namespace |
| Modify | `src/components/islands/IntelMap.tsx` | Replace TimelineSlider import, pass new props |
| Modify | `src/components/islands/CesiumGlobe/CesiumGlobe.tsx` | Replace CesiumTimelineBar import, pass new props |
| Modify | `src/styles/global.css` | Remove `map-tl-*` CSS, add `@import` for unified-timeline.css |
| Modify | `src/styles/globe.css` | Remove `globe-tl-*` CSS, add `@import` for unified-timeline.css |
| Delete | `src/components/islands/TimelineSlider.tsx` | Replaced by UnifiedTimelineBar |
| Delete | `src/components/islands/CesiumGlobe/CesiumTimelineBar.tsx` | Replaced by UnifiedTimelineBar |

---

## Chunk 1: Shared Utilities + UnifiedTimelineBar Component

### Task 1: Create timeline-bar-utils.ts

**Files:**
- Create: `src/lib/timeline-bar-utils.ts`

- [ ] **Step 1: Create the shared utils file**

Extract all duplicated pure functions from `CesiumTimelineBar.tsx` (lines 7-104, 128-210) and `TimelineSlider.tsx` (lines 28-69). These are identical or near-identical between both files.

```typescript
// src/lib/timeline-bar-utils.ts
import type { FlatEvent } from './timeline-utils';
import type { MapLine } from './schemas';

// ── Zoom types & helpers ──

export type TimelineZoomLevel = 'all' | 'year' | 'quarter' | 'month' | 'week' | 'day';

export const ZOOM_DAYS: Record<TimelineZoomLevel, number> = {
  all: Infinity, year: 365, quarter: 90, month: 30, week: 7, day: 1,
};

export const ZOOM_LABELS: Record<TimelineZoomLevel, string> = {
  all: 'ALL', year: 'YR', quarter: 'QTR', month: 'MO', week: 'WK', day: 'DAY',
};

export function computeZoomWindow(
  currentDate: string, minDate: string, maxDate: string, zoomLevel: TimelineZoomLevel,
): { viewMin: string; viewMax: string } {
  if (zoomLevel === 'all') return { viewMin: minDate, viewMax: maxDate };
  const windowDays = ZOOM_DAYS[zoomLevel];
  const halfWindow = Math.floor(windowDays / 2);
  const currentMs = new Date(currentDate + 'T00:00:00Z').getTime();
  const minMs = new Date(minDate + 'T00:00:00Z').getTime();
  const maxMs = new Date(maxDate + 'T00:00:00Z').getTime();
  const dayMs = 86400000;
  let viewMinMs = currentMs - halfWindow * dayMs;
  let viewMaxMs = viewMinMs + windowDays * dayMs;
  if (viewMinMs < minMs) { viewMinMs = minMs; viewMaxMs = Math.min(minMs + windowDays * dayMs, maxMs); }
  if (viewMaxMs > maxMs) { viewMaxMs = maxMs; viewMinMs = Math.max(maxMs - windowDays * dayMs, minMs); }
  return {
    viewMin: new Date(viewMinMs).toISOString().split('T')[0],
    viewMax: new Date(viewMaxMs).toISOString().split('T')[0],
  };
}

export function availableZoomLevels(totalDays: number): TimelineZoomLevel[] {
  if (totalDays <= 1) return [];
  const levels: TimelineZoomLevel[] = ['all'];
  if (totalDays > 365) levels.push('year');
  if (totalDays > 90) levels.push('quarter');
  if (totalDays > 30) levels.push('month');
  if (totalDays > 7) levels.push('week');
  if (totalDays > 1) levels.push('day');
  return levels;
}

export function shiftPeriod(
  currentDate: string, minDate: string, maxDate: string,
  zoomLevel: TimelineZoomLevel, direction: 1 | -1,
): string {
  if (zoomLevel === 'all') return currentDate;
  const shiftDays = ZOOM_DAYS[zoomLevel];
  const currentMs = new Date(currentDate + 'T00:00:00Z').getTime();
  const minMs = new Date(minDate + 'T00:00:00Z').getTime();
  const maxMs = new Date(maxDate + 'T00:00:00Z').getTime();
  const newMs = Math.max(minMs, Math.min(maxMs, currentMs + direction * shiftDays * 86400000));
  return new Date(newMs).toISOString().split('T')[0];
}

// ── Date/time helpers ──

export function dateToDay(date: string, minDate: string): number {
  return Math.round(
    (new Date(date + 'T00:00:00Z').getTime() - new Date(minDate + 'T00:00:00Z').getTime()) / 86400000,
  );
}

export function dayToDate(day: number, minDate: string): string {
  const d = new Date(minDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + day);
  return d.toISOString().split('T')[0];
}

export function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatTZ(ms: number, offsetHours: number): string {
  const d = new Date(ms + offsetHours * 3600000);
  return `${d.getUTCHours().toString().padStart(2, '0')}:${d.getUTCMinutes().toString().padStart(2, '0')}`;
}

export function formatHHMM(minutes: number): string {
  return `${Math.floor(minutes / 60).toString().padStart(2, '0')}:${(minutes % 60).toString().padStart(2, '0')}`;
}

export function prevEventDate(current: string, dates: string[]): string {
  for (let i = dates.length - 1; i >= 0; i--) {
    if (dates[i] < current) return dates[i];
  }
  return current;
}

export function nextEventDate(current: string, dates: string[]): string {
  for (const d of dates) {
    if (d > current) return d;
  }
  return current;
}

// ── Color constants ──

export const EVENT_TYPE_COLORS: Record<string, string> = {
  military: '#e74c3c', diplomatic: '#3498db', humanitarian: '#f39c12', economic: '#2ecc71',
};

export const LINE_CAT_COLORS: Record<string, string> = {
  strike: '#e74c3c', retaliation: '#f39c12', asset: '#3498db', front: '#ff44ff',
};

// ── Stats interface ──

export interface StatsData {
  locations: number; vectors: number;
  sats?: number; fov?: number; flights?: number; flightStatus?: string;
  quakes?: number; wx?: number; nfz?: number;
  ships?: number; shipNoKey?: boolean;
  gpsJam?: number; internetBlackout?: number; groundTruth?: number;
  historical?: boolean;
}

// ── Speed presets ──

export const SPEEDS_2D = [
  { label: '1x', value: 200 },
  { label: '2x', value: 100 },
  { label: '5x', value: 50 },
  { label: '10x', value: 25 },
  { label: 'Auto', value: 10 },
];

export const SPEEDS_3D = [
  { label: '1x', value: 1 }, { label: '2x', value: 2 },
  { label: '5x', value: 5 }, { label: '10x', value: 10 },
  { label: '30x', value: 30 }, { label: '1m', value: 60 },
  { label: '5m', value: 300 }, { label: '10m', value: 600 },
  { label: '30m', value: 1800 }, { label: '1hr', value: 3600 },
  { label: '2hr', value: 7200 }, { label: '3hr', value: 10800 },
  { label: '5hr', value: 18000 }, { label: '10hr', value: 36000 },
  { label: '24hr', value: 86400 },
];
```

- [ ] **Step 2: Verify the file compiles**

Run: `npx tsc --noEmit src/lib/timeline-bar-utils.ts 2>&1 | head -20`
Expected: No errors (or Astro project-level check: `npm run build` later)

- [ ] **Step 3: Commit**

```bash
git add src/lib/timeline-bar-utils.ts
git commit -m "refactor: extract shared timeline-bar-utils from 2D and 3D timelines"
```

---

### Task 2: Create UnifiedTimelineBar component

**Files:**
- Create: `src/components/islands/UnifiedTimelineBar.tsx`

This task merges `TimelineSlider.tsx` (218 lines) and `CesiumTimelineBar.tsx` (684 lines) into one component. The source of truth for the render logic is the existing `CesiumTimelineBar.tsx` (the richer component), with additions from `TimelineSlider.tsx` (prev/next event buttons, persist toggle).

- [ ] **Step 1: Create UnifiedTimelineBar.tsx**

The component structure:
1. **Props**: Discriminated union on `context: '2d' | '3d'`
2. **State**: `showSpeeds` popup, `clockTick` for clock updates, internal `zoomLevel` (if not controlled)
3. **Computed**: zoom window, view range, ticks, intra-day ticks, event dates, current minute
4. **Render**: 4 rows — controls, zoom+slider, intra-day (ALWAYS), stats+legend

Key behavioral changes from the existing components:
- **Intra-day always visible**: Remove the `hasIntradayEvents` conditional (CesiumTimelineBar.tsx line 534). The intra-day row renders regardless.
- **Zoom internal by default**: `useState` for zoom, but accept `zoomLevel`/`onZoomChange` props to allow parent control.
- **Speed options from props or defaults**: Accept optional `speeds` prop; default to `SPEEDS_2D` for 2D, `SPEEDS_3D` for 3D.
- **Persist toggle inline**: From 2D TimelineSlider, always visible in controls row.
- **Prev/next event buttons**: From 2D TimelineSlider, always visible in controls row.
- **Clocks**: From CesiumTimelineBar, shown when `clocks` prop provided.
- **Stats**: From CesiumTimelineBar, shown when `stats` prop provided.
- **LIVE button**: Rendered when `!isHistorical`, active when `currentDate === maxDate`.

```typescript
// src/components/islands/UnifiedTimelineBar.tsx
import { useMemo, useState, useEffect } from 'react';
import type { FlatEvent } from '../../lib/timeline-utils';
import type { MapLine } from '../../lib/schemas';
import {
  type TimelineZoomLevel, type StatsData,
  ZOOM_LABELS, SPEEDS_2D, SPEEDS_3D,
  computeZoomWindow, availableZoomLevels, shiftPeriod,
  dateToDay, dayToDate, formatDate, formatTZ, formatHHMM,
  prevEventDate, nextEventDate,
  EVENT_TYPE_COLORS, LINE_CAT_COLORS,
} from '../../lib/timeline-bar-utils';

// Re-export for consumers that imported from old files
export type { TimelineZoomLevel, StatsData };

interface BaseProps {
  minDate: string;
  maxDate: string;
  currentDate: string;
  isPlaying: boolean;
  playbackSpeed: number;
  events: FlatEvent[];
  lines?: MapLine[];
  onDateChange: (date: string) => void;
  onTogglePlay: () => void;
  onSpeedChange: (speed: number) => void;
  onGoLive: () => void;
  persistLines?: boolean;
  onTogglePersist?: () => void;
  isHistorical?: boolean;
  clocks?: { label: string; offsetHours: number }[];
  stats?: StatsData;
  speeds?: { label: string; value: number }[];
  zoomLevel?: TimelineZoomLevel;
  onZoomChange?: (level: TimelineZoomLevel) => void;
  legendItems?: { label: string; color: string }[];
}

interface MapContext extends BaseProps { context: '2d'; }
interface GlobeContext extends BaseProps {
  context: '3d';
  simTimeRef: React.RefObject<number>;
  onTimeChange?: (ms: number) => void;
}

type Props = MapContext | GlobeContext;

export default function UnifiedTimelineBar(props: Props) {
  // ... implementation follows — merge CesiumTimelineBar logic with TimelineSlider additions.
  // See detailed render sections below.
}
```

The full component body merges:
- **From CesiumTimelineBar.tsx lines 233-316**: State setup, computed values (zoom window, ticks, intra-day ticks, event dates)
- **From CesiumTimelineBar.tsx lines 318-404**: Controls row render (prev/next/play/speed/live/date/clocks) — add persist toggle from TimelineSlider line 165-171
- **From CesiumTimelineBar.tsx lines 406-452**: Zoom controls row render (unchanged)
- **From CesiumTimelineBar.tsx lines 456-530**: Day slider / intra-day render — MODIFIED: always show both day slider AND intra-day (remove the `zoomLevel === 'day'` ternary that hides the day slider)
- **From CesiumTimelineBar.tsx lines 534-580**: Second intra-day render — MODIFIED: remove `hasIntradayEvents` conditional, always render
- **From CesiumTimelineBar.tsx lines 582-681**: Stats row + legend render (unchanged)

Key modifications to the merge:
1. Replace `mode === 'live'` check (line 376) with `currentDate === maxDate` for LIVE active state
2. Replace hardcoded `SPEEDS` with `props.speeds ?? (props.context === '3d' ? SPEEDS_3D : SPEEDS_2D)`
3. Replace `globe-tl-*` and `map-tl-*` class names with `utl-*` namespace
4. Add `data-context={props.context}` to root div for CSS context overrides
5. For zoom: use `props.zoomLevel`/`props.onZoomChange` if provided, else internal state
6. For `simMs`: use `props.context === '3d' ? props.simTimeRef.current ?? Date.now() : Date.now()` for live trackers, or `new Date(props.currentDate + 'T00:00:00Z').getTime()` for historical
7. Remove the `zoomLevel !== 'day' && hasIntradayEvents` conditional — always render intra-day row below the day slider
8. When `zoomLevel === 'day'`, show ONLY the intra-day row (existing behavior). Otherwise, show day slider THEN intra-day row below it (new: always visible).

- [ ] **Step 2: Verify the file compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/islands/UnifiedTimelineBar.tsx
git commit -m "feat: create UnifiedTimelineBar merging 2D and 3D timeline components"
```

---

### Task 3: Create unified-timeline.css

**Files:**
- Create: `src/styles/unified-timeline.css`

- [ ] **Step 1: Create the unified CSS file**

Consolidate all timeline styles from `global.css` (`map-tl-*` classes) and `globe.css` (`globe-tl-*` classes) into `utl-*` namespace. The globe CSS is the superset — use it as the base and add 2D-specific overrides.

Source mappings:
- `globe-timeline-enhanced` → `utl-bar`
- `globe-tl-controls` → `utl-controls`
- `globe-tl-btn` → `utl-btn`
- `globe-tl-play` → `utl-play`
- `globe-tl-settings` → `utl-settings`
- `globe-tl-gear` → `utl-gear`
- `globe-tl-speed-badge` → `utl-speed-badge`
- `globe-tl-speed-popup` → `utl-speed-popup`
- `globe-tl-speed-btn` → `utl-speed-btn`
- `globe-tl-live` → `utl-live`
- `globe-tl-live-dot` → `utl-live-dot`
- `globe-tl-current-date` → `utl-current-date`
- `globe-tl-event-badge` → `utl-event-badge`
- `globe-tl-clocks` → `utl-clocks`
- `globe-tl-clock` → `utl-clock`
- `globe-tl-clock-label` → `utl-clock-label`
- `globe-tl-zoom-controls` → `utl-zoom-controls`
- `globe-tl-zoom-btn` → `utl-zoom-btn`
- `globe-tl-zoom-shift` → `utl-zoom-shift`
- `globe-tl-minimap` → `utl-minimap`
- `globe-tl-minimap-viewport` → `utl-minimap-viewport`
- `globe-tl-minimap-cursor` → `utl-minimap-cursor`
- `globe-tl-track-container` → `utl-track-container`
- `globe-tl-track` → `utl-track`
- `globe-tl-tick` → `utl-tick`
- `globe-tl-slider` → `utl-slider`
- `globe-tl-date-edge` → `utl-date-edge`
- `globe-tl-intraday` → `utl-intraday`
- `globe-tl-intraday-label` → `utl-intraday-label`
- `globe-tl-intraday-track` → `utl-intraday-track`
- `globe-tl-intraday-hour` → `utl-intraday-hour`
- `globe-tl-intraday-tick` → `utl-intraday-tick`
- `globe-tl-intraday-slider` → `utl-intraday-slider`
- `globe-tl-stats` → `utl-stats`
- `globe-tl-stats-sep` → `utl-stats-sep`
- `globe-tl-legend` → `utl-legend`
- `globe-tl-legend-item` → `utl-legend-item`
- `map-tl-persist` → `utl-persist`

Context-specific overrides at the top of the file:

```css
/* Positioning: 2D sits inside map container, 3D floats at viewport bottom */
.utl-bar[data-context="2d"] {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 10;
  border-radius: 0;
}
.utl-bar[data-context="3d"] {
  position: fixed;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  width: 90%;
  max-width: 900px;
  z-index: 20;
  border-radius: 10px;
}
```

Copy all `globe-tl-*` rule bodies from `src/styles/globe.css` (lines 562-1000), renaming classes to `utl-*`. Add the `utl-persist` button styles from `map-tl-persist` in `global.css`.

- [ ] **Step 2: Commit**

```bash
git add src/styles/unified-timeline.css
git commit -m "feat: create unified-timeline.css with utl-* namespace"
```

---

## Chunk 2: Wire Into Parents + Cleanup

### Task 4: Wire UnifiedTimelineBar into IntelMap (2D)

**Files:**
- Modify: `src/components/islands/IntelMap.tsx`

- [ ] **Step 1: Replace TimelineSlider import and usage**

In `src/components/islands/IntelMap.tsx`:

**Note on `dateToDay` behavior change**: The old `TimelineSlider.tsx` used `new Date(date)` (local timezone) while the unified version uses `new Date(date + 'T00:00:00Z')` (UTC). This is the correct behavior for a dashboard dealing with UTC dates, but it means day boundaries shift slightly for users in non-UTC timezones. This is a fix, not a regression.

1. Replace import (line 7):
   ```typescript
   // OLD: import TimelineSlider from './TimelineSlider';
   import UnifiedTimelineBar from './UnifiedTimelineBar';
   ```

2. Replace the `<TimelineSlider>` usage (lines 289-302) with:
   ```tsx
   <UnifiedTimelineBar
     context="2d"
     minDate={dateRange.min}
     maxDate={dateRange.max}
     currentDate={currentDate}
     isPlaying={isPlaying}
     playbackSpeed={playbackSpeed}
     events={events}
     lines={lines}
     persistLines={persistLines}
     onDateChange={setCurrentDate}
     onTogglePlay={togglePlay}
     onSpeedChange={handleSpeedChange}
     onTogglePersist={togglePersist}
     onGoLive={() => setCurrentDate(dateRange.max)}
     stats={{ locations: filteredPoints.length, vectors: filteredLines.length }}
   />
   ```

3. Remove the `map-stats-overlay` div (lines 232-248) since stats are now in the timeline bar.

- [ ] **Step 2: Verify 2D dashboard builds**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds, no type errors

- [ ] **Step 3: Commit**

```bash
git add src/components/islands/IntelMap.tsx
git commit -m "feat: wire UnifiedTimelineBar into 2D IntelMap"
```

---

### Task 5: Wire UnifiedTimelineBar into CesiumGlobe (3D)

**Files:**
- Modify: `src/components/islands/CesiumGlobe/CesiumGlobe.tsx`

- [ ] **Step 1: Replace CesiumTimelineBar import and usage**

In `src/components/islands/CesiumGlobe/CesiumGlobe.tsx`:

1. Replace import:
   ```typescript
   // OLD: import CesiumTimelineBar, { type TimelineZoomLevel } from './CesiumTimelineBar';
   import UnifiedTimelineBar from '../UnifiedTimelineBar';
   import type { TimelineZoomLevel } from '../../../lib/timeline-bar-utils';
   ```

2. Find the `<CesiumTimelineBar>` usage (line 544) and replace with:
   ```tsx
   <UnifiedTimelineBar
     context="3d"
     minDate={minDate}
     maxDate={maxDate}
     currentDate={currentDate}
     isPlaying={isPlaying}
     playbackSpeed={playbackSpeed}
     events={events}
     lines={lines}
     onDateChange={handleDateChange}
     onTogglePlay={togglePlay}
     onSpeedChange={setPlaybackSpeed}
     onGoLive={goLive}
     onTimeChange={handleTimeChange}
     simTimeRef={simTimeRef}
     stats={stats}
     zoomLevel={zoomLevel}
     onZoomChange={setZoomLevel}
     isHistorical={isHistorical}
     clocks={clocks}
   />
   ```

   Note: Use the actual callback names from CesiumGlobe.tsx: `setPlaybackSpeed` (line 555), `goLive` (line 556). The existing CesiumGlobe.tsx already has `zoomLevel` state and passes it as a prop. Keep this pattern (controlled zoom) since CesiumGlobe also passes `zoomLevel` to `CesiumControls`.

3. Keep the existing `zoomLevel` state in CesiumGlobe.tsx — do NOT remove it. The `TimelineZoomLevel` type import (line 28) changes from `'./CesiumTimelineBar'` to `'../../../lib/timeline-bar-utils'`. There is no `StatsData` import to change — CesiumGlobe constructs stats via structural typing.

- [ ] **Step 2: Verify 3D globe builds**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds, no type errors

- [ ] **Step 3: Commit**

```bash
git add src/components/islands/CesiumGlobe/CesiumGlobe.tsx
git commit -m "feat: wire UnifiedTimelineBar into 3D CesiumGlobe"
```

---

### Task 6: Add CSS imports to page stylesheets

**Files:**
- Modify: `src/styles/global.css`
- Modify: `src/styles/globe.css`

- [ ] **Step 1: Add @import to global.css**

At the top of `src/styles/global.css` (after any existing imports), add:
```css
@import './unified-timeline.css';
```

- [ ] **Step 2: Add @import to globe.css**

At the top of `src/styles/globe.css` (after any existing imports), add:
```css
@import './unified-timeline.css';
```

Both `globe.css` and `unified-timeline.css` live in `src/styles/`, so the path is `./`.

- [ ] **Step 3: Build and verify both pages render**

Run: `npm run build 2>&1 | tail -10`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/styles/global.css src/styles/globe.css
git commit -m "feat: import unified-timeline.css in both page stylesheets"
```

---

### Task 7: Delete old files and old CSS

**Files:**
- Delete: `src/components/islands/TimelineSlider.tsx`
- Delete: `src/components/islands/CesiumGlobe/CesiumTimelineBar.tsx`
- Modify: `src/styles/global.css` (remove `map-tl-*` rules)
- Modify: `src/styles/globe.css` (remove `globe-tl-*` rules)

- [ ] **Step 1: Delete old component files**

```bash
rm src/components/islands/TimelineSlider.tsx
rm src/components/islands/CesiumGlobe/CesiumTimelineBar.tsx
```

- [ ] **Step 2: Remove map-tl-* CSS from global.css**

Search for all `.map-tl-` rules in `src/styles/global.css` and remove them. These are the rules for the old 2D timeline slider. Use grep to find the line range:

```bash
grep -n 'map-tl-' src/styles/global.css | head -5
grep -n 'map-tl-' src/styles/global.css | tail -5
```

Remove ALL `map-tl-*` rules. They are in three locations:
- Main block: lines ~2304-2546
- Media query rules: lines ~3095-3105 (inside `@media (max-width: 768px)`)
- Persist button rules: lines ~3157-3183

Use this grep to verify all are found and removed:
```bash
grep -c 'map-tl-' src/styles/global.css
```
Expected after removal: 0 matches.

Also remove the now-dead `.map-stats-overlay`, `.map-stats-sep`, `.map-stats-overlays`, `.map-stats-flights` rules (stats moved into timeline bar).

- [ ] **Step 3: Remove globe-tl-* CSS from globe.css**

Search for all `.globe-tl-` and `.globe-timeline-enhanced` rules in `src/styles/globe.css` and remove them. These are the rules for the old 3D timeline bar. Use grep to find the range:

```bash
grep -n 'globe-tl-\|globe-timeline-enhanced' src/styles/globe.css | head -5
grep -n 'globe-tl-\|globe-timeline-enhanced' src/styles/globe.css | tail -5
```

Remove ALL `globe-tl-*` and `globe-timeline-enhanced` rules. They are in two locations:
- Main block: lines ~562-1000
- Media query rules: lines ~1561-1585 (inside `@media (max-width: 768px)`)

Use this grep to verify all are found and removed:
```bash
grep -c 'globe-tl-\|globe-timeline-enhanced' src/styles/globe.css
```
Expected after removal: 0 matches.

- [ ] **Step 4: Verify build succeeds with no references to old files**

```bash
npm run build 2>&1 | tail -20
```

Also verify no stale imports remain:

```bash
grep -r "TimelineSlider\|CesiumTimelineBar" src/ --include="*.tsx" --include="*.ts" --include="*.astro"
```

Expected: No matches (all references replaced in Tasks 4-5).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: delete old TimelineSlider and CesiumTimelineBar, remove stale CSS"
```

---

### Task 8: Visual verification

- [ ] **Step 1: Start dev server and verify 2D dashboard**

```bash
npm run dev
```

Open `http://localhost:4321/watchboard/iran-conflict/` in browser. Verify:
- Timeline bar visible at bottom of map panel
- Controls row: prev/next, play/pause, speed gear, persist toggle, LIVE button, date + event badge
- Zoom row: ALL/MO/WK/DAY buttons visible (Iran has ~55 days, so ALL/MO/WK/DAY)
- Day slider with event tick marks
- Intra-day row ALWAYS visible below slider (with hour markers 00-24)
- Clicking zoom buttons changes the slider range
- Play/pause advances dates
- LIVE jumps to latest date

- [ ] **Step 2: Verify 3D globe**

Open `http://localhost:4321/watchboard/iran-conflict/globe/` in browser. Verify:
- Timeline bar at bottom of viewport (fixed, centered, rounded)
- All existing controls present: prev/next, play, speed gear popup, LIVE, date, clocks (TEHRAN/TLV/UTC/EST)
- Zoom buttons work (ALL/MO/WK/DAY)
- Intra-day row always visible
- Stats row shows locations, vectors, sats, flights, etc.
- Legend row shows event type dots
- Playback works at all speed levels

- [ ] **Step 3: Verify other trackers**

Open `http://localhost:4321/watchboard/ayotzinapa/` — verify 2D timeline works (long-range tracker, should show ALL/YR/QTR/MO/WK/DAY zoom levels).

Open `http://localhost:4321/watchboard/september-11/globe/` — verify historical tracker: no LIVE button, SIM clock instead of timezone clocks.

- [ ] **Step 4: Run full build**

```bash
npm run build 2>&1 | tail -5
```

Expected: Build succeeds, all pages generated (25 pages).

- [ ] **Step 5: Commit any fixes**

If visual verification revealed issues, fix and commit:
```bash
git add -A
git commit -m "fix: address visual issues in UnifiedTimelineBar"
```
