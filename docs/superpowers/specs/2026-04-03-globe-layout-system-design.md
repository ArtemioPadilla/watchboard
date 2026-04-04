# Globe Layout System — Slot-Based UI Architecture

**Date:** 2026-04-03
**Status:** Draft
**Scope:** `src/components/islands/CesiumGlobe/`, `src/styles/globe.css`

## Problem

The CesiumGlobe UI is built from ~10 independently positioned overlays, each using `position: fixed` with hardcoded `top/left/right/bottom` and competing z-index values (20–100). When a tracker like Artemis 2 adds custom HUD panels (MissionHUD), these land on the exact same coordinates as default elements:

| MissionHUD panel | Collides with | Both at |
|---|---|---|
| Top-left (vehicle + MET) | Toolbar icons | `top: 12px, left: 12px` |
| Top-right (telemetry) | KPI strip | `top: 12px, right: 12px` |
| Bottom (phase timeline) | Unified timeline bar | `bottom: 12–16px, full width` |

The z-index fight (MissionHUD z:100 vs toolbar z:90, timeline z:20) means MissionHUD wins everywhere, blocking interaction with default controls. On mobile, the problem inverts — most defaults are `display: none !important` but MissionHUD escapes the hide rules and renders all three panels unchecked.

There is no layout negotiation mechanism. Each new tracker that needs custom overlays must manually avoid collisions with hardcoded positions across all existing elements.

## Design

### Approach: Slot-Based Layout Grid

Replace the current pile of `position: fixed` overlays with a CSS Grid layout that defines named regions. Components render into their assigned slot. The grid template handles positioning and collision avoidance. Tracker-specific panels get dedicated auxiliary slots that stack adjacent to (never on top of) default elements.

### Grid Template (Desktop)

```
.globe-layout {
  position: fixed;
  inset: 0;
  z-index: 90;
  pointer-events: none;
  display: grid;
  grid-template-columns: auto 1fr auto;
  grid-template-rows: auto 1fr auto auto;
  grid-template-areas:
    "top-left    top-center   top-right"
    "left        .            right"
    "left-aux    bottom-aux   right-aux"
    "bottom-left bottom       bottom-right";
  padding: 12px;
  gap: 8px;
}
```

All children use `pointer-events: auto` on their interactive parts, preserving globe click-through on empty areas.

### Slot Assignments

| Slot | Grid area | Default occupant | Notes |
|---|---|---|---|
| `top-left` | `top-left` | Back link + About link | Fixed chrome, always present |
| `top-center` | `top-center` | Globe header (op name + dateline) | `justify-self: center` |
| `top-right` | `top-right` | KPI strip | `justify-self: end` |
| `left` | `left` | CesiumControls (toolbar) | Vertical icon bar + flyouts |
| `right` | `right` | CesiumEventsPanel / CesiumInfoPanel | Mutually exclusive, 340px max |
| `bottom` | `bottom` | UnifiedTimelineBar | `justify-self: center`, max-width 900px |
| `bottom-aux` | `bottom-aux` | *Empty by default* | Tracker HUD bottom panels sit here (above timeline) |
| `left-aux` | `left-aux` | *Empty by default* | Tracker HUD secondary panels |
| `right-aux` | `right-aux` | *Empty by default* | Tracker HUD secondary panels |

### Tracker HUD Panel Placement (Artemis 2 example)

MissionHUD panels move into auxiliary slots that don't collide:

| MissionHUD panel | Current position | New slot | Behavior |
|---|---|---|---|
| Vehicle identity (name + MET + TRACK) | `top: 12, left: 12` (overlaps toolbar) | `left-aux` | Sits below the toolbar in its own grid row |
| Telemetry (alt + vel + moon dist) | `top: 12, right: 12` (overlaps KPIs) | `right-aux` | Sits below events panel toggle / above bottom-aux |
| Phase timeline | `bottom: 12, full width` (overlaps timeline bar) | `bottom-aux` | Sits directly above the UnifiedTimelineBar |

### Grid Template (Mobile, <=768px)

