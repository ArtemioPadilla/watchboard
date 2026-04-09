# Mission Vector Overlays — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add toggleable physics vector arrows (velocity, Earth gravity, Moon gravity, thrust) on the Artemis globe spacecraft, computed physically per-frame.

**Architecture:** A new `mission-vectors.ts` module provides pure physics functions (gravity, thrust derivation). A `useMissionVectors.ts` hook creates CesiumJS polyline arrow entities and updates them per-frame from the existing tick loop. Toggle state lives in `CesiumGlobe.tsx` and flows through `CesiumControls.tsx` as a dropdown with checkboxes.

**Tech Stack:** CesiumJS 1.139 (PolylineArrowMaterialProperty, CallbackProperty), React, TypeScript

**Spec:** `docs/superpowers/specs/2026-04-07-mission-vector-overlays-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/components/islands/CesiumGlobe/mission-vectors.ts` | Create | Pure physics: gravity vectors, velocity interpolation, thrust derivation. No CesiumJS entities. |
| `src/components/islands/CesiumGlobe/useMissionVectors.ts` | Create | React hook: creates/updates/destroys arrow entities, reads toggle state + sim time. |
| `src/components/islands/CesiumGlobe/CesiumControls.tsx` | Modify | Add "Vectors" dropdown toolbar section with 4 checkboxes. |
| `src/components/islands/CesiumGlobe/CesiumGlobe.tsx` | Modify | Add vector toggle state, wire `useMissionVectors` hook, pass props to controls. |

---

### Task 1: Physics module — mission-vectors.ts

**Files:**
- Create: `src/components/islands/CesiumGlobe/mission-vectors.ts`

- [ ] **Step 1: Create the physics module**

Create `src/components/islands/CesiumGlobe/mission-vectors.ts`:

```ts
import { Cartesian3, JulianDate, Simon1994PlanetaryPositions } from 'cesium';

// Gravitational parameters (m³/s²)
export const GM_EARTH = 3.986004418e14;
export const GM_MOON = 4.9048695e12;

// Threshold below which thrust is considered numerical noise (m/s²)
const THRUST_THRESHOLD = 0.01;

export interface VectorSet {
  /** Velocity direction and magnitude in m/s (J2000 frame) */
  velocity: Cartesian3;
  /** Gravitational acceleration toward Earth center in m/s² */
  gravityEarth: Cartesian3;
  /** Gravitational acceleration toward Moon in m/s² */
  gravityMoon: Cartesian3;
  /** Thrust acceleration in m/s² (zero if below noise threshold) */
  thrust: Cartesian3;
}

// Scratch vectors for GC-free computation
const scratchGravDir = new Cartesian3();
const scratchMoonDir = new Cartesian3();
const scratchAccel = new Cartesian3();
const scratchGravTotal = new Cartesian3();

/**
 * Compute gravitational acceleration from a body at `bodyPos` with
 * gravitational parameter `gm`, acting on a spacecraft at `scPos`.
 * All positions in meters. Returns acceleration in m/s².
 */
export function computeGravity(
  scPos: Cartesian3,
  bodyPos: Cartesian3,
  gm: number,
  result: Cartesian3,
): Cartesian3 {
  // Direction: body - spacecraft
  Cartesian3.subtract(bodyPos, scPos, scratchGravDir);
  const dist = Cartesian3.magnitude(scratchGravDir);
  if (dist < 1) {
    return Cartesian3.clone(Cartesian3.ZERO, result);
  }
  // Normalize direction
  Cartesian3.normalize(scratchGravDir, scratchGravDir);
  // Magnitude = GM / r²
  const mag = gm / (dist * dist);
  return Cartesian3.multiplyByScalar(scratchGravDir, mag, result);
}

/**
 * Compute all physics vectors for the spacecraft at the given time.
 *
 * @param scPos Spacecraft position in meters (J2000-as-ECEF frame)
 * @param velKmS Velocity components in km/s (J2000 frame)
 * @param prevVelKmS Velocity at t - dt (for thrust derivation)
 * @param nextVelKmS Velocity at t + dt (for thrust derivation)
 * @param dt Time step in seconds between prev/next velocity samples
 * @param currentJd Julian date for Moon position computation
 */
export function computeVectorSet(
  scPos: Cartesian3,
  velKmS: { x: number; y: number; z: number },
  prevVelKmS: { x: number; y: number; z: number } | null,
  nextVelKmS: { x: number; y: number; z: number } | null,
  dt: number,
  currentJd: JulianDate,
): VectorSet {
  // Velocity in m/s
  const velocity = new Cartesian3(velKmS.x * 1000, velKmS.y * 1000, velKmS.z * 1000);

  // Earth gravity: Earth is at origin in our frame
  const gravityEarth = new Cartesian3();
  computeGravity(scPos, Cartesian3.ZERO, GM_EARTH, gravityEarth);

  // Moon gravity: Moon position in J2000 (meters)
  const moonEci = Simon1994PlanetaryPositions.computeMoonPositionInEarthInertialFrame(currentJd);
  const gravityMoon = new Cartesian3();
  computeGravity(scPos, moonEci, GM_MOON, gravityMoon);

  // Thrust = actual_accel - gravity_total (only if we have prev/next velocity)
  let thrust = Cartesian3.ZERO;
  if (prevVelKmS && nextVelKmS && dt > 0) {
    // Central difference: dv/dt = (v_next - v_prev) / (2*dt) in m/s²
    const accelX = ((nextVelKmS.x - prevVelKmS.x) * 1000) / (2 * dt);
    const accelY = ((nextVelKmS.y - prevVelKmS.y) * 1000) / (2 * dt);
    const accelZ = ((nextVelKmS.z - prevVelKmS.z) * 1000) / (2 * dt);
    Cartesian3.fromElements(accelX, accelY, accelZ, scratchAccel);

    // Subtract gravity to isolate thrust
    Cartesian3.add(gravityEarth, gravityMoon, scratchGravTotal);
    const thrustVec = Cartesian3.subtract(scratchAccel, scratchGravTotal, new Cartesian3());

    if (Cartesian3.magnitude(thrustVec) > THRUST_THRESHOLD) {
      thrust = thrustVec;
    }
  }

  return { velocity, gravityEarth, gravityMoon, thrust };
}

/**
 * Interpolate velocity components from waypoint data at a given time.
 * Returns {x, y, z} in km/s, or null if outside range.
 */
export function interpolateVelocity(
  waypoints: { t: string; vx: number; vy: number; vz: number }[],
  currentJd: JulianDate,
): { x: number; y: number; z: number } | null {
  for (let i = 0; i < waypoints.length - 1; i++) {
    const t0 = JulianDate.fromIso8601(waypoints[i].t);
    const t1 = JulianDate.fromIso8601(waypoints[i + 1].t);
    if (
      JulianDate.greaterThanOrEquals(currentJd, t0) &&
      JulianDate.lessThan(currentJd, t1)
    ) {
      const dur = JulianDate.secondsDifference(t1, t0);
      if (dur <= 0) return null;
      const frac = JulianDate.secondsDifference(currentJd, t0) / dur;
      const wp0 = waypoints[i];
      const wp1 = waypoints[i + 1];
      return {
        x: wp0.vx + frac * (wp1.vx - wp0.vx),
        y: wp0.vy + frac * (wp1.vy - wp0.vy),
        z: wp0.vz + frac * (wp1.vz - wp0.vz),
      };
    }
  }
  return null;
}

/**
 * Get velocity at t ± offset seconds for thrust central difference.
 */
export function interpolateVelocityAtOffset(
  waypoints: { t: string; vx: number; vy: number; vz: number }[],
  currentJd: JulianDate,
  offsetSeconds: number,
): { x: number; y: number; z: number } | null {
  const offsetJd = JulianDate.addSeconds(currentJd, offsetSeconds, new JulianDate());
  return interpolateVelocity(waypoints, offsetJd);
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit 2>&1 | grep mission-vectors
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/islands/CesiumGlobe/mission-vectors.ts
git commit -m "feat(artemis): add mission vector physics module (gravity, thrust, velocity)"
```

