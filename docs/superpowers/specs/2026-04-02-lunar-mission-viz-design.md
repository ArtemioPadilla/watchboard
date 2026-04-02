# Artemis 2 Lunar Mission Visualization

**Date**: 2026-04-02
**Status**: Approved
**Scope**: Extend CesiumGlobe to visualize the Artemis 2 Earth-to-Moon trajectory with spacecraft tracking, telemetry HUD, and hybrid Moon LOD

---

## Problem

The Artemis 2 tracker has a 3D globe enabled but it only shows Earth-surface map points (launch sites, mission control, etc.). There's no way to visualize the actual mission trajectory — the spacecraft's journey from Earth to the Moon and back — which is the core story of this tracker.

## Solution

Extend the existing CesiumGlobe system with a `useLunarMission` hook that reads pre-computed trajectory waypoints, renders the spacecraft moving along the trajectory in real-time, and displays a Mission Control-style HUD overlay with live telemetry (altitude, velocity, distance to Moon, mission phase, elapsed time).

The Moon is rendered using CesiumJS's built-in celestial body model at distance. When the camera is within 50,000 km of the Moon (during the flyby phase), high-resolution LROC imagery tiles are loaded for surface detail.

No new pages — this activates automatically on `/artemis-2/globe/` when `mission-trajectory.json` exists in the tracker's data directory.

---

## Data Format — `mission-trajectory.json`

Stored at `trackers/artemis-2/data/mission-trajectory.json`. Can be populated by the nightly pipeline or manually.

```json
{
  "vehicle": "Orion MPCV",
  "crew": [
    { "name": "Reid Wiseman", "role": "Commander" },
    { "name": "Victor Glover", "role": "Pilot" },
    { "name": "Christina Koch", "role": "Mission Specialist 1" },
    { "name": "Jeremy Hansen", "role": "Mission Specialist 2" }
  ],
  "launchTime": "2026-04-01T18:24:00Z",
  "splashdownTime": "2026-04-11T14:00:00Z",
  "phases": [
    { "id": "launch", "label": "Launch", "start": "2026-04-01T18:24:00Z", "end": "2026-04-01T18:32:00Z" },
    { "id": "tli", "label": "Trans-Lunar Injection", "start": "2026-04-01T20:00:00Z", "end": "2026-04-01T20:25:00Z" },
    { "id": "outbound", "label": "Outbound Coast", "start": "2026-04-01T20:25:00Z", "end": "2026-04-05T12:00:00Z" },
    { "id": "flyby", "label": "Lunar Flyby", "start": "2026-04-05T12:00:00Z", "end": "2026-04-05T18:00:00Z" },
    { "id": "return", "label": "Return Coast", "start": "2026-04-05T18:00:00Z", "end": "2026-04-11T12:00:00Z" },
    { "id": "reentry", "label": "Reentry & Splashdown", "start": "2026-04-11T12:00:00Z", "end": "2026-04-11T14:00:00Z" }
  ],
  "waypoints": [
    { "t": "2026-04-01T18:24:00Z", "x": -1529.3, "y": -5765.1, "z": 3080.2, "vx": 7.12, "vy": 1.34, "vz": 3.89 }
  ]
}
```

**Coordinate system**: Waypoints use Earth-Centered Inertial (ECI) J2000 coordinates in kilometers. Velocity components (km/s) are included for direct telemetry display. CesiumJS's `Transforms.computeIcrfToFixedMatrix()` converts ECI to the globe's Earth-Centered Earth-Fixed (ECEF) frame.

**Waypoint density**: ~500 waypoints across the ~10 day mission. CesiumJS's `SampledPositionProperty` with `LagrangePolynomialApproximation` interpolates smoothly between points.

---

## Architecture

### New Files

