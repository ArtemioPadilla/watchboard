# Mobile Unified Dashboard — Design Spec

## Problem

The 2D dashboard and 3D globe have completely different mobile experiences. The 2D page stacks vertically (map 35vh + long scroll through all sections), while the 3D globe hides all desktop overlays and uses a `MobileBottomSheet` with 3 tabs (MAP/INTEL/STATS). Users get two inconsistent paradigms depending on which page they're on. The 2D mobile also suffers from a cramped map (35vh) and forces users to scroll through everything linearly.

## Goals

1. Unify mobile UX across 2D and 3D into a single app-like tab navigation
2. Give the map full viewport space on mobile
3. Make the most relevant content (latest events) accessible in one tap
4. Support both 2D Leaflet and 3D Cesium via an in-header toggle
5. On tablet, let users choose between scroll-based "reader" mode and tab-based "app" mode

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Mobile layout | App-like bottom tab navigation | Each section gets full screen; map isn't cramped |
| Tabs | MAP / FEED / DATA / INTEL | Groups content by urgency and purpose |
| 2D/3D toggle | Segmented control in header bar | Always visible, discoverable, out of the way |
| Globe mobile | Same tab bar (kill MobileBottomSheet) | One experience, not two |
| Tab bar position | Fixed at viewport bottom (`position: fixed; bottom: 0`) | Never jumps — stays anchored regardless of content height |
| Tablet (768–1024px) | User toggle: Reader mode / App mode | Maximum flexibility for different use patterns |
| Breakpoint | Tabs activate at ≤768px (or when App mode chosen on tablet) | Matches existing primary mobile breakpoint |

---

## Prerequisites

This spec can be implemented **independently of Phases 2 and 3** of the unified dashboard spec. However:

- **Phase 1 (UnifiedTimelineBar)**: REQUIRED — already implemented. The mobile MAP tab uses `UnifiedTimelineBar`.
- **Phase 2 (Shared Controls)**: NOT required. The mobile tab shell has its own filter/layer UI. When Phase 2 ships, the `UnifiedToolbar` can replace the inline filter chips.
- **Phase 3 (Adaptive Layout / useImmersiveMap)**: NOT required for initial mobile implementation. The expand (⛶) button on mobile uses a simpler fullscreen approach — just toggle `display: none` on header and tab bar. The `useImmersiveMap` hook (scroll-driven) is desktop-only. When Phase 3 ships, the mobile expand can adopt it.

Components referenced from Phases 2-3 (`CompactKpiStrip`, `LatestEvents`, `HeroKpiCombo`) are implemented inline in the mobile tab components for now. They can be extracted into shared components when those phases land.

---

## Layout Structure

```
┌─────────────────────────┐
│ Header (fixed top)       │  ← 44px: live dot, operation name, 2D/3D segmented toggle
├─────────────────────────┤
│ Sub-tabs (if applicable) │  ← DATA and INTEL tabs have secondary tab rows
├─────────────────────────┤
│                         │
│   Content area          │  ← Scrollable, fills remaining viewport
│   (per-tab, scrollable) │     padding-bottom to clear tab bar
│                         │
├─────────────────────────┤
│ Tab bar (fixed bottom)  │  ← 52px: MAP / FEED / DATA / INTEL icons + labels
└─────────────────────────┘
```

The tab bar is `position: fixed; bottom: 0; left: 0; right: 0` — it never moves regardless of content height. Content area uses `padding-bottom: 52px` (tab bar height) to prevent overlap.

---

## Tab Definitions

### MAP Tab

Full-viewport map with timeline controls. This is the primary view.

**Contents:**
- Compact KPI row below header (inline metrics: `19d · 2.8K · 13 · $101`)
- Full-viewport Leaflet (2D) or Cesium (3D) map filling remaining space
- Filter chips overlay (top-left of map)
- Expand button (⛶) — hides header, KPIs, and tab bar for true full-screen map
- UnifiedTimelineBar at bottom of map (compact mode: controls + slider + intra-day, no stats row on mobile)

**2D/3D behavior:**
- 2D: Leaflet map with all existing overlays (filters, layers, info panel, events panel)
- 3D: Cesium globe with all existing features (camera presets, visual modes, satellites, etc.)
- Switching 2D↔3D preserves the current date, zoom level, and active filters

