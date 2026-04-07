# Globe Layout System — Implementation Plan (Phase A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix globe panel overlaps by refactoring to a 3-row grid, introducing layout presets (default/mission/disaster), and merging the mission phase bar into the timeline.

**Architecture:** Replace the 4-row CSS Grid with a 3-row grid that eliminates aux slots. A `layout-presets.ts` module defines which panels go in which slots per preset. CesiumGlobe reads the resolved layout and renders panels dynamically instead of hardcoding conditionals. The mission phase bar becomes a header row inside UnifiedTimelineBar.

**Tech Stack:** CSS Grid, React, Zod (schema), TypeScript

**Spec:** `docs/superpowers/specs/2026-04-06-globe-layout-system-design.md`

**Scope:** This is Phase A — grid refactor, presets, merged timeline. Phase B (collapsible panels, floating fact cards, mobile bottom sheet) follows separately.

---

## File Structure

### New files

| File | Responsibility |
|---|---|
| `src/components/islands/CesiumGlobe/layout-presets.ts` | Preset definitions, `resolveLayout()`, panel ID types |
| `src/components/islands/CesiumGlobe/MissionTimelineHeader.tsx` | Phase bar + status row rendered inside UnifiedTimelineBar |

### Modified files

| File | Changes |
|---|---|
| `src/lib/tracker-config.ts:52-56` | Add `layout` and `layoutOverrides` to GlobeConfigSchema |
| `src/styles/globe-layout.css` | Rewrite to 3-row grid, remove `*-aux` areas |
| `src/components/islands/CesiumGlobe/CesiumGlobe.tsx` | Replace hardcoded slots with layout-driven rendering |
| `src/components/islands/CesiumGlobe/CesiumHud.tsx` | Respect preset — hide MGRS/mode on disaster |
| `src/components/islands/CesiumGlobe/UnifiedTimelineBar.tsx` | Accept mission props, render MissionTimelineHeader |
| `src/pages/[tracker]/globe.astro` | Pass `layout` and `layoutOverrides` props to CesiumGlobe |
| `trackers/artemis-2/tracker.json` | Add `"layout": "mission"` |
| `trackers/chernobyl-disaster/tracker.json` | Add `"layout": "disaster"` |
| `trackers/fukushima-disaster/tracker.json` | Add `"layout": "disaster"` |

---

## Task 1: Schema — Add layout fields to GlobeConfigSchema

**Files:**
- Modify: `src/lib/tracker-config.ts:52-56`

- [ ] **Step 1: Add layout and layoutOverrides to GlobeConfigSchema**

In `src/lib/tracker-config.ts`, replace the GlobeConfigSchema (lines 52-56):

```typescript
// ── Globe config ──
const GlobeLayoutSchema = z.enum(['default', 'mission', 'disaster']);

const GlobeConfigSchema = z.object({
  enabled: z.boolean(),
  layout: GlobeLayoutSchema.optional().default('default'),
  layoutOverrides: z.record(z.string(), z.array(z.string())).optional(),
  cameraPresets: z.record(z.string(), CameraPresetSchema).optional(),
  clocks: z.array(ClockSchema).optional(),
});
```

- [ ] **Step 2: Export the layout type**

After the existing type exports at the bottom of the file, add:

```typescript
export type GlobeLayout = z.infer<typeof GlobeLayoutSchema>;
```

- [ ] **Step 3: Verify build passes**

Run: `npx vitest run 2>&1 | tail -5`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add src/lib/tracker-config.ts
git commit -m "feat(globe): add layout and layoutOverrides to GlobeConfigSchema"
```

---

## Task 2: Layout presets module

**Files:**
- Create: `src/components/islands/CesiumGlobe/layout-presets.ts`

- [ ] **Step 1: Create the presets module**

```typescript
/**
 * Globe layout presets — defines which panels appear in which grid slots.
 * Each preset maps slot IDs to arrays of panel IDs.
 * CesiumGlobe reads the resolved layout and renders panels dynamically.
 */

export type PanelId =
  | 'op-header'
  | 'kpi-strip'
  | 'toolbar'
  | 'intel'
  | 'telemetry'
  | 'mission-identity'
  | 'timeline';

export type SlotId =
  | 'top-center'
  | 'top-right'
  | 'left'
  | 'right'
  | 'bottom-left'
  | 'bottom';

export type GlobeLayoutPreset = 'default' | 'mission' | 'disaster';

