# Globe Layout System — Expandable HUD with Layout Presets

**Date:** 2026-04-06
**Status:** Approved

## Summary

Refactor the globe's CSS Grid overlay from a 4-row layout to a simpler 3-row grid, introduce layout presets (`default`, `mission`, `disaster`) configurable per tracker in `tracker.json`, add collapsible panels, merge the mission phase bar into the timeline component, and convert fact cards from slot-based to floating anchored panels.

## Motivation

The current globe layout has overlapping panels on trackers with mission-specific components (Artemis-2). Mission Identity collides with HUD coords in bottom-left, Mission Telemetry collides with HUD altitude in bottom-right, and the Phase Bar + Timeline stack too tall in the bottom center. The layout also can't adapt to different tracker types — a space mission needs different panels than a conflict tracker.

## Section 1: Grid System Refactor

### Current grid (4 rows × 3 columns)

```
top-left    top-center   top-right
left        .            right
left-aux    bottom-aux   right-aux
bottom-left bottom       bottom-right
```

### New grid (3 rows × 3 columns)

```
top-left    top-center   top-right
left        .            right
bottom-left bottom       bottom-right
```

**Changes:**
- Remove `left-aux`, `bottom-aux`, `right-aux` grid areas entirely
- Mission Identity → `bottom-left` slot (absorbs HUD coords into the card)
- Mission Telemetry → `right` slot (stacked below Intel feed)
- Mission Phase Bar → merged into `bottom` timeline component (Section 4)
- `bottom` spans all columns (`grid-column: 1 / -1`)
- `right` slot becomes a vertical flex column: Intel feed on top, telemetry below (when present via preset)

**HUD overlay** (military readouts — MGRS, mode label, REC, altitude, sun, scale bar):
- Stays as a separate `position: fixed; pointer-events: none` layer, not part of the grid
- Bottom-left readouts (MGRS, coords) merge into Mission Identity card on `mission` preset
- Bottom-right readouts (altitude, sun angle) stay in their fixed position — no collision since `right-aux` is removed
- A CSS class `.has-mission-identity` on `.globe-wrapper` shifts HUD bottom-left readouts up when the Mission Identity card is present

### File changes

- `src/styles/globe-layout.css` — rewrite grid template, remove `*-aux` areas
- `src/components/islands/CesiumGlobe/CesiumGlobe.tsx` — restructure slot assignments based on resolved layout

## Section 2: Layout Presets

### Schema addition

In `src/lib/tracker-config.ts`, extend `GlobeConfigSchema`:

```typescript
const GlobeConfigSchema = z.object({
  enabled: z.boolean(),
  layout: z.enum(['default', 'mission', 'disaster']).optional().default('default'),
  layoutOverrides: z.record(z.string(), z.array(z.string())).optional(),
  cameraPresets: z.record(z.string(), CameraPresetSchema).optional(),
  clocks: z.array(ClockSchema).optional(),
});
```

### Preset definitions

Each preset maps slot names to arrays of panel IDs:

**`default`** (conflict trackers — Iran, Ukraine, Gaza, etc.)

| Slot | Panels |
|---|---|
| top-left | hardcoded nav links (Dashboard, About) — not in registry |
| top-center | `['op-header']` |
| top-right | `['kpi-strip']` |
| left | `['toolbar']` |
| right | `['intel']` |
| bottom-left | _(empty)_ |
| bottom | `['timeline']` |
| HUD | Full military (MGRS, mode, REC, alt, sun, scale) |

**`mission`** (Artemis-2, future space trackers)

| Slot | Panels |
|---|---|
| top-left | hardcoded nav links |
| top-center | `['op-header']` |
| top-right | `['kpi-strip']` |
| left | `['toolbar']` |
| right | `['intel', 'telemetry']` |
| bottom-left | `['mission-identity']` |
| bottom | `['timeline']` (with phase bar header via `missionHeader` prop) |
| HUD | Full military |

**`disaster`** (Chernobyl, Fukushima)

| Slot | Panels |
|---|---|
| top-left | hardcoded nav links |
| top-center | `['op-header']` |
| top-right | `['kpi-strip']` |
| left | `['toolbar']` |
| right | `['intel']` |
| bottom-left | _(empty)_ |
| bottom | `['timeline']` |
| HUD | Civilian — no mode label, no MGRS. Shows alt/sun only |

### layoutOverrides

Overrides replace specific slots from the preset:

```json
{
  "globe": {
    "layout": "mission",
    "layoutOverrides": {
      "right": ["intel"]
    }
  }
}
```

This uses `mission` but drops telemetry from the right column.

### Component registry

A map from panel ID to React component, defined in `CesiumGlobe.tsx`:

```typescript
const PANEL_REGISTRY: Record<string, React.ComponentType<any>> = {
  'op-header': OperationHeader,
  'kpi-strip': KpiStrip,
  'toolbar': CesiumControls,
  'intel': CesiumEventsPanel,
  'telemetry': MissionTelemetry,
  'mission-identity': MissionIdentity,
  'timeline': UnifiedTimelineBar,
};
// Note: top-left nav links (Dashboard, About) are hardcoded in globe.astro, not in the registry.
```

### Layout resolution

```typescript
function resolveLayout(preset: string, overrides?: Record<string, string[]>): Record<string, string[]> {
  const base = PRESETS[preset] || PRESETS['default'];
  if (!overrides) return base;
  return { ...base, ...overrides };
}
```

CesiumGlobe reads the resolved layout, iterates slots, looks up components in the registry, and renders them. Removes all hardcoded `{missionTrajectory && ...}` conditionals.

## Section 3: Collapsible Panels

Every panel rendered in a slot can be collapsed to a pill (icon + label) and expanded back.

**Collapsed state:** Small pill showing icon + short label (e.g., `📡 Telemetry`). Clicking expands.

**Expanded state:** Full panel as today. Small ▾ toggle in top-right corner. Clicking collapses.

**State persistence:** `localStorage` key `watchboard-globe-panels-{slug}` stores a `Record<string, boolean>` of panel ID → expanded state.

**Default collapsed state per preset:**

| Panel | `default` | `mission` | `disaster` |
|---|---|---|---|
| kpi-strip | expanded | expanded | expanded |
| toolbar | expanded | expanded | expanded |
| intel | collapsed | collapsed | collapsed |
| telemetry | n/a | expanded | n/a |
| mission-identity | n/a | expanded | n/a |
| timeline | expanded | expanded | expanded |

**Implementation:** A `useCollapsible(panelId, defaultExpanded)` hook that reads/writes localStorage. A `CollapsiblePanel` wrapper component:

```tsx
<CollapsiblePanel id="telemetry" icon="📡" label="Telemetry" defaultExpanded={true}>
  <MissionTelemetry ... />
</CollapsiblePanel>
```

Renders either full children or collapsed pill. Handles toggle button and slide animation.

## Section 4: Merged Phase Bar + Timeline

The mission phase bar becomes a header row inside `UnifiedTimelineBar`, not a separate slot component.

**Current:** Two stacked components in separate slots → too tall.

**Proposed:** Single `UnifiedTimelineBar` component with optional `missionHeader` prop:

```
┌─ Unified Timeline ───────────────────┐
│ Orion MPCV  Lunar Flyby  ALT 406K   │  ← missionHeader (mission preset only)
│ Launch ━━━━━━●━ Flyby ━━━ Return     │  ← phase progress bar
├──────────────────────────────────────┤
│ ◀ ▶ ⏩  ● LIVE   Apr 7, 2026        │  ← standard timeline controls
│ ALL YR QTR MO WK DAY ●●●●●●●●●●●●  │
│ 22 locations · 1166 sats             │
└──────────────────────────────────────┘
```

When `missionHeader` is absent (default/disaster presets), the timeline renders exactly as today.

**Changes:**
- `MissionPhaseBar` is no longer a standalone slot component
- Its content moves into a new `MissionTimelineHeader` sub-component rendered inside `UnifiedTimelineBar`
- `UnifiedTimelineBar` gains props: `missionTrajectory?: MissionTrajectory`, `telemetryRef?: TelemetryState`
- The `bottom` slot always contains exactly one component

## Section 5: Floating Fact Cards

Fact cards (entity info panels) move from the `right` grid slot to floating panels anchored to clicked entities.

**Position:** Anchored to screen-space coordinates of the clicked entity via `scene.cartesianToCanvasCoordinates()`. Card renders next to the point with a thin connecting line (SVG).

**Behavior:**
- Only one fact card at a time
- Clicking another entity replaces it
- Clicking empty space or pressing Escape dismisses
- Card repositions on camera move (tracked in `requestAnimationFrame`)
- If entity moves off-screen, card auto-dismisses

