# Unified Dashboard Homologation — Design Spec

## Problem

The 2D dashboard (`/tracker/`) and 3D globe (`/tracker/globe/`) are separate experiences with duplicated but divergent control components. The 2D dashboard buries the most relevant content (latest events) behind scroll and panel toggles, while the globe has richer controls (zoom, intra-day timeline, clocks) that the 2D view lacks.

## Goals

1. Homologate 2D and 3D via shared control components (same visual language, same features)
2. Prioritize the most relevant content above the fold on the 2D dashboard
3. Make the 2D map expandable to full-viewport (immersive mode)
4. Keep both pages as separate routes for performance (no Cesium on 2D page)

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Layout model | Adaptive Hybrid (expand/collapse) | Map can go immersive or theater-width |
| Expand/collapse trigger | Scroll + Button (⛶) + Keyboard (F/Esc) | Multiple input methods for different users |
| Routing | Keep both pages, shared components | No Cesium on 2D = fast load; shared component library eliminates drift |
| Timeline | Unified bar with always-visible intra-day | Globe's intra-day row is essential for understanding current-day activity |
| KPI placement | Condensed Hero + KPI Combo strip | Saves ~250px, KPIs always visible |
| Scroll column order | Situation Brief → Latest Events → Sections | Intel briefing flow: context → news → analysis |
| Historical timeline | Moved to last section | Least urgent for daily users |

---

## Phase 1: UnifiedTimelineBar

Replace `TimelineSlider.tsx` (218 lines) and `CesiumTimelineBar.tsx` (685 lines) with a single shared component.

### New Files

#### `src/lib/timeline-bar-utils.ts` (~90 lines)

Extract all duplicated pure functions:

```typescript
export type TimelineZoomLevel = 'all' | 'year' | 'quarter' | 'month' | 'week' | 'day';

export function dateToDay(date: string, minDate: string): number
export function dayToDate(day: number, minDate: string): string
export function formatDate(iso: string): string
export function prevEventDate(current: string, dates: string[]): string
export function nextEventDate(current: string, dates: string[]): string
export function computeZoomWindow(currentDate, minDate, maxDate, zoomLevel): { viewMin, viewMax }
export function availableZoomLevels(totalDays: number): TimelineZoomLevel[]
export function shiftPeriod(currentDate, minDate, maxDate, zoomLevel, direction): string

export const EVENT_TYPE_COLORS: Record<string, string>
export const LINE_CAT_COLORS: Record<string, string>
export const ZOOM_LABELS: Record<TimelineZoomLevel, string>
export const ZOOM_DAYS: Record<TimelineZoomLevel, number>

export interface StatsData {
  locations: number; vectors: number;
  sats?: number; fov?: number; flights?: number; flightStatus?: string;
  quakes?: number; wx?: number; nfz?: number;
  ships?: number; shipNoKey?: boolean;
  gpsJam?: number; internetBlackout?: number; groundTruth?: number;
}
```

#### `src/components/islands/UnifiedTimelineBar.tsx` (~400 lines)

Discriminated union props by context:

```typescript
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
}

interface MapContext extends BaseProps { context: '2d'; }
interface GlobeContext extends BaseProps {
  context: '3d';
  simTimeRef: React.RefObject<number>;
  onTimeChange?: (ms: number) => void;
}

type Props = MapContext | GlobeContext;
```

**Component rows (top to bottom, all always rendered):**

1. **Controls**: `[◀ prev] [▶ play] [▶ next] [⚙ speed] [DAY/ALL persist] [● LIVE] [date + badge] [clocks?]`
2. **Zoom + Slider**: `[« period] [ALL] [YR] [QTR] [MO] [WK] [DAY] [» period]` + `[minDate] [===slider+ticks===] [maxDate]` + minimap
3. **Intra-day** (ALWAYS visible): `[HH:MM UTC] [===hour-marks+event-ticks===] [24:00]`
4. **Stats + Legend**: `[locations · vectors · overlays...] [● Kinetic ● Civilian ● Maritime...]`