| File | Purpose |
|------|---------|
| `src/components/islands/CesiumGlobe/useLunarMission.ts` | Hook: trajectory rendering, spacecraft entity, telemetry computation, Moon LOD |
| `src/components/islands/CesiumGlobe/MissionHUD.tsx` | React component: telemetry overlay panels on globe canvas |
| `src/components/islands/CesiumGlobe/mission-helpers.ts` | Utilities: ECI→ECEF conversion, telemetry math, Moon position lookup |
| `trackers/artemis-2/data/mission-trajectory.json` | Pre-computed trajectory data |

### Modified Files

| File | Change |
|------|--------|
| `src/components/islands/CesiumGlobe/CesiumGlobe.tsx` | Accept `missionTrajectory` prop, initialize `useLunarMission`, render `MissionHUD` |
| `src/pages/[tracker]/globe.astro` | Load `mission-trajectory.json` if present, pass to CesiumGlobe |
| `src/lib/schemas.ts` | Add `MissionTrajectorySchema` for Zod validation |

### Data Flow

```
globe.astro
  └─ loads mission-trajectory.json (if exists)
  └─ passes as `missionTrajectory` prop to CesiumGlobe

CesiumGlobe.tsx
  └─ if missionTrajectory present:
       └─ useLunarMission(viewer, missionTrajectory, simTimeRef)
            ├─ Creates SampledPositionProperty from waypoints (ECI→ECEF)
            ├─ Renders trajectory polyline (dimmed past + bright future)
            ├─ Renders spacecraft billboard entity tracking position
            ├─ Computes telemetry per frame → writes to telemetryRef
            ├─ Monitors camera distance to Moon → loads LROC tiles when < 50,000 km
            └─ Returns { telemetryRef, missionCameraPresets }
       └─ <MissionHUD telemetryRef={telemetryRef} />
            ├─ Top-left: mission name, phase, MET
            ├─ Top-right: altitude, velocity, distance to Moon
            └─ Bottom: phase timeline with progress bar
```

---

## Component Details

### `useLunarMission.ts`

**Inputs**: `viewer: Cesium.Viewer`, `trajectory: MissionTrajectory`, `simTimeRef: MutableRefObject<number>`

**Responsibilities**:

1. **Trajectory rendering**: Convert waypoints from ECI to ECEF using `Transforms.computeIcrfToFixedMatrix()` at each waypoint's timestamp. Create a `SampledPositionProperty` with `LagrangePolynomialApproximation` (degree 5) for smooth interpolation. Render as a `PolylineGraphics` with two segments: past (dimmed, 30% opacity) and future (bright, full glow material).

2. **Spacecraft entity**: Billboard entity using a custom SVG icon (Orion capsule silhouette). Position bound to the `SampledPositionProperty`. Scale: near (1e6m) = 1.0x, far (1e8m) = 0.3x. Label with "ORION" text.

3. **Telemetry computation** (per RAF frame):
   - Current position from `SampledPositionProperty.getValue(currentTime)`
   - Altitude: distance from Earth center minus Earth radius (6,371 km)
   - Velocity: magnitude of velocity vector (interpolated from waypoint vx/vy/vz)
   - Distance to Moon: current position minus Moon position (via `Simon1994PlanetaryPositions`)
   - Mission Elapsed Time: `currentTime - launchTime`
   - Current phase: find phase where `start <= currentTime < end`
   - Phase progress: `(currentTime - phase.start) / (phase.end - phase.start)`
   - Overall progress: `(currentTime - launchTime) / (splashdownTime - launchTime)`

4. **Moon LOD**: On each frame, compute camera distance to Moon center. When < 50,000 km, lazy-load LROC WAC global mosaic tiles onto the Moon ellipsoid. When > 60,000 km, unload (10,000 km hysteresis to prevent flicker).

5. **Camera presets**: Return mission-specific presets that get merged with the tracker's existing presets:
   - Earth Departure: Kennedy Space Center, 200 km alt
   - LEO Overview: 2,000 km alt
   - Deep Space: 500,000 km alt (Earth + Moon + trajectory visible)
   - Lunar Approach: 100,000 km from Moon
   - Lunar Flyby: 10,000 km from Moon surface
   - Return Overview: wide view
   - Splashdown: Pacific recovery zone, 100 km alt