**Expand (⛶) mode:**
- Hides header, KPI row, and tab bar
- Map + timeline fill 100% viewport
- Tap ⛶ again or swipe down to restore chrome
- Same `useImmersiveMap` hook from Phase 3 desktop design

### FEED Tab

Latest events in reverse chronological order. The intel briefing.

**Contents:**
- Situation brief (2-3 sentences from hero subtitle)
- "LATEST · N events" header with event count
- Event cards (scrollable list):
  - Type badge (KINETIC / DIPLOMATIC / ESCALATION / etc.) — color-coded
  - Timestamp (UTC)
  - Title (Cormorant serif)
  - Summary text (1-2 lines)
  - Source tier chips (T1/T2/T3/T4)
  - Weapon type badges (if applicable)
  - Expandable detail on tap
- "+N more events" link at bottom

**Data source:** `flatEvents` filtered to `maxDate` (latest date with data). Scrolling down reveals older dates grouped by day header.

### DATA Tab

Quantitative sections — casualties, economic indicators, military operations.

**Sub-tabs:** CASUALTIES / ECONOMIC / MILITARY

**CASUALTIES sub-tab:**
- KPI cards in 2-column grid (Iran killed, US killed, Israel killed, Lebanon killed, etc.)
- Each card: label + large value (Cormorant serif) + source tier chip + contested badge
- Breakdown rows below: category → count, sortable
- Source: `data.casualties` + `data.kpis`

**ECONOMIC sub-tab:**
- Econ indicator cards (single column on phone, 2-column on tablet)
- Each card: label + large value + sparkline SVG + change arrow
- Source: `data.econ`

**MILITARY sub-tab:**
- Strike/retaliation/asset lists (same as MilitaryTabs component but single-column)
- Each item: icon + name + detail + time + source tier
- Sub-tabs within: STRIKE TARGETS / RETALIATION / US ASSETS
- Source: `data.strikeTargets`, `data.retaliationData`, `data.assetsData`

### INTEL Tab

Qualitative sections — contested claims, political statements, historical context.

**Sub-tabs:** CLAIMS / POLITICAL / TIMELINE

**CLAIMS sub-tab:**
- Claims matrix in single column (side A claim → side B claim, stacked)
- Resolution badge + contested status
- Source: `data.claims`

**POLITICAL sub-tab:**
- Political statement cards (full width)
- Avatar circle + name + role + country badge
- Quote text (serif italic, left border)
- Source: `data.political`

**TIMELINE sub-tab:**
- Historical timeline (era groups with event nodes)
- Horizontal scroll within each era
- Same `TimelineSection` component, adapted for full-width
- Source: `data.timeline`

---

## Header Bar (Mobile)

```
[● live dot] [EPIC FURY / operation name]          [2D|3D toggle]
```

- Height: 44px (touch-friendly)
- `position: fixed; top: 0; z-index: 100`
- Live dot: pulsing red (live trackers) or hidden (historical)
- Operation name: truncated with ellipsis
- 2D/3D toggle: segmented control, right-aligned
  - Active segment: `background: var(--accent-red); color: white`
  - Inactive: `background: var(--bg-tertiary); color: var(--text-muted)`
- On historical trackers: show era label instead of live dot

---

## Tab Bar (Mobile)

```
[◎ MAP] [◉ FEED] [▤ DATA] [☷ INTEL]
```

- Height: 52px + safe area: `padding-bottom: env(safe-area-inset-bottom, 0px)`
- `position: fixed; bottom: 0; left: 0; right: 0; z-index: 100`
- Background: `var(--bg-primary)` with top border
- Each tab: icon (16px) + label (10px mono) stacked vertically
- Active tab: `color: var(--accent-red)`, label bold
- Inactive: `color: var(--text-muted)`
- FEED tab shows event count badge (red circle) when events exist for `maxDate` (latest date with data — not the real-world "today", which is meaningless for historical trackers)
- Touch targets: full tab width × 52px height (well above 44px minimum)
- Tab bar NEVER moves or repositions — always fixed at viewport bottom
- Accessibility: each tab button has `role="tab"`, `aria-selected="true|false"`. Tab content panels have `role="tabpanel"`. Sub-tabs in DATA/INTEL follow the same pattern. Focus management: tab key cycles through tabs, Enter/Space activates