**Context-specific behavior:**
- `context === '2d'`: speeds are ms-per-tick intervals (200/100/50/25/10); intra-day derives time from `Date.now()` for live or midnight for historical; stats show locations + vectors + overlays
- `context === '3d'`: speeds are simulation multipliers (1–86400); intra-day uses `simTimeRef.current`; stats include sats, flights, quakes, ships, GPS jamming, etc.

**Zoom state**: Exposed as optional external props for parents that need coordination:

```typescript
// Added to BaseProps:
zoomLevel?: TimelineZoomLevel;
onZoomChange?: (level: TimelineZoomLevel) => void;
```

If `zoomLevel`/`onZoomChange` are provided, the component is controlled (parent owns zoom state). If omitted, the component manages zoom internally via `useState<TimelineZoomLevel>('all')`. This preserves CesiumGlobe.tsx's current pattern where it passes `zoomLevel` to both `CesiumTimelineBar` and `CesiumControls` (line 560, 576). IntelMap.tsx can omit these props to get self-contained zoom.

**Mode handling**: The existing `CesiumTimelineBar` has `mode: 'historical' | 'live'` which controls two behaviors: (a) whether the LIVE button renders at all (`!isHistorical`), and (b) whether the LIVE button shows as active (`mode === 'live'`). The unified component replaces this with:
- `isHistorical?: boolean` — gates LIVE button rendering (false = show button)
- Active state derived from `currentDate === maxDate` — matches existing `TimelineSlider` logic (line 121)

**Speed options**: The component accepts a `speeds` prop for the gear popup:

```typescript
// Added to BaseProps:
speeds?: { label: string; value: number }[];
```

If omitted, defaults to 2D speeds: `[{label:'1x', value:200}, {label:'2x', value:100}, {label:'5x', value:50}, {label:'10x', value:25}, {label:'Auto', value:10}]`. The 3D parent passes its own 14-option array with simulation multipliers. The component just renders buttons and calls `onSpeedChange(value)`.

**Intra-day always visible**: Removes the conditional `hasIntradayEvents` check. When no intra-day events exist, the row still shows hour markers and the current time indicator.

#### `src/styles/unified-timeline.css` (~350 lines)

New CSS namespace `utl-`. Context-specific positioning via `data-context` attribute:

```css
.utl-bar[data-context="2d"] { position: absolute; bottom: 0; left: 0; right: 0; }
.utl-bar[data-context="3d"] { position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%); width: 90%; max-width: 900px; }
```

Imported by both `global.css` and `globe.css` via `@import`.

### Modified Files

**`src/components/islands/IntelMap.tsx`**: Replace `import TimelineSlider` → `import UnifiedTimelineBar`. Add `onGoLive` callback. Move stats overlay data into `stats` prop.

**`src/components/islands/CesiumGlobe/CesiumGlobe.tsx`**: Replace `import CesiumTimelineBar` → `import UnifiedTimelineBar from '../UnifiedTimelineBar'`. Remove internal `zoomLevel` state.

### Deleted Files

- `src/components/islands/TimelineSlider.tsx` (218 lines)
- `src/components/islands/CesiumGlobe/CesiumTimelineBar.tsx` (685 lines)
- `map-tl-*` CSS rules from `src/styles/global.css` (~240 lines)
- `globe-tl-*` CSS rules from `src/styles/globe.css` (~440 lines)

---

## Phase 2: Shared Controls

### `src/components/islands/UnifiedIntelFeed.tsx` (~220 lines)

Merge `MapEventsPanel.tsx` and `CesiumEventsPanel.tsx` (90% identical).

```typescript
interface Props {
  events: FlatEvent[];
  currentDate: string;
  isOpen: boolean;
  onToggle: () => void;
  activeEventId?: string | null;  // cinematic mode support (3D only)
  position?: 'absolute' | 'fixed'; // 2D uses absolute, 3D uses fixed
}
```

CSS namespace `intel-feed-*`. Positioning via `data-position` attribute.

**Deletes:** `MapEventsPanel.tsx` (201 lines), `CesiumEventsPanel.tsx` (208 lines), related CSS blocks.

### `src/components/islands/UnifiedToolbar.tsx` (~350 lines)