---

### Task 2: Vector arrow hook — useMissionVectors.ts

**Files:**
- Create: `src/components/islands/CesiumGlobe/useMissionVectors.ts`

- [ ] **Step 1: Create the hook**

Create `src/components/islands/CesiumGlobe/useMissionVectors.ts`:

```ts
import { useEffect, useRef, type MutableRefObject } from 'react';
import {
  Cartesian3,
  Color,
  JulianDate,
  CallbackProperty,
  PolylineArrowMaterialProperty,
  type Viewer as CesiumViewer,
  type Entity,
} from 'cesium';
import type { MissionTrajectory } from '../../../lib/schemas';
import {
  computeVectorSet,
  interpolateVelocity,
  interpolateVelocityAtOffset,
  type VectorSet,
} from './mission-vectors';
import { computeAdaptiveScale } from './spacecraft-scale';

export interface VectorToggles {
  velocity: boolean;
  gravityEarth: boolean;
  gravityMoon: boolean;
  thrust: boolean;
}

export const DEFAULT_VECTOR_TOGGLES: VectorToggles = {
  velocity: false,
  gravityEarth: false,
  gravityMoon: false,
  thrust: false,
};

interface VectorConfig {
  key: keyof VectorToggles;
  color: string;
  width: number;
  /** Scale multiplier to convert physical units to visual arrow length.
   *  Velocity is in m/s, accelerations in m/s². Different scales needed. */
  unitScale: number;
}

const VECTOR_CONFIGS: VectorConfig[] = [
  { key: 'velocity', color: '#4ade80', width: 8, unitScale: 0.5 },       // 1 km/s → 500m visual
  { key: 'gravityEarth', color: '#f59e0b', width: 6, unitScale: 50000 }, // accel is tiny, scale up
  { key: 'gravityMoon', color: '#a78bfa', width: 6, unitScale: 50000 },
  { key: 'thrust', color: '#ef4444', width: 10, unitScale: 50000 },
];

// Central difference dt for thrust computation (seconds)
const THRUST_DT = 30;

export function useMissionVectors(
  viewer: CesiumViewer | null,
  trajectory: MissionTrajectory | null,
  simTimeRef: MutableRefObject<number>,
  toggles: VectorToggles,
) {
  const entitiesRef = useRef<Map<string, Entity>>(new Map());
  const vectorsRef = useRef<VectorSet | null>(null);

  // Create/destroy entities when toggles change
  useEffect(() => {
    if (!viewer || !trajectory) return;

    const existing = entitiesRef.current;

    for (const config of VECTOR_CONFIGS) {
      const isOn = toggles[config.key];
      const hasEntity = existing.has(config.key);

      if (isOn && !hasEntity) {
        // Create arrow entity
        const entity = viewer.entities.add({
          polyline: {
            positions: new CallbackProperty(() => {
              const vecs = vectorsRef.current;
              if (!vecs) return [Cartesian3.ZERO, Cartesian3.ZERO];

              const simMs = simTimeRef.current;
              if (!simMs) return [Cartesian3.ZERO, Cartesian3.ZERO];

              const currentJd = JulianDate.fromDate(new Date(simMs));
              // Get spacecraft position for arrow origin
              const launchMs = new Date(trajectory.launchTime).getTime();
              const splashMs = new Date(trajectory.splashdownTime).getTime();
              if (simMs < launchMs || simMs > splashMs) return [Cartesian3.ZERO, Cartesian3.ZERO];

              // Find spacecraft position from waypoints
              let scPos: Cartesian3 | null = null;
              for (let i = 0; i < trajectory.waypoints.length - 1; i++) {
                const t0 = new Date(trajectory.waypoints[i].t).getTime();
                const t1 = new Date(trajectory.waypoints[i + 1].t).getTime();
                if (simMs >= t0 && simMs < t1) {
                  const frac = (simMs - t0) / (t1 - t0);
                  const wp0 = trajectory.waypoints[i];
                  const wp1 = trajectory.waypoints[i + 1];
                  scPos = new Cartesian3(
                    (wp0.x + frac * (wp1.x - wp0.x)) * 1000,
                    (wp0.y + frac * (wp1.y - wp0.y)) * 1000,
                    (wp0.z + frac * (wp1.z - wp0.z)) * 1000,
                  );
                  break;
                }
              }
              if (!scPos) return [Cartesian3.ZERO, Cartesian3.ZERO];

              const vec = vecs[config.key];
              const mag = Cartesian3.magnitude(vec);
              if (mag < 1e-10) return [scPos, scPos]; // zero vector — collapse arrow

              // Scale arrow length: physical magnitude × unitScale × camera-adaptive scale
              const cameraScale = computeAdaptiveScale(viewer, scPos);
              const arrowLength = mag * config.unitScale * (cameraScale / 50000);

              const dir = Cartesian3.normalize(vec, new Cartesian3());
              const end = Cartesian3.add(
                scPos,
                Cartesian3.multiplyByScalar(dir, arrowLength, new Cartesian3()),
                new Cartesian3(),
              );
              return [scPos, end];
            }, false),
            width: config.width,
            material: new PolylineArrowMaterialProperty(
              Color.fromCssColorString(config.color),
            ),
          },
        });
        existing.set(config.key, entity);
      } else if (!isOn && hasEntity) {
        // Remove arrow entity
        const entity = existing.get(config.key)!;
        viewer.entities.remove(entity);
        existing.delete(config.key);
      }
    }

    return () => {
      for (const [, entity] of existing) {
        try { viewer.entities.remove(entity); } catch {}
      }
      existing.clear();
    };
  }, [viewer, trajectory, toggles.velocity, toggles.gravityEarth, toggles.gravityMoon, toggles.thrust]);

  // Per-frame vector computation (called from useLunarMission tick or standalone)
  useEffect(() => {
    if (!viewer || !trajectory || trajectory.waypoints.length < 3) return;

    let rafId = 0;
    const tick = () => {
      const simMs = simTimeRef.current;
      if (simMs) {
        const currentJd = JulianDate.fromDate(new Date(simMs));

        // Interpolate current velocity
        const vel = interpolateVelocity(trajectory.waypoints, currentJd);
        if (vel) {
          // Get prev/next velocity for thrust derivation
          const prevVel = interpolateVelocityAtOffset(trajectory.waypoints, currentJd, -THRUST_DT);
          const nextVel = interpolateVelocityAtOffset(trajectory.waypoints, currentJd, THRUST_DT);

          // Spacecraft position (meters) — find from waypoints
          let scPos = Cartesian3.ZERO;
          for (let i = 0; i < trajectory.waypoints.length - 1; i++) {
            const t0 = new Date(trajectory.waypoints[i].t).getTime();
            const t1 = new Date(trajectory.waypoints[i + 1].t).getTime();
            if (simMs >= t0 && simMs < t1) {
              const frac = (simMs - t0) / (t1 - t0);
              const wp0 = trajectory.waypoints[i];
              const wp1 = trajectory.waypoints[i + 1];
              scPos = new Cartesian3(
                (wp0.x + frac * (wp1.x - wp0.x)) * 1000,
                (wp0.y + frac * (wp1.y - wp0.y)) * 1000,
                (wp0.z + frac * (wp1.z - wp0.z)) * 1000,
              );
              break;
            }
          }

          vectorsRef.current = computeVectorSet(
            scPos, vel, prevVel, nextVel, THRUST_DT, currentJd,
          );
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(rafId);
  }, [viewer, trajectory]);
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit 2>&1 | grep useMissionVectors
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/islands/CesiumGlobe/useMissionVectors.ts
git commit -m "feat(artemis): add useMissionVectors hook with per-frame arrow entities"
```