---

## 2D/3D Toggle Behavior

The toggle switches the map renderer inside the MAP tab without changing the URL or leaving the tab.

**State preserved across toggle:**
- `currentDate` (timeline position)
- `zoomLevel` (timeline zoom)
- `activeFilters` (category filters)
- `isPlaying` (playback state)

**State NOT preserved (reset on toggle):**
- Camera position (2D and 3D have different spatial models)
- Selected point (info panel closes)
- Layer-specific state (satellites, flights — 3D only)

**Cesium lazy loading:**
- When user first taps "3D", Cesium (~3MB) loads asynchronously
- Show a loading spinner overlay on the map during load
- Once loaded, Cesium instance stays in memory for fast re-toggling
- If Cesium fails to load (network error), show error toast and keep 2D active

---

## Tablet Mode Toggle

On tablet (768px–1024px), users can switch between two modes via a small icon in the header:

**Reader mode (📖):** The existing collapsed theater layout for tablet — stacked column with sticky 40vh map at top, sections scrolling below. This is the current `@media (max-width: 1024px)` behavior (NOT the full desktop 2-column grid). Best for deep reading and analysis.

**App mode (📱):** Same tab navigation as phone. Full-screen tabs with bottom bar. Best for quick map interaction and event monitoring.

**Implementation:**
- Toggle icon in header (right side, before the 2D/3D toggle)
- Preference stored in `localStorage` (persists across sessions)
- Default: Reader mode (preserves current behavior)
- CSS class on `<body>`: `data-mobile-mode="reader"` or `data-mobile-mode="app"`
- App mode activates the same tab bar component used on phone

---

## Component Architecture

### New Components

#### `src/components/islands/MobileTabShell.tsx`

The main mobile shell component. Renders header + tab bar + tab content.

```typescript
interface Props {
  tracker: TrackerConfig;
  data: TrackerData;
  flatEvents: FlatEvent[];
  categories: MapCategory[];
}
```

- Manages `activeTab` state: `'map' | 'feed' | 'data' | 'intel'`
- Manages `mapMode` state: `'2d' | '3d'`
- Manages shared timeline state: `currentDate`, `isPlaying`, `playbackSpeed`, `activeFilters` — these are cross-cutting (MAP tab needs them for the map/timeline, FEED tab needs `currentDate` to filter events)
- Renders the fixed header with 2D/3D toggle
- Renders the fixed tab bar
- Tab content rendering: **keep mounted but hidden** (`display: none`) for MAP tab (preserves Leaflet/Cesium state). Other tabs unmount when inactive (lightweight, no map state to preserve).
- Lazy-loads Cesium only when 3D is first selected
- `client:load` hydration with SSR skeleton (header + tab bar + empty content)

#### `src/components/islands/MobileMapTab.tsx`

MAP tab content — wraps either LeafletMap or CesiumGlobe.

```typescript
interface Props {
  mode: '2d' | '3d';
  points: MapPoint[];
  lines: MapLine[];
  events: FlatEvent[];
  categories: MapCategory[];
  // ... tracker config props
}
```

#### `src/components/islands/MobileFeedTab.tsx`

FEED tab content — situation brief + latest events.

```typescript
interface Props {
  meta: Meta;
  events: FlatEvent[];
}
```

#### `src/components/islands/MobileDataTab.tsx`

DATA tab content — sub-tabbed casualties/economic/military.

```typescript
interface Props {
  kpis: KpiItem[];
  casualties: CasualtyRow[];
  econ: EconItem[];
  strikeTargets: StrikeItem[];
  retaliationData: StrikeItem[];
  assetsData: Asset[];
  tabs?: Tab[];
}
```

#### `src/components/islands/MobileIntelTab.tsx`

INTEL tab content — sub-tabbed claims/political/timeline.

```typescript
interface Props {
  claims: Claim[];
  political: PolItem[];
  timeline: TimelineEra[];
  avatarLabels?: Record<string, string>;
}
```

### Modified Components

#### `src/pages/[tracker]/index.astro`