export interface ResolvedLayout {
  slots: Record<SlotId, PanelId[]>;
  hudMode: 'military' | 'civilian';
  missionTimelineHeader: boolean;
}

const DEFAULT_LAYOUT: ResolvedLayout = {
  slots: {
    'top-center': ['op-header'],
    'top-right': ['kpi-strip'],
    'left': ['toolbar'],
    'right': ['intel'],
    'bottom-left': [],
    'bottom': ['timeline'],
  },
  hudMode: 'military',
  missionTimelineHeader: false,
};

const MISSION_LAYOUT: ResolvedLayout = {
  slots: {
    'top-center': ['op-header'],
    'top-right': ['kpi-strip'],
    'left': ['toolbar'],
    'right': ['intel', 'telemetry'],
    'bottom-left': ['mission-identity'],
    'bottom': ['timeline'],
  },
  hudMode: 'military',
  missionTimelineHeader: true,
};

const DISASTER_LAYOUT: ResolvedLayout = {
  slots: {
    'top-center': ['op-header'],
    'top-right': ['kpi-strip'],
    'left': ['toolbar'],
    'right': ['intel'],
    'bottom-left': [],
    'bottom': ['timeline'],
  },
  hudMode: 'civilian',
  missionTimelineHeader: false,
};

const PRESETS: Record<GlobeLayoutPreset, ResolvedLayout> = {
  default: DEFAULT_LAYOUT,
  mission: MISSION_LAYOUT,
  disaster: DISASTER_LAYOUT,
};