---

### Task 3: Add vector toggles to CesiumControls

**Files:**
- Modify: `src/components/islands/CesiumGlobe/CesiumControls.tsx`

- [ ] **Step 1: Add vector props to the Props interface**

In `CesiumControls.tsx`, add these to the `Props` interface (after `onToggleCinematic`):

```ts
  vectorToggles?: VectorToggles;
  onToggleVector?: (key: keyof VectorToggles) => void;
```

Add the import at the top of the file:

```ts
import type { VectorToggles } from './useMissionVectors';
```

Add `'vectors'` to the `ToolbarSection` union:

```ts
type ToolbarSection = 'filters' | 'camera' | 'visual' | 'layers' | 'vectors';
```

- [ ] **Step 2: Add the Vectors dropdown in the toolbar JSX**

Find the toolbar section in the JSX (look for the camera/visual/layers buttons). Add the vectors button and dropdown after the existing toolbar buttons, inside the toolbar `div`. Only render if `vectorToggles` is provided:

```tsx
{vectorToggles && onToggleVector && (
  <div style={{ position: 'relative' }}>
    <button
      className={`globe-toolbar-btn ${activeSection === 'vectors' ? 'active' : ''}`}
      onClick={() => toggle('vectors')}
      title="Physics Vectors"
      style={{ position: 'relative' }}
    >
      V⃗
      {(vectorToggles.velocity || vectorToggles.gravityEarth || vectorToggles.gravityMoon || vectorToggles.thrust) && (
        <span style={{
          position: 'absolute', top: 2, right: 2, width: 6, height: 6,
          borderRadius: '50%', background: '#4ade80',
        }} />
      )}
    </button>
    {activeSection === 'vectors' && (
      <div className="globe-dropdown" style={{ minWidth: 180 }}>
        <div style={{ padding: '8px 12px', fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
          Vectors
        </div>
        {([
          { key: 'velocity' as const, label: 'Velocity', color: '#4ade80' },
          { key: 'gravityEarth' as const, label: 'Earth Gravity', color: '#f59e0b' },
          { key: 'gravityMoon' as const, label: 'Moon Gravity', color: '#a78bfa' },
          { key: 'thrust' as const, label: 'Thrust', color: '#ef4444' },
        ]).map(v => (
          <label
            key={v.key}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '4px 12px', cursor: 'pointer', fontSize: '12px',
              color: vectorToggles[v.key] ? v.color : '#94a3b8',
            }}
            onClick={() => onToggleVector(v.key)}
          >
            <span style={{
              width: 14, height: 14, borderRadius: 3,
              border: `2px solid ${v.color}`,
              background: vectorToggles[v.key] ? v.color : 'transparent',
              display: 'inline-block',
            }} />
            {v.label}
          </label>
        ))}
      </div>
    )}
  </div>
)}
```

