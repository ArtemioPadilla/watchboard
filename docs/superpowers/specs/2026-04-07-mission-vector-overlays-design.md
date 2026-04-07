# Mission Vector Overlays for Artemis Globe

**Date:** 2026-04-07
**Status:** Approved
**Tracker:** artemis-2

## Problem

The Artemis globe shows the spacecraft trajectory and telemetry but doesn't visualize the physics — why the path curves, where gravity pulls, when engines fire. Users can't see the forces acting on Orion.

## Solution

Add toggleable vector arrows originating from the spacecraft showing velocity, Earth gravity, Moon gravity, and thrust. Physically computed per-frame. Toggled via a dropdown menu in the globe controls toolbar.

## 1. Vector Types

Four vector types, each independently toggleable:

| Vector | Color | Source | Visibility |
|--------|-------|--------|------------|
| **Velocity** | Green (#4ade80) | Interpolated from waypoint `vx, vy, vz` | Always (when toggled on) |
| **Earth Gravity** | Amber (#f59e0b) | `GM_earth / r²` toward Earth center | Always — dominant near Earth, tiny near Moon |
| **Moon Gravity** | Purple (#a78bfa) | `GM_moon / r²` toward Moon J2000 position | Always — grows during flyby, tiny near Earth |
| **Thrust** | Red (#ef4444) | Derived: `actual_accel - g_earth - g_moon` | Only non-zero during burn phases |

## 2. Physics Computation

All computations run per-frame in the existing tick loop.

### Velocity
Directly from waypoint interpolation — the trajectory data already has `vx, vy, vz` per waypoint. The existing `SampledPositionProperty` interpolates position; we add a parallel velocity interpolation using the same Lagrange polynomial scheme, or compute via finite difference of position.

The velocity vector in the trajectory data is in J2000 inertial frame (same frame as the rendered positions).

### Earth Gravity
```
r_earth = |spacecraft_position|  (distance from Earth center, since trajectory is Earth-centered)
g_earth_magnitude = GM_EARTH / r_earth²
g_earth_direction = normalize(-spacecraft_position)  (toward Earth center)
g_earth = g_earth_magnitude * g_earth_direction
```

Constants: `GM_EARTH = 3.986004418e14 m³/s²`

### Moon Gravity
```
moon_pos = Simon1994PlanetaryPositions.computeMoonPositionInEarthInertialFrame(jd)
r_moon = distance(spacecraft_position, moon_pos)
g_moon_magnitude = GM_MOON / r_moon²
g_moon_direction = normalize(moon_pos - spacecraft_position)
g_moon = g_moon_magnitude * g_moon_direction
```

Constants: `GM_MOON = 4.9048695e12 m³/s²`

### Thrust (Derived)
```
actual_accel = (velocity(t + dt) - velocity(t - dt)) / (2 * dt)  // central difference
gravity_total = g_earth + g_moon
thrust = actual_accel - gravity_total
```

Thrust is only displayed when `|thrust| > THRUST_THRESHOLD` (e.g., 0.01 m/s²) to filter out numerical noise from the finite difference. This naturally shows thrust only during burn phases (TLI, LOI, TEI) where the engines are firing.

## 3. Arrow Rendering

- **Style:** `PolylineArrowMaterialProperty` — CesiumJS built-in arrowheads
- **Length:** Proportional to vector magnitude
  - Velocity: scaled so 1 km/s ≈ a visually meaningful arrow length at current zoom
  - Gravity: scaled relative to each other (Earth vs Moon) so the dominant force has a longer arrow
  - Thrust: same scale as gravity (they're both accelerations in m/s²)
- **Adaptive scaling:** Arrow length multiplied by the same camera-distance-based scale factor used for the spacecraft model (from `spacecraft-scale.ts`). This ensures arrows are visible at trajectory view and don't become absurdly large when zoomed in.
- **Width:** 8px velocity, 6px gravity arrows, 10px thrust
- **Origin:** All arrows originate from the spacecraft's current position
- **Depth:** Use `depthFailMaterial` so arrows are visible behind Earth/Moon

## 4. Toggle UI

A "Vectors" button in the `CesiumControls.tsx` toolbar. Clicking it opens a dropdown panel with four checkboxes (one per vector type). Each checkbox has the vector's color as its accent.

```
┌─────────────────────┐
│  VECTORS            │
│  ☑ Velocity         │  green
│  ☑ Earth Gravity    │  amber
│  ☐ Moon Gravity     │  purple
│  ☐ Thrust           │  red
└─────────────────────┘
```

Default state: all off. Toggle state lives in React component state (not URL or localStorage).

The dropdown closes when clicking outside it. The toolbar button shows a dot indicator when any vectors are active.

## 5. Files

| File | Action | Responsibility |
|------|--------|----------------|
| `src/components/islands/CesiumGlobe/mission-vectors.ts` | Create | Physics: gravity computation, thrust derivation, velocity interpolation. Pure functions, no CesiumJS entities. |
| `src/components/islands/CesiumGlobe/useMissionVectors.ts` | Create | React hook: creates/updates/destroys arrow entities per frame based on toggle state. Calls physics functions from mission-vectors.ts. |
| `src/components/islands/CesiumGlobe/mission-helpers.ts` | Modify | Add `GM_EARTH`, `GM_MOON` constants. Add `getSunPosition()` if not already present. |
| `src/components/islands/CesiumGlobe/CesiumControls.tsx` | Modify | Add "Vectors" dropdown button with 4 colored checkboxes. |
| `src/components/islands/CesiumGlobe/CesiumGlobe.tsx` | Modify | Wire `useMissionVectors` hook, pass toggle state from controls. |

## 6. Data Dependencies

All data needed is already available:
- Waypoint positions and velocities: `trajectory.waypoints` (x, y, z, vx, vy, vz, t)
- Moon position: `Simon1994PlanetaryPositions` (already imported in useLunarMission)
- Spacecraft position: `positionProperty` from useLunarMission
- Phase data: `trajectory.phases` (for identifying burn phases)
- Camera distance: `viewer.camera.positionWC` (for adaptive arrow scaling)

No new data files or API calls required.

## Out of Scope

- Vector magnitude labels/numeric readouts (telemetry panel already shows velocity)
- Acceleration history trails (showing past vectors along the trajectory)
- Vector field visualization (vectors at multiple trajectory points simultaneously)
- Solar radiation pressure vector
- Precomputed trajectory acceleration data in the JSON file (can be added later if runtime finite-difference perf is an issue)