- Detect mobile/tablet breakpoint
- On mobile: render `<MobileTabShell>` instead of the desktop theater layout
- On desktop: render the existing (or Phase 3 enhanced) theater layout
- Both receive the same data from `loadTrackerData()`

Implementation approach: render BOTH layouts in the HTML. The desktop layout renders as normal Astro SSR. The mobile shell uses `client:load` (NOT `client:only`) so it SSRs a minimal skeleton (header + tab bar + empty content area) and hydrates on load. CSS media queries hide the wrong layout immediately:

```css
@media (max-width: 768px) {
  .desktop-layout { display: none !important; }
}
@media (min-width: 769px) {
  .mobile-layout { display: none !important; }
}
```

This prevents flash-of-desktop-layout (FOLT) on mobile — the desktop HTML is hidden by CSS before JS loads, and the mobile skeleton is visible immediately from SSR.

#### `src/pages/[tracker]/globe.astro`

- On mobile: client-side redirect to `/tracker/?mode=3d` via `window.location` if viewport ≤768px. This keeps the globe page as a desktop-only route on mobile.
- The `index.astro` page reads `?mode=3d` query param and passes `initialMapMode="3d"` to `MobileTabShell`

### Deleted Components

- `src/components/islands/CesiumGlobe/MobileBottomSheet.tsx` — replaced by `MobileTabShell`
- Associated CSS for `.mobile-sheet-*` in `globe.css`

---

## CSS Strategy

### New file: `src/styles/mobile-tabs.css`

New CSS namespace `mtab-` for all mobile tab components:

- `.mtab-shell` — full viewport container
- `.mtab-header` — fixed top header (44px)
- `.mtab-toggle` — 2D/3D segmented control
- `.mtab-bar` — fixed bottom tab bar (52px)
- `.mtab-tab` — individual tab button
- `.mtab-tab.active` — active tab styling
- `.mtab-badge` — notification badge on FEED tab
- `.mtab-content` — scrollable content area
- `.mtab-subtabs` — sub-tab row for DATA/INTEL
- `.mtab-kpi-row` — compact KPI row in MAP tab

### Media query strategy

```css
/* Phone: always show tabs */
@media (max-width: 768px) {
  .desktop-layout { display: none; }
  .mobile-layout { display: block; }
}

/* Tablet: respect user preference */
@media (min-width: 769px) and (max-width: 1024px) {
  [data-mobile-mode="reader"] .desktop-layout { display: block; }
  [data-mobile-mode="reader"] .mobile-layout { display: none; }
  [data-mobile-mode="app"] .desktop-layout { display: none; }
  [data-mobile-mode="app"] .mobile-layout { display: block; }
}

/* Desktop: always show theater */
@media (min-width: 1025px) {
  .desktop-layout { display: block; }
  .mobile-layout { display: none; }
}
```

---

## Not In Scope

- Swipe gestures between tabs (can be added later with a gesture library)
- Pull-to-refresh on FEED tab (static site, data is build-time)
- Offline support / PWA
- Push notifications for new events
- Tablet split-view (iPad multitasking)

---

## Testing

### Manual verification

1. Phone (≤768px): tab bar visible, all 4 tabs render correct content
2. Phone: 2D/3D toggle switches map renderer, state preserved
3. Phone: ⛶ expand hides chrome, tap again restores
4. Phone: FEED tab shows situation brief + latest events with sources
5. Phone: DATA sub-tabs (Casualties/Economic/Military) each render
6. Phone: INTEL sub-tabs (Claims/Political/Timeline) each render
7. Phone: tab bar stays fixed at bottom regardless of content height
8. Tablet: mode toggle appears in header
9. Tablet Reader mode: desktop theater layout renders
10. Tablet App mode: tab navigation renders (same as phone)
11. Globe page on mobile: redirects to or renders same tab shell with 3D active
12. All trackers: tabs work across different tracker configs (Iran, Ayotzinapa, September 11, etc.)
13. Historical trackers: no LIVE button, no live dot, SIM clock in MAP tab

### Rollback

Single git revert. The mobile tab shell is additive — the desktop layout is unchanged. Old mobile CSS can be restored by removing the media query overrides.