Unify category filter controls (inline in `IntelMap.tsx`), `MapLayerToggles.tsx`, and `CesiumControls.tsx` using the icon-bar + flyout pattern from `CesiumControls.tsx`.

```typescript
// Unified layer key mapping (normalizes 2D and 3D key differences):
// 2D LayerState keys → Unified keys ← 3D CesiumControls keys
// noFlyZones         → nfz           ← nfz
// gpsJamming         → gpsJam        ← gpsJam
// internetBlackout   → internetBlackout ← internetBlackout
// earthquakes        → quakes        ← quakes
// weather            → weather       ← weather
// flights            → flights       ← flights
// terminator         → terminator    ← (2D only)
// factCards          → factCards     ← (2D only)
// (n/a)              → satellites    ← satellites (3D only)
// (n/a)              → ships         ← ships (3D only)
// (n/a)              → groundTruth   ← groundTruth (3D only)

type UnifiedLayerKey =
  | 'nfz' | 'gpsJam' | 'internetBlackout' | 'quakes' | 'weather'
  | 'flights' | 'terminator' | 'factCards'
  | 'satellites' | 'ships' | 'groundTruth';

interface Props {
  context: '2d' | '3d';
  categories: MapCategory[];
  activeFilters: Set<string>;
  onToggleFilter: (cat: string) => void;
  pointCounts: Record<string, number>;
  layers: Partial<Record<UnifiedLayerKey, boolean>>;
  onToggleLayer: (layer: UnifiedLayerKey) => void;
  layerCounts?: Partial<Record<UnifiedLayerKey, number>>;
  persistLines: boolean;
  onTogglePersist: () => void;
  // 3D-only (optional)
  cameraPresets?: Record<string, CameraPreset>;
  onCameraPreset?: (key: string) => void;
  visualMode?: string;
  onVisualMode?: (mode: string) => void;
  // ... other 3D-specific props
}
```

The parent components (`IntelMap.tsx` and `CesiumGlobe.tsx`) must map their existing layer state keys to `UnifiedLayerKey` when constructing the `layers` prop. Example for 2D: `{ nfz: layers.noFlyZones, quakes: layers.earthquakes, ... }`.

In `2d` context: shows Filters + Layers flyouts (hides satellites, ships, groundTruth). In `3d` context: adds Camera, Visual, Cinematic flyouts (hides terminator, factCards).

**Deletes:** `MapLayerToggles.tsx` (113 lines), `CesiumControls.tsx` (406 lines), related CSS blocks.

### `src/components/islands/CompactKpiStrip.tsx` (~60 lines)

Standalone overlay KPI badges extracted from `CesiumGlobe.tsx`. Used in 3D globe and available for 2D immersive mode.

```typescript
interface Props {
  kpis: KpiItem[];
  maxVisible?: number;
  position?: 'top-left' | 'top-right';
}
```

---

## Phase 3: Adaptive 2D Layout

### Content Priority Redesign

**Condensed Hero + KPI Combo**: Replace the current `Hero.astro` (200px) + `KpiStrip.astro` (100px) with a single 50px combo strip.

```
[— DAY 19 · MARCH 18 · SITREP] [Headline (truncated)]  |  [19 days] [2,800+ killed] [13 US] [$101 Brent]
```

Saves ~250px vertical space. Theater layout starts immediately below the header.

**Scroll column reorder**:
1. SITUATION BRIEF — 2-3 sentence summary (from current hero subtitle)
2. LATEST — today's events as expandable cards (type badge, timestamp, title, sources, weapon badges)
3. Numbered sections: Military → Humanitarian → Economic → Claims → Political → Historical Timeline (moved to last)

### New Components

#### `src/components/static/HeroKpiCombo.astro`

Replaces `Hero.astro` + `KpiStrip.astro`. Single compact strip with:
- Left: dateline + truncated headline (Cormorant serif, single line with ellipsis)
- Right: inline KPI values (separated by vertical divider)

#### `src/components/islands/LatestEvents.tsx`