```
.globe-layout {
  grid-template-columns: 1fr;
  grid-template-rows: auto 1fr auto auto;
  grid-template-areas:
    "top-center"
    "."
    "bottom-aux"
    "bottom";
  padding: 8px;
  gap: 4px;
}
```

Mobile changes:
- `top-left`, `top-right`, `left`, `right`, `left-aux`, `right-aux` all get `display: none` (same as current behavior for toolbar, KPIs, events, HUD)
- `top-center` stays (compact header)
- `bottom-aux` stays visible — tracker HUD panels collapse to a **single compact row** (mission identity + key telemetry inline, no phase timeline on mobile)
- `bottom` stays (timeline bar)

### MissionHUD Mobile Compact Mode

On mobile, MissionHUD renders a single-row strip instead of three panels:

```
[ORION] Pre-Launch | ALT 384,400 km | VEL 1.02 km/s
```

This fits in `bottom-aux` without overwhelming the viewport. The phase timeline is hidden on mobile (low information density per pixel). The TRACK ORION button moves into the compact row.

Detection: MissionHUD uses a `compact` prop driven by a `useMediaQuery(768)` hook (or the layout slot simply constrains available width, and MissionHUD responds with CSS).

### Hydration Boundary

The back/about links are currently server-rendered in `globe.astro` (no JS needed). The layout grid must contain both these Astro elements and the React island's overlay panels. Two options:

**Option chosen: CSS-only grid on the Astro side.** The `globe.astro` page wraps its `<main>` content in a `<div class="globe-layout">`. The back/about links get `grid-area: top-left`. The React CesiumGlobe component renders its overlay panels with matching `grid-area` classes. The grid is purely CSS — no React wrapper needed.

This avoids moving the links into the React hydration boundary (they work without JS) and avoids a new React component just for layout.

### Component Interface

CesiumGlobe's overlay section uses `grid-area` classes directly:

```tsx
// Inside CesiumGlobe.tsx return — overlays have grid-area classes
<>
  {/* Cesium viewer — fills viewport behind the grid */}
  <div className="globe-canvas"><Viewer ... /></div>
  
  {/* Full-viewport HUD — outside grid, pointer-events: none */}
  <CesiumHud ... />

  {/* Grid-positioned overlays */}
  <div className="globe-slot globe-slot--top-center">
    <GlobeHeader meta={meta} />
  </div>
  {!selectedPoint && !selectedEntity && (
    <div className="globe-slot globe-slot--top-right"><KpiStrip kpis={kpis} /></div>
  )}
  <div className="globe-slot globe-slot--left"><CesiumControls ... /></div>
  <div className="globe-slot globe-slot--right">
    {selectedPoint ? <CesiumInfoPanel ... /> : <CesiumEventsPanel ... />}
  </div>
  <div className="globe-slot globe-slot--bottom"><UnifiedTimelineBar ... /></div>
  
  {/* Tracker-specific aux slots — only rendered when data exists */}
  {missionTrajectory && <>
    <div className="globe-slot globe-slot--left-aux"><MissionIdentity ... /></div>
    <div className="globe-slot globe-slot--right-aux"><MissionTelemetry ... /></div>
    <div className="globe-slot globe-slot--bottom-aux"><MissionPhaseBar ... /></div>
  </>}
</>
```

And in `globe.astro`:

```astro
<div class="globe-layout">
  <div class="globe-slot globe-slot--top-left">
    <a href="..." class="globe-back-link">&larr; Dashboard</a>
    <a href="..." class="globe-about-link">About</a>
  </div>
  <CesiumGlobe client:only="react" ... />
</div>
```

The `.globe-layout` grid contains both the Astro-rendered `top-left` slot and all React-rendered slots. No wrapper component needed — just CSS grid area assignments.

### MissionHUD Decomposition

The current monolithic `MissionHUD.tsx` (single component, three absolutely-positioned panels) splits into three focused components that each render into their own slot:

| New component | Content | Slot |
|---|---|---|
| `MissionIdentity.tsx` | Vehicle name, phase indicator, MET counter, TRACK button | `left-aux` |
| `MissionTelemetry.tsx` | Altitude, velocity, distance to Moon | `right-aux` |
| `MissionPhaseBar.tsx` | Phase labels + progress bar | `bottom-aux` |