**Output**: `{ telemetryRef: MutableRefObject<TelemetryState>, missionCameraPresets: Record<string, CameraPreset> }`

### `MissionHUD.tsx`

**Rendering strategy**: DOM overlay on the globe canvas, absolutely positioned. Updates via RAF reading from `telemetryRef.current` — not React state. This avoids re-render overhead (same pattern as the existing clock display).

**Panels**:

- **Top-left panel** (mission identity):
  - Mission name: "ARTEMIS II"
  - Current phase label with color-coded dot
  - MET formatted as `DD:HH:MM:SS`

- **Top-right panel** (telemetry):
  - Altitude: formatted with unit switching (km when > 1000 km, m when < 1000 km)
  - Velocity: km/s or m/s
  - Distance to Moon: km with separator formatting

- **Bottom bar** (phase timeline):
  - Horizontal bar spanning full width
  - Phase labels positioned proportionally by duration
  - Progress indicator (filled bar + spacecraft icon marker)
  - Current phase highlighted, past phases dimmed, future phases gray

**Styling**: Semi-transparent dark panels (`rgba(0,0,0,0.75)`), monospace font (JetBrains Mono), border `1px solid #333`. Color coding: green (#4ade80) for mission identity, blue (#60a5fa) for altitude, amber (#f59e0b) for velocity, purple (#a78bfa) for Moon distance.

### `mission-helpers.ts`

- `eciToEcef(eciPos: {x,y,z}, julianDate: JulianDate): Cartesian3` — converts ECI J2000 km to ECEF meters using `Transforms.computeIcrfToFixedMatrix()`
- `computeTelemetry(position: Cartesian3, velocity: {vx,vy,vz}, moonPosition: Cartesian3, launchTime: JulianDate, currentTime: JulianDate, phases: Phase[]): TelemetryState` — computes all telemetry values from raw position/velocity
- `getMoonPosition(julianDate: JulianDate): Cartesian3` — wraps `Simon1994PlanetaryPositions.computeSunMoonPositions()` to get Moon's ECEF position
- `formatMET(seconds: number): string` — formats as `DD:HH:MM:SS`
- `formatDistance(meters: number): string` — auto-scales km/m with separators

### Schema — `MissionTrajectorySchema`

Added to `src/lib/schemas.ts`:

```typescript
const MissionPhaseSchema = z.object({
  id: z.string(),
  label: z.string(),
  start: z.string(),
  end: z.string(),
});

const MissionCrewSchema = z.object({
  name: z.string(),
  role: z.string(),
});

const MissionWaypointSchema = z.object({
  t: z.string(),
  x: z.number(), y: z.number(), z: z.number(),
  vx: z.number(), vy: z.number(), vz: z.number(),
});

export const MissionTrajectorySchema = z.object({
  vehicle: z.string(),
  crew: z.array(MissionCrewSchema),
  launchTime: z.string(),
  splashdownTime: z.string(),
  phases: z.array(MissionPhaseSchema).min(1),
  waypoints: z.array(MissionWaypointSchema).min(2),
});
```

---

## Moon Rendering

### At distance (> 50,000 km)

CesiumJS's built-in Moon model via `scene.moon.show = true`. This renders a correctly positioned, correctly lit sphere at the Moon's real orbital position. No custom imagery — just the default Cesium Moon texture.

### Close-up (< 50,000 km) — LROC hybrid mode

When camera distance to Moon center drops below 50,000 km:

1. Load NASA LROC WAC global mosaic as a `SingleTileImageryProvider` (100m/px global map, ~2.5 MB compressed)
2. Apply to a `Cesium.Moon` entity using `EllipsoidGraphics` with `Ellipsoid.MOON` radii (1,737.4 km)
3. Position entity at Moon's computed ECEF position for the current time

When camera distance exceeds 60,000 km (10,000 km hysteresis), remove the detailed entity and revert to built-in Moon.

LROC tile source: `https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd/` (public, no API key needed)

---

## Globe Page Integration

`src/pages/[tracker]/globe.astro` changes:

```typescript
// Load mission trajectory if it exists
let missionTrajectory = null;
try {
  const trajPath = `../../trackers/${config.slug}/data/mission-trajectory.json`;
  const trajModule = await import(trajPath);
  missionTrajectory = trajModule.default;
} catch {}
```

Pass to CesiumGlobe: `missionTrajectory={missionTrajectory}`

The globe component checks: if `missionTrajectory` is non-null, enable mission mode. Otherwise, render normally (Earth-only map points).

---

## Trajectory Data Population

The initial `mission-trajectory.json` will be created manually using NASA's published Artemis 2 trajectory data (press kits, trajectory design documents). The nightly update pipeline can refresh it if trajectory corrections are published.

For the initial implementation, placeholder waypoints approximating a free-return lunar trajectory will be generated:
- Launch from KSC (28.6°N, 80.6°W)
- LEO parking orbit at 185 km
- TLI burn to escape velocity
- Outbound coast (~4 days)
- Lunar flyby at ~100 km altitude above lunar far side
- Free-return trajectory back to Earth (~5 days)
- Reentry and Pacific splashdown

Waypoint generation: a script (`scripts/generate-artemis-trajectory.ts`) computes approximate positions using patched conic approximation (two-body problem Earth + Moon). This produces physically plausible positions even though it's not JPL-precision.

---

## Out of Scope

These items are explicitly deferred and can be built as separate enhancements:

1. **Lunar landing visualization** — Artemis 2 is a flyby mission, not a landing. Future Artemis 3+ trackers could add descent/ascent trajectory segments and lunar surface EVA markers.

2. **Multiple spacecraft/stages** — Service module separation, SLS booster separation, ICPS jettison. The current design tracks a single "Orion" entity. Stage separation could be added by supporting multiple vehicles in the trajectory data with visibility windows.

3. **Real-time NASA telemetry API** — Live feeds from NASA's Deep Space Network or Mission Control. Would replace pre-computed waypoints with streaming data. Requires NASA API access and WebSocket/SSE integration.

4. **Audio/comms simulation** — Simulated mission control audio, comm delay indicators, blackout zone visualization during lunar far-side flyby.

5. **`forceIntervalUntil` override** — Preventive frequency override for the adaptive update system. Small separate task: add one field to `UpdatePolicySchema`, ~5 lines in the resolve phase. Not related to 3D visualization.

6. **Detailed lunar topography** — Terrain elevation model (DEM) for the Moon surface. The LROC mosaic provides imagery but the Moon is rendered as a smooth ellipsoid. Adding actual crater relief requires `Cesium.TerrainProvider` with lunar DEM tiles.

7. **Deep Space Network visualization** — Showing the DSN antenna dishes tracking Orion, with signal path lines from Earth stations to the spacecraft.

8. **Trajectory comparison** — Overlaying Artemis 1 (uncrewed) trajectory alongside Artemis 2 for comparison.

---

## Files Summary

| File | Action | Lines (est.) |
|------|--------|-------------|
| `src/components/islands/CesiumGlobe/useLunarMission.ts` | Create | ~250 |
| `src/components/islands/CesiumGlobe/MissionHUD.tsx` | Create | ~180 |
| `src/components/islands/CesiumGlobe/mission-helpers.ts` | Create | ~120 |
| `src/components/islands/CesiumGlobe/CesiumGlobe.tsx` | Modify | ~+20 |
| `src/pages/[tracker]/globe.astro` | Modify | ~+10 |
| `src/lib/schemas.ts` | Modify | ~+25 |
| `trackers/artemis-2/data/mission-trajectory.json` | Create | ~500 waypoints |
| `scripts/generate-artemis-trajectory.ts` | Create | ~150 |