New React island for the LATEST section in the scroll column. Shows today's events as styled cards with:
- Type badge (colored, monospace)
- Weapon type badges
- Timestamp (UTC)
- Title (Cormorant serif)
- Summary text
- Source tier chips
- Expandable detail
- "+N more events" link

Data source: `flatEvents` filtered to latest date.

#### `src/components/islands/useImmersiveMap.ts` (~80 lines)

Hook managing expand/collapse state:

```typescript
export function useImmersiveMap(): {
  isImmersive: boolean;
  toggleImmersive: () => void;
  setImmersive: (value: boolean) => void;
  mapRef: React.RefObject<HTMLDivElement>;
}
```

- **Keyboard**: `F` toggles, `Escape` exits
- **Scroll**: IntersectionObserver on map container; immersive when at top of page
- **Button**: `toggleImmersive()` for explicit ⛶ button
- **CSS class**: Adds/removes `theater-immersive` on `.theater-layout`
- **Leaflet resize**: Calls `invalidateSize()` after transition via ResizeObserver

#### `src/components/islands/ImmersiveToggle.tsx` (~30 lines)

Small button component with ⛶ icon, positioned top-right of map panel.

### CSS Changes

**`src/styles/global.css`** — add immersive theater rules:

```css
.theater-layout.theater-immersive {
  grid-template-columns: 1fr;
}
.theater-layout.theater-immersive .theater-map {
  height: 100vh;
  top: 0;
  z-index: 100;
  padding: 0;
}
.theater-layout.theater-immersive .theater-scroll {
  display: none;
}
```

Smooth transition via `transition: grid-template-columns 0.3s ease`.

### Page Changes

**`src/pages/[tracker]/index.astro`**:
- Replace `<Hero>` + `<KpiStrip>` with `<HeroKpiCombo>`
- Add `<LatestEvents>` as first child in `.theater-scroll`
- Move `<TimelineSection>` to last position in scroll column
- Add `id="theater-layout"` to theater div

---

## File Change Summary

| Phase | Created | Deleted | Modified | Net Lines |
|-------|---------|---------|----------|-----------|
| 1. UnifiedTimeline | 3 files (+840) | 2 files + CSS (-1583) | 2 files | -743 |
| 2. SharedControls | 3 files (+630) | 4 files + CSS (-1278) | 2 files | -648 |
| 3. AdaptiveLayout | 4 files (+370) | 0 | 3 files | +370 |
| **Total** | **10 files** | **6 files** | **7 files** | **-1,021** |

## Deployment Strategy

Each phase is independently deployable:

- **Phase 1**: Both pages use UnifiedTimelineBar. 2D gains zoom + intra-day. 3D unchanged. Safe rollback: revert the import.
- **Phase 2**: Shared toolbar + intel feed. Riskiest phase (most state wiring). Test both views thoroughly.
- **Phase 3**: 2D layout only. Does not touch 3D globe. Content priority + immersive mode.

## Challenges

1. **Speed model divergence**: 2D uses ms-per-tick (200, 100, 50, 25, 10), 3D uses simulation multipliers (1–86400). UnifiedTimelineBar keeps speed interpretation in the parent; it just displays options and calls `onSpeedChange` with the appropriate value per context.

2. **Leaflet invalidateSize**: When map transitions to immersive, Leaflet needs `invalidateSize()` after CSS transition completes. Use ResizeObserver on the map container.

3. **CSS namespace collisions**: Both `global.css` and `globe.css` style slider thumbs. Unified CSS uses distinct `utl-` namespace to avoid conflicts.

4. **simTimeRef in 2D**: The 2D IntelMap has no continuous simulation time. UnifiedTimelineBar uses `Date.now()` for live trackers or midnight of `currentDate` for historical trackers when `simTimeRef` is absent.

5. **HeroKpiCombo headline truncation**: Long headlines must be truncated with ellipsis in the compact strip. The full headline is still available in the situation brief. Mobile: KPIs wrap below headline; show first 4, hide rest behind `+N` expand.