All three share the existing `telemetryRef` (MutableRefObject<TelemetryState>) for frame-synced updates. The rAF loop stays in the parent (CesiumGlobe or a shared hook), not duplicated per component.

### Z-Index Simplification

With the grid handling layout, z-index layering simplifies to three tiers:

| Tier | Z-index | Contents |
|---|---|---|
| Globe canvas | 0 | Cesium viewer |
| HUD overlay | 85 | CesiumHud (full-viewport, pointer-events: none) |
| Layout grid | 90 | GlobeLayout — all panels, controls, timeline |

No more per-element z-index wars. Everything inside GlobeLayout is at the same stacking layer; the grid ensures they don't overlap spatially.

### CSS Architecture

**New file:** `src/styles/globe-layout.css` — grid template + slot area definitions + mobile breakpoint.

**Modified:** `src/styles/globe.css` — remove all `position: fixed` + `top/left/right/bottom/z-index` from individual panel classes (`.globe-toolbar`, `.globe-kpi-strip`, `.globe-events-panel`, `.globe-info-panel`, `.globe-header`). These become flow-positioned children within their grid area.

**Unchanged:** `src/styles/unified-timeline.css` — the `[data-context="3d"]` positioning rules move to globe-layout.css; base styles stay.

### Extensibility for Future Trackers

Any tracker can inject custom panels into auxiliary slots without knowing about existing elements:

```tsx
// Future: disaster response tracker with resource allocation panel
bottomAux: disasterData ? <ResourcePanel ... /> : null,
rightAux: disasterData ? <CasualtyTicker ... /> : null,
```

The grid handles spacing. No z-index coordination needed. Mobile behavior is automatic (aux slots collapse or get simplified treatment per the media query).

## Migration Path

1. Create `GlobeLayout.tsx` + `globe-layout.css` with the grid
2. Move back/about links from `globe.astro` into `topLeft` slot
3. Move each default panel (header, KPIs, toolbar, events, info, timeline) from `position: fixed` into its grid slot — one at a time, verifying no visual regression
4. Split MissionHUD into three slot-targeted components
5. Wire up mobile compact mode for mission panels
6. Remove dead `position: fixed` / z-index rules from `globe.css`
7. Verify all existing trackers' globe pages still render correctly

## Files Changed

| File | Action |
|---|---|
| `src/components/islands/CesiumGlobe/MissionIdentity.tsx` | **New** — split from MissionHUD |
| `src/components/islands/CesiumGlobe/MissionTelemetry.tsx` | **New** — split from MissionHUD |
| `src/components/islands/CesiumGlobe/MissionPhaseBar.tsx` | **New** — split from MissionHUD |
| `src/components/islands/CesiumGlobe/MissionHUD.tsx` | **Delete** — replaced by 3 components above |
| `src/components/islands/CesiumGlobe/CesiumGlobe.tsx` | **Modify** — wrap overlays in `globe-slot` divs with grid-area classes |
| `src/styles/globe-layout.css` | **New** — grid template + slot area definitions + mobile breakpoint |
| `src/styles/globe.css` | **Modify** — remove `position: fixed` + z-index from panel classes, import globe-layout.css |
| `src/styles/unified-timeline.css` | **Modify** — move `[data-context="3d"]` fixed positioning into globe-layout.css |
| `src/pages/[tracker]/globe.astro` | **Modify** — wrap content in `.globe-layout` div, wrap back/about links in `.globe-slot--top-left` |

## Non-Goals

- Redesigning the visual appearance of any panel (colors, fonts, sizes stay the same)
- Adding new panels or features beyond what exists today
- Changing the Cesium viewer configuration or camera behavior
- Modifying the 2D IntelMap layout (separate concern)

## Testing

- Visual regression: compare screenshots of globe pages for Iran Conflict, Artemis 2, and one other tracker before/after
- Mobile: verify toolbar/KPIs/events still hidden, MissionHUD compact row renders cleanly
- Interaction: confirm toolbar flyouts, event panel open/close, info panel selection, timeline scrubbing all work without overlap
- Cinematic mode: verify overlay still visible (it stays outside the grid, same as CesiumHud)