**Z-index:** Rendered inside `.globe-wrapper` (via `display: contents`) at z-index 0 — above the canvas (`z-index: -1`) but below grid slots (auto/0). This means HUD panels and toolbar always stay on top.

**Collision avoidance:** Card placement prefers right side of entity. If card would overlap the right column, shifts to left side. If it would overlap the bottom timeline, shifts up.

**Mobile:** Fact card renders as a tab in the bottom sheet (see Section 6). Tapping an entity switches to a "Detail" tab showing the card content.

## Section 6: Mobile Bottom Sheet

On mobile (≤768px), all panels except the timeline collapse into a swipeable bottom sheet with tabs.

**Visible slots on mobile:**
- `top-center` — compact operation header
- `bottom` — unified timeline (peek state of bottom sheet)

**Everything else** moves into bottom sheet tabs.

**Bottom sheet states:**
- **Peek** (~15% of screen) — timeline bar visible, phase bar header if mission preset
- **Half** (~50%) — swipe up, shows active tab content
- **Full** (~85%) — swipe up more, scrollable content

**Tabs by preset:**

| Tab | `default` | `mission` | `disaster` |
|---|---|---|---|
| Timeline | ✓ (default) | ✓ (default) | ✓ (default) |
| Mission | — | ✓ (identity + telemetry) | — |
| Intel | ✓ | ✓ | ✓ |
| Filters | ✓ | ✓ | ✓ (no military modes) |
| Detail | shown when entity tapped | shown when entity tapped | shown when entity tapped |

**Mission-specific mobile:**
- Phase bar always visible in peek state (merged header)
- Compact telemetry ticker in peek bar: `ALT 406K · VEL 416 m/s · MOON 721K`
- "TRACK ORION" renders as a FAB (floating action button) above the bottom sheet

## Files to Create or Modify

### New files

| File | Responsibility |
|---|---|
| `src/components/islands/CesiumGlobe/CollapsiblePanel.tsx` | Generic wrapper — expand/collapse with pill state |
| `src/components/islands/CesiumGlobe/FloatingFactCard.tsx` | Anchored info panel with connecting line |
| `src/components/islands/CesiumGlobe/MissionTimelineHeader.tsx` | Phase bar + status row for inside UnifiedTimelineBar |
| `src/components/islands/CesiumGlobe/GlobeMobileSheet.tsx` | Bottom sheet with tabs for mobile |
| `src/components/islands/CesiumGlobe/layout-presets.ts` | Preset definitions, `resolveLayout()`, panel registry |
| `src/components/islands/CesiumGlobe/useCollapsible.ts` | Hook for panel expand/collapse state with localStorage |

### Modified files

| File | Changes |
|---|---|
| `src/styles/globe-layout.css` | Rewrite to 3-row grid, remove `*-aux` areas |
| `src/styles/globe.css` | Update HUD positioning for `.has-mission-identity`, floating card styles |
| `src/lib/tracker-config.ts` | Add `layout` and `layoutOverrides` to `GlobeConfigSchema` |
| `src/components/islands/CesiumGlobe/CesiumGlobe.tsx` | Replace hardcoded slot assignments with layout-driven rendering via `resolveLayout()` |
| `src/components/islands/CesiumGlobe/CesiumHud.tsx` | Respect preset — hide MGRS/mode on `disaster`, merge coords into Mission Identity on `mission` |
| `src/components/islands/CesiumGlobe/UnifiedTimelineBar.tsx` | Accept `missionTrajectory` + `telemetryRef` props, render `MissionTimelineHeader` when present |
| `src/components/islands/CesiumGlobe/MissionPhaseBar.tsx` | Refactor into `MissionTimelineHeader` (may be deleted or kept as wrapper) |
| `trackers/artemis-2/tracker.json` | Add `"layout": "mission"` to globe config |
| `trackers/chernobyl-disaster/tracker.json` | Add `"layout": "disaster"` to globe config |
| `trackers/fukushima-disaster/tracker.json` | Add `"layout": "disaster"` to globe config |

## Migration

- All existing trackers default to `layout: "default"` — no change in behavior
- Artemis-2 gets `layout: "mission"` — resolves the overlap issues
- Chernobyl/Fukushima get `layout: "disaster"` — removes military HUD labels
- The 3-row grid is backward compatible — slots that existed before (`top-left`, `left`, `right`, `bottom`) keep the same names and behavior