- [ ] **Step 3: Destructure new props**

In the function parameter destructuring (around line 54-79), add:

```ts
  vectorToggles,
  onToggleVector,
```

- [ ] **Step 4: Verify it compiles**

```bash
npx tsc --noEmit 2>&1 | grep CesiumControls
```

Expected: no errors (new props are optional).

- [ ] **Step 5: Commit**

```bash
git add src/components/islands/CesiumGlobe/CesiumControls.tsx
git commit -m "feat(artemis): add vectors dropdown to globe controls toolbar"
```

---

### Task 4: Wire everything in CesiumGlobe.tsx

**Files:**
- Modify: `src/components/islands/CesiumGlobe/CesiumGlobe.tsx`

- [ ] **Step 1: Add imports**

Add at the top with the other hook imports:

```ts
import { useMissionVectors, DEFAULT_VECTOR_TOGGLES, type VectorToggles } from './useMissionVectors';
```

- [ ] **Step 2: Add vector toggle state**

After the existing state declarations (around line 136, near `showHud`), add:

```ts
  // ── Vector overlays ──
  const [vectorToggles, setVectorToggles] = useState<VectorToggles>(DEFAULT_VECTOR_TOGGLES);
```

- [ ] **Step 3: Add toggle handler**

After the state declaration, add:

```ts
  const handleToggleVector = (key: keyof VectorToggles) => {
    setVectorToggles(prev => ({ ...prev, [key]: !prev[key] }));
  };
```

- [ ] **Step 4: Wire the hook**

After the existing `useLunarMission` call (around line 461), add:

```ts
  useMissionVectors(cesiumViewer, missionTrajectory ?? null, simTimeRef, vectorToggles);
```

- [ ] **Step 5: Pass props to CesiumControls**

Find the `<CesiumControls` JSX (around line 620+). Add these props:

```tsx
  vectorToggles={missionTrajectory ? vectorToggles : undefined}
  onToggleVector={handleToggleVector}
```

- [ ] **Step 6: Verify the full build**

```bash
npm run build
```

Expected: clean build.

- [ ] **Step 7: Manual smoke test**

```bash
npm run dev
```

Open the Artemis-2 globe. Verify:
1. A "V⃗" button appears in the toolbar
2. Clicking it opens a dropdown with 4 checkboxes
3. Enabling "Velocity" shows a green arrow pointing along the trajectory
4. Enabling "Earth Gravity" shows an amber arrow pointing toward Earth
5. Enabling "Moon Gravity" shows a purple arrow pointing toward the Moon
6. Enabling "Thrust" shows a red arrow during burn phases only
7. Arrows scale with zoom level (visible at all distances)
8. Dropdown closes when clicking outside
9. Green dot appears on the V⃗ button when any vector is active

- [ ] **Step 8: Commit**

```bash
git add src/components/islands/CesiumGlobe/CesiumGlobe.tsx
git commit -m "feat(artemis): wire mission vector overlays into globe"
```

---

### Task 5: Tune arrow scales and visual polish

**Files:**
- Modify: `src/components/islands/CesiumGlobe/useMissionVectors.ts`

- [ ] **Step 1: Test and adjust unitScale values**

Open the globe with all vectors enabled. The `unitScale` values in `VECTOR_CONFIGS` control how physical magnitudes map to visual arrow length:

- `velocity.unitScale`: Velocity is ~1-10 km/s (1000-10000 m/s). At `0.5`, a 5 km/s velocity produces a 2500m base length, then multiplied by the camera-adaptive scale.
- `gravityEarth.unitScale` / `gravityMoon.unitScale`: Near Earth surface, gravity is ~9.8 m/s². At lunar distance (~0.003 m/s²), it's tiny. The `50000` multiplier makes 0.003 m/s² → 150m base length.
- `thrust.unitScale`: Same scale as gravity since they're both accelerations.

Adjust these values until:
1. Velocity arrow is prominent but not huge (comparable to spacecraft model size)
2. Earth gravity arrow is clearly visible near Earth, small but visible near Moon
3. Moon gravity arrow grows noticeably during flyby
4. Thrust arrow is dramatic during burns

The camera-adaptive division `cameraScale / 50000` may also need tuning — adjust the denominator.

- [ ] **Step 2: Verify no regressions**

```bash
npm run build
```

The vector code only activates when `missionTrajectory` is provided (Artemis tracker only). Other trackers unaffected.

- [ ] **Step 3: Commit**

```bash
git add src/components/islands/CesiumGlobe/useMissionVectors.ts
git commit -m "fix(artemis): tune vector arrow scales for visual balance"
```