6. **CSS migration strategy**: Old class namespaces (`map-tl-*`, `globe-tl-*`, `map-events-*`, `globe-events-*`, `map-layers-*`) are deleted wholesale from their respective stylesheets and replaced by the new unified namespaces (`utl-*`, `intel-feed-*`, `toolbar-*`). No backward-compatible aliases — the old components are deleted in the same commit as the old CSS. Each phase is a single atomic commit: new component + new CSS + parent wiring + old component deletion + old CSS deletion.

7. **LatestEvents date source**: Filters events to `maxDate` from the tracker data (the most recent date with data), not the map's `currentDate` playback state. This ensures the LATEST section always shows the newest events regardless of timeline position. The component receives `latestDate` as a prop from `index.astro`, computed at build time.

8. **Immersive scroll trigger**: `useImmersiveMap` uses an IntersectionObserver on a sentinel `<div>` placed above the theater layout (e.g., the HeroKpiCombo). When this sentinel is fully visible (threshold: 1.0), the map can expand. When the user scrolls past it (intersection ratio drops to 0), the map collapses to theater mode. The `F` key and ⛶ button override this at any scroll position.

9. **Leaflet invalidateSize integration**: `LeafletMap.tsx` already uses `useMap()` from react-leaflet internally. Add a `ResizeObserver` on the map container div within `LeafletMap.tsx` that calls `map.invalidateSize()` on any size change. This is self-contained — no ref forwarding needed from `useImmersiveMap`.

10. **CompactKpiStrip data flow in 2D immersive**: KPI data is passed as a serialized JSON prop on the `IntelMap` React island in `index.astro`: `kpis={JSON.stringify(data.kpis)}`. IntelMap deserializes and passes to `CompactKpiStrip` when `isImmersive` is true.

11. **Accessibility**: All unified components must preserve existing `aria-label`, `aria-pressed`, and `aria-valuetext` attributes. The `F` keyboard shortcut for immersive toggle only fires when no input/textarea is focused (check `document.activeElement.tagName`). `Escape` follows the same guard.

---

## Not In Scope

The following components are **not unified** in this spec and remain page-specific:

- `CesiumInfoPanel.tsx` — 3D-specific point detail panel (uses Cesium entity data)
- `CesiumHud.tsx` — military HUD overlay (3D only, no 2D equivalent)
- `MobileBottomSheet.tsx` — 3D mobile navigation (2D uses responsive theater collapse)
- `MapArcAnimator.tsx` — 2D arc animation (Leaflet-specific)
- `MapFactCards.tsx` — 2D fact card overlay (Leaflet-specific)

---

## Testing

### Phase 1 (UnifiedTimelineBar)

Manual verification:
1. 2D dashboard: zoom buttons appear, all levels work (ALL/MO/WK/DAY), minimap shows viewport
2. 2D dashboard: intra-day row always visible, shows hour markers even when no timed events
3. 2D dashboard: prev/next event, play/pause, speed, persist, LIVE all functional
4. 3D globe: all existing timeline behavior preserved (zoom, intra-day, clocks, stats, legend)
5. 3D globe: playback across zoom levels, live mode, period shift
6. Both: `npm run build` succeeds with no type errors

### Phase 2 (Shared Controls)

Manual verification:
1. 2D: filter toggles work, layer toggles work, counts update
2. 3D: all toolbar flyouts work (filters, camera, visual, layers, cinematic)
3. 2D: intel feed opens/closes, shows events for current date
4. 3D: intel feed with cinematic mode highlighting
5. Both: mobile responsive behavior (bottom sheet on 3D, collapsed panels on 2D)

### Phase 3 (Adaptive Layout)

Manual verification:
1. Page loads with HeroKpiCombo strip, headline + KPIs visible
2. Scroll column starts with Situation Brief → Latest Events → sections
3. Historical Timeline appears last
4. Immersive: click ⛶ button — map expands full viewport
5. Immersive: press F — same behavior
6. Immersive: press Esc — map collapses to theater
7. Immersive: scroll behavior — map expands at top, collapses when scrolling past
8. Immersive: Leaflet map resizes correctly (no gray tiles)
9. Mobile: KPIs wrap, immersive button works on touch

### Rollback

Each phase is a single git commit. Rollback = `git revert <commit>`. Old files are restored by the revert since deletion and creation happen atomically.