export function resolveLayout(
  preset: GlobeLayoutPreset = 'default',
  overrides?: Record<string, string[]>,
): ResolvedLayout {
  const base = PRESETS[preset] || PRESETS['default'];
  if (!overrides) return base;
  return {
    ...base,
    slots: { ...base.slots, ...overrides } as Record<SlotId, PanelId[]>,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/islands/CesiumGlobe/layout-presets.ts
git commit -m "feat(globe): add layout-presets module with default/mission/disaster"
```

---

## Task 3: CSS Grid refactor — 3-row layout

**Files:**
- Modify: `src/styles/globe-layout.css`

- [ ] **Step 1: Rewrite globe-layout.css**

Replace the entire desktop grid section (lines 7-23) and slot definitions (lines 33-41):

```css
/* ── Layout grid (desktop) ── */
.globe-layout {
  position: fixed;
  inset: 0;
  z-index: 90;
  pointer-events: none;
  display: grid;
  grid-template-columns: auto 1fr auto;
  grid-template-rows: auto 1fr auto;
  grid-template-areas:
    "top-left    top-center   top-right"
    "left        .            right"
    "bottom-left bottom       bottom-right";
  padding: 12px;
  gap: 8px;
  align-items: start;
}
```

Replace all slot definitions with:

```css
/* ── Named slot areas ── */
.globe-slot--top-left     { grid-area: top-left;     display: flex; gap: 8px; align-items: center; }
.globe-slot--top-center   { grid-area: top-center;   justify-self: center; text-align: center; pointer-events: none; }
.globe-slot--top-right    { grid-area: top-right;    justify-self: end; }
.globe-slot--left         { grid-area: left;         align-self: start; }
.globe-slot--right        { grid-area: right;        align-self: start; justify-self: end; display: flex; flex-direction: column; gap: 8px; }
.globe-slot--bottom-left  { grid-area: bottom-left;  align-self: end; }
.globe-slot--bottom       { grid-area: bottom;       justify-self: center; align-self: end; width: 90%; max-width: 900px; grid-column: 1 / -1; }
.globe-slot--bottom-right { grid-area: bottom-right; align-self: end; justify-self: end; }
```

Note: `.globe-slot--right` now has `display: flex; flex-direction: column; gap: 8px` to stack Intel + Telemetry vertically.

- [ ] **Step 2: Remove the aux slot definitions**

Delete the lines for `.globe-slot--left-aux`, `.globe-slot--right-aux`, `.globe-slot--bottom-aux`.

- [ ] **Step 3: Update mobile media query**

Replace the mobile grid (lines 65-94) with:

```css
/* ── Mobile layout (<=768px) ── */
@media (max-width: 768px) {
  .globe-layout {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr auto;
    grid-template-areas:
      "top-center"
      "."
      "bottom";
    padding: 8px;
    gap: 4px;
  }

  .globe-slot--top-left,
  .globe-slot--top-right,
  .globe-slot--left,
  .globe-slot--right,
  .globe-slot--bottom-left,
  .globe-slot--bottom-right {
    display: none !important;
  }
}
```

- [ ] **Step 4: Remove mission phase bar responsive rules**

Delete the `.mission-phase-bar--mobile` / `.mission-phase-bar--desktop` rules at the end of the file (lines 96-102). The phase bar will be inside the timeline now.

- [ ] **Step 5: Verify dev server renders**

Run: `npm run dev -- --host` and check `/artemis-2/globe/` in browser.
Expected: Globe renders (layout may be broken until Task 5 rewires CesiumGlobe).

- [ ] **Step 6: Commit**

```bash
git add src/styles/globe-layout.css
git commit -m "refactor(globe): simplify to 3-row grid, remove aux slots"
```

---

## Task 4: MissionTimelineHeader component

**Files:**
- Create: `src/components/islands/CesiumGlobe/MissionTimelineHeader.tsx`

- [ ] **Step 1: Create the component**

This component renders the mission status + phase progress bar as a header row inside the timeline.

```tsx
import { useRef, useEffect, type MutableRefObject } from 'react';
import type { TelemetryState, MissionPhase } from './mission-helpers';

interface Props {
  telemetryRef: MutableRefObject<TelemetryState>;
  vehicle: string;
  phases: MissionPhase[];
}

export default function MissionTimelineHeader({ telemetryRef, vehicle, phases }: Props) {
  const progressRef = useRef<HTMLDivElement>(null);
  const phaseRef = useRef<HTMLSpanElement>(null);
  const altRef = useRef<HTMLSpanElement>(null);
  const velRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let raf: number;
    const update = () => {
      const t = telemetryRef.current;
      if (progressRef.current) {
        progressRef.current.style.width = `${(t.overallProgress ?? 0) * 100}%`;
      }
      if (phaseRef.current) phaseRef.current.textContent = t.currentPhase ?? 'Pre-Launch';
      if (altRef.current) altRef.current.textContent = formatDistance(t.altitude ?? 0);
      if (velRef.current) velRef.current.textContent = formatVelocity(t.velocity ?? 0);
      raf = requestAnimationFrame(update);
    };
    raf = requestAnimationFrame(update);
    return () => cancelAnimationFrame(raf);
  }, [telemetryRef]);

  return (
    <div style={S.wrapper}>
      {/* Status row */}
      <div style={S.statusRow}>
        <span style={S.vehicle}>{vehicle}</span>
        <span style={S.phase} ref={phaseRef}>Pre-Launch</span>
        <span style={S.sep}>|</span>
        <span style={S.metricLabel}>ALT</span>
        <span style={S.metricValue} ref={altRef}>0 km</span>
        <span style={S.sep}>|</span>
        <span style={S.metricLabel}>VEL</span>
        <span style={S.metricValue} ref={velRef}>0 m/s</span>
      </div>
      {/* Phase progress */}
      <div style={S.phaseRow}>
        {phases.map((phase, i) => (
          <span key={i} style={S.phaseLabel}>{phase.label.length > 14 ? phase.label.slice(0, 12) + '…' : phase.label}</span>
        ))}
      </div>
      <div style={S.progressTrack}>
        <div ref={progressRef} style={S.progressFill} />
      </div>
    </div>
  );
}

function formatDistance(meters: number): string {
  if (meters >= 1e6) return `${(meters / 1e3).toLocaleString(undefined, { maximumFractionDigits: 0 })} km`;
  if (meters >= 1e3) return `${(meters / 1e3).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}

function formatVelocity(mps: number): string {
  if (mps >= 1e3) return `${(mps / 1e3).toFixed(1)} km/s`;
  return `${Math.round(mps)} m/s`;
}

const S: Record<string, React.CSSProperties> = {
  wrapper: {
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    padding: '6px 10px 4px',
  },
  statusRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.65rem',
    color: 'rgba(232,233,237,0.7)',
    marginBottom: '4px',
  },
  vehicle: {
    color: '#4ade80',
    fontWeight: 700,
  },
  phase: {
    color: 'rgba(232,233,237,0.9)',
  },
  sep: {
    color: 'rgba(255,255,255,0.15)',
  },
  metricLabel: {
    color: 'rgba(232,233,237,0.4)',
    fontSize: '0.55rem',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  metricValue: {
    color: 'rgba(232,233,237,0.9)',
  },
  phaseRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '0.55rem',
    color: 'rgba(232,233,237,0.4)',
    marginBottom: '2px',
  },
  phaseLabel: {},
  progressTrack: {
    height: '3px',
    background: 'rgba(255,255,255,0.06)',
    borderRadius: '2px',
    overflow: 'hidden',
    marginBottom: '2px',
  },
  progressFill: {
    height: '100%',
    width: '0%',
    background: 'linear-gradient(90deg, #4ade80, #58a6ff, #f59e0b, #a855f6)',
    borderRadius: '2px',
    transition: 'width 0.5s ease',
  },
};
```

- [ ] **Step 2: Commit**

```bash
git add src/components/islands/CesiumGlobe/MissionTimelineHeader.tsx
git commit -m "feat(globe): add MissionTimelineHeader component"
```

---

## Task 5: Wire UnifiedTimelineBar to accept mission header

**Files:**
- Modify: `src/components/islands/CesiumGlobe/UnifiedTimelineBar.tsx`

- [ ] **Step 1: Add mission props to the BaseProps interface**

In `UnifiedTimelineBar.tsx`, add to the `BaseProps` interface (after the `legendItems` prop):

```typescript
  missionTrajectory?: { vehicle: string; phases: { label: string; startTime: string; endTime: string }[]; launchTime: string } | null;
  telemetryRef?: React.MutableRefObject<any>;
  showMissionHeader?: boolean;
```

- [ ] **Step 2: Import MissionTimelineHeader**

Add at the top of the file:

```typescript
import MissionTimelineHeader from './MissionTimelineHeader';
```

- [ ] **Step 3: Render the mission header above the controls**

Find where the timeline bar's main container div starts rendering (the outermost return div). Add the mission header as the first child inside it:

```tsx
{props.showMissionHeader && props.missionTrajectory && props.telemetryRef && (
  <MissionTimelineHeader
    telemetryRef={props.telemetryRef}
    vehicle={props.missionTrajectory.vehicle}
    phases={props.missionTrajectory.phases}
  />
)}
```

This goes BEFORE the existing controls row.

- [ ] **Step 4: Verify dev server renders**

Check that the timeline still works on a non-mission tracker (e.g., `/iran-conflict/globe/`).
Expected: No visual change — `showMissionHeader` is undefined so header doesn't render.

- [ ] **Step 5: Commit**

```bash
git add src/components/islands/CesiumGlobe/UnifiedTimelineBar.tsx
git commit -m "feat(globe): UnifiedTimelineBar accepts optional mission header"
```

---

## Task 6: Rewire CesiumGlobe with layout-driven rendering

**Files:**
- Modify: `src/components/islands/CesiumGlobe/CesiumGlobe.tsx`
- Modify: `src/pages/[tracker]/globe.astro`

This is the biggest task — restructuring how CesiumGlobe renders its slots.

- [ ] **Step 1: Add layout props to CesiumGlobe**

In `CesiumGlobe.tsx`, add to the Props interface (after `missionTrajectory`):

```typescript
  globeLayout?: 'default' | 'mission' | 'disaster';
  layoutOverrides?: Record<string, string[]>;
```

- [ ] **Step 2: Import resolveLayout**

Add at top:

```typescript
import { resolveLayout, type ResolvedLayout, type PanelId } from './layout-presets';
```

- [ ] **Step 3: Resolve layout at component top**

Inside the component function, after props destructuring, add:

```typescript
const layout = resolveLayout(globeLayout, layoutOverrides);
const hasPanelInSlot = (slot: string, panel: PanelId) =>
  (layout.slots[slot as keyof typeof layout.slots] ?? []).includes(panel);
```

- [ ] **Step 4: Replace the hardcoded mission trajectory conditional block**

Find the mission trajectory conditional (around lines 538-559). Replace the entire `{missionTrajectory && (...)}` block with layout-driven rendering:

```tsx
{/* Mission Identity — bottom-left (if layout includes it) */}
{hasPanelInSlot('bottom-left', 'mission-identity') && missionTrajectory && (
  <div className="globe-slot globe-slot--bottom-left">
    <MissionIdentity
      telemetryRef={telemetryRef}
      vehicle={missionTrajectory.vehicle}
      onTrackSpacecraft={trackSpacecraft}
    />
  </div>
)}

{/* Telemetry — rendered inside right slot (see below) */}
```

- [ ] **Step 5: Restructure the right slot**

Find the Intel feed slot (around line 675). Replace the separate KPI/Intel/fact-card right-slot blocks with a single right slot that stacks panels:

```tsx
{/* KPI strip — stays in top-right */}
{!selectedPoint && !selectedEntity && hasPanelInSlot('top-right', 'kpi-strip') && (
  <div className="globe-slot globe-slot--top-right">
    <div className={`globe-kpi-strip${showAllKpis ? ' expanded' : ''}`}>
      {kpis.slice(0, showAllKpis ? kpis.length : 4).map(k => (
        <div key={k.label} className="globe-kpi" style={{ borderLeftColor: kpiColor(k) }}>
          <span className="globe-kpi-value">{k.value}</span>
          <span className="globe-kpi-label">{k.label}</span>
        </div>
      ))}
      {kpis.length > 4 && (
        <button className="globe-kpi-more" onClick={() => setShowAllKpis(!showAllKpis)}>
          {showAllKpis ? '−' : `+${kpis.length - 4}`}
        </button>
      )}
    </div>
  </div>
)}

{/* Right column — stacked panels */}
<div className="globe-slot globe-slot--right">
  {/* Fact cards (selectedPoint / selectedEntity) */}
  {selectedPoint && (
    <CesiumInfoPanel point={selectedPoint} onClose={() => setSelectedPoint(null)} />
  )}
  {selectedEntity && !selectedPoint && (
    <div className="globe-info-panel">
      <button className="globe-info-close" onClick={() => setSelectedEntity(null)} aria-label="Close">×</button>
      <div className="globe-info-title">{selectedEntity.name}</div>
      {selectedEntity.description && (
        <pre style={{ whiteSpace: 'pre-wrap', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.65rem', color: 'rgba(232,233,237,0.6)', margin: '8px 0 0' }}>
          {selectedEntity.description}
        </pre>
      )}
    </div>
  )}

  {/* Intel feed */}
  {hasPanelInSlot('right', 'intel') && (
    <CesiumEventsPanel
      events={events || []}
      onEventSelect={handleEventSelect}
      categories={categories || []}
    />
  )}

  {/* Telemetry (mission preset only) */}
  {hasPanelInSlot('right', 'telemetry') && missionTrajectory && (
    <MissionTelemetry telemetryRef={telemetryRef} />
  )}
</div>
```

- [ ] **Step 6: Remove the old separate Intel and fact card right-slot blocks**

Delete the old standalone `globe-slot--right` (CesiumEventsPanel) and `globe-slot--right` (fact cards) blocks. They're now inside the single right column from Step 5. The old `globe-slot--top-right` (KPI strip) block is also replaced by the layout-driven version from Step 5.

- [ ] **Step 7: Pass mission props to UnifiedTimelineBar**

Find the timeline slot (around line 596). Add the mission props:

```tsx
<div className="globe-slot globe-slot--bottom">
  <UnifiedTimelineBar
    context="3d"
    simTimeRef={simTimeRef}
    /* ...existing props... */
    showMissionHeader={layout.missionTimelineHeader}
    missionTrajectory={missionTrajectory}
    telemetryRef={layout.missionTimelineHeader ? telemetryRef : undefined}
  />
</div>
```

- [ ] **Step 8: Pass HUD mode to CesiumHud**

Find where `<CesiumHud` is rendered. Add the mode prop:

```tsx
<CesiumHud
  viewer={cesiumViewer}
  visible={showHud}
  visualMode={visualMode}
  simTimeRef={simTimeRef}
  currentDate={currentDate}
  hudMode={layout.hudMode}
/>
```

- [ ] **Step 9: Pass layout props from globe.astro**

In `src/pages/[tracker]/globe.astro`, update the CesiumGlobe component to pass layout:

```astro
<CesiumGlobe
  client:only="react"
  points={data.mapPoints}
  lines={data.mapLines}
  kpis={data.kpis}
  meta={data.meta}
  events={events}
  cameraPresets={config.globe?.cameraPresets ?? {}}
  categories={config.map?.categories ?? []}
  mapCenter={config.map?.center ?? { lon: 0, lat: 0 }}
  isHistorical={config.temporal === 'historical'}
  endDate={config.endDate}
  clocks={config.globe?.clocks}
  missionTrajectory={missionTrajectory}
  globeLayout={config.globe?.layout ?? 'default'}
  layoutOverrides={config.globe?.layoutOverrides}
/>
```

- [ ] **Step 10: Verify on dev server**

Test `/artemis-2/globe/` — should show mission identity in bottom-left, telemetry in right column below intel, phase bar merged into timeline.
Test `/iran-conflict/globe/` — should look exactly like before (default preset).

- [ ] **Step 11: Commit**

```bash
git add src/components/islands/CesiumGlobe/CesiumGlobe.tsx "src/pages/[tracker]/globe.astro"
git commit -m "feat(globe): layout-driven rendering in CesiumGlobe"
```

---

## Task 7: Update CesiumHud for preset modes

**Files:**
- Modify: `src/components/islands/CesiumGlobe/CesiumHud.tsx`

- [ ] **Step 1: Add hudMode prop**

In CesiumHud.tsx, add to the Props interface:

```typescript
  hudMode?: 'military' | 'civilian';
```

- [ ] **Step 2: Conditionally hide military-only elements**

In the render output, wrap the military-specific elements with a conditional:

```tsx
{/* Top-left — mode label (military only) */}
{hudMode !== 'civilian' && (
  <div className="hud-top-left">
    <div className="hud-mode-label">{visualMode.toUpperCase()}</div>
  </div>
)}

{/* Bottom-left — MGRS + coords (military only) */}
{hudMode !== 'civilian' && (
  <div className="hud-bottom-left">
    <div className="hud-mgrs">{mgrs}</div>
    <div className="hud-coords">{dmsLat} {dmsLon}</div>
  </div>
)}
```

The REC indicator (top-right), altitude/sun (bottom-right), and scale bar (center-bottom) stay visible for all modes.

- [ ] **Step 3: Verify disaster trackers**

Test `/chernobyl-disaster/globe/` (once tracker.json is updated in Task 8) — should show globe without mode label or MGRS.

- [ ] **Step 4: Commit**

```bash
git add src/components/islands/CesiumGlobe/CesiumHud.tsx
git commit -m "feat(globe): CesiumHud respects hudMode (military/civilian)"
```

---

## Task 8: Update tracker configs

**Files:**
- Modify: `trackers/artemis-2/tracker.json`
- Modify: `trackers/chernobyl-disaster/tracker.json`
- Modify: `trackers/fukushima-disaster/tracker.json`

- [ ] **Step 1: Add layout to Artemis-2**

In `trackers/artemis-2/tracker.json`, inside the `"globe"` object, add after `"enabled": true`:

```json
"layout": "mission",
```

- [ ] **Step 2: Add layout to Chernobyl**

In `trackers/chernobyl-disaster/tracker.json`, inside the `"globe"` object, add after `"enabled": true`:

```json
"layout": "disaster",
```

- [ ] **Step 3: Add layout to Fukushima**

In `trackers/fukushima-disaster/tracker.json`, inside the `"globe"` object, add after `"enabled": true`:

```json
"layout": "disaster",
```

- [ ] **Step 4: Verify build**

Run: `npm run build 2>&1 | tail -10`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add trackers/artemis-2/tracker.json trackers/chernobyl-disaster/tracker.json trackers/fukushima-disaster/tracker.json
git commit -m "feat(globe): set layout presets on artemis-2, chernobyl, fukushima"
```

---

## Task 9: Integration test — verify all globe pages

**Files:** None (testing only)

- [ ] **Step 1: Run all tests**

Run: `npx vitest run 2>&1 | tail -10`
Expected: All tests pass

- [ ] **Step 2: Full build**

Run: `npm run build 2>&1 | tail -10`
Expected: Build succeeds

- [ ] **Step 3: Verify Artemis-2 globe (mission preset)**

Start dev server and check `/artemis-2/globe/`:
- Mission Identity card in bottom-left
- Telemetry stacked below Intel in right column
- Phase bar merged as header inside timeline
- No panel overlaps
- Globe is interactive (drag/rotate)
- HUD overlay visible (MGRS, altitude, etc.)

- [ ] **Step 4: Verify Iran Conflict globe (default preset)**

Check `/iran-conflict/globe/`:
- Looks identical to before the refactor
- No mission panels
- Full military HUD
- All controls working

- [ ] **Step 5: Verify Chernobyl globe (disaster preset)**

Check `/chernobyl-disaster/globe/`:
- No MGRS coords, no "NORMAL" mode label
- Altitude/sun angle still visible
- Scale bar still visible
- Otherwise same as default

- [ ] **Step 6: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix(globe): integration fixes for layout system"
```
