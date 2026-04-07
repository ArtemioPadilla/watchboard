# 3D Orion Spacecraft Model — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 2D SVG billboard Orion spacecraft on the Artemis globe with a 3D glTF model that aligns to the trajectory vector, adjusts attitude per mission phase, and scales adaptively with camera distance.

**Architecture:** The existing `useLunarMission.ts` hook creates an entity with a `billboard` property. We replace it with a `model` property pointing to a `.glb` file served from `public/models/`. Orientation is computed per-frame via a `CallbackProperty` that layers velocity-vector alignment with phase-based attitude overrides. Scale is also a per-frame `CallbackProperty` using logarithmic interpolation of camera distance. Solar array sun-tracking is a stretch goal contingent on the glTF model having articulated panel nodes.

**Tech Stack:** CesiumJS 1.139+, TypeScript, gltf-transform CLI (for model optimization)

**Spec:** `docs/superpowers/specs/2026-04-06-3d-orion-model-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `public/models/orion-spacecraft.glb` | Create | Optimized 3D model asset |
| `src/components/islands/CesiumGlobe/spacecraft-orientation.ts` | Create | Orientation quaternion computation (velocity alignment + phase overrides) |
| `src/components/islands/CesiumGlobe/spacecraft-scale.ts` | Create | Distance-adaptive scale computation |
| `src/components/islands/CesiumGlobe/useLunarMission.ts` | Modify | Swap billboard → model, wire orientation + scale |
| `src/components/islands/CesiumGlobe/mission-helpers.ts` | Modify | Add Sun position helper (for stretch goal) |

---

### Task 1: Download and optimize the 3D model

**Files:**
- Create: `public/models/orion-spacecraft.glb`

This task must be done manually — it requires downloading from Sketchfab and running CLI tools.

- [ ] **Step 1: Download the model from Sketchfab**

Go to https://sketchfab.com/3d-models/orion-spacecraft-d3cfbb9bdf674a6e95288898345541e7 and download the glTF format. Extract the archive — you'll get a `.gltf` file plus texture images and a `.bin` buffer.

- [ ] **Step 2: Install gltf-transform CLI**

```bash
npm install -g @gltf-transform/cli
```

- [ ] **Step 3: Optimize and convert to .glb**

```bash
mkdir -p public/models
gltf-transform optimize scene.gltf public/models/orion-spacecraft.glb \
  --compress draco \
  --texture-resize 1024
```

This merges all files into a single `.glb`, applies Draco mesh compression, and caps textures at 1024px. Target: <3 MB.

- [ ] **Step 4: Inspect the model node hierarchy**

```bash
gltf-transform inspect public/models/orion-spacecraft.glb
```

Look at the output for separate nodes named like `solar_panel`, `panel_left`, `panel_right`, or similar. Note whether solar arrays are separate from the main body mesh. Record this finding — it determines whether Task 5 (stretch goal) is feasible.

- [ ] **Step 5: Verify the file is served correctly**

```bash
npm run dev
# Open browser devtools, fetch the model:
# fetch('/models/orion-spacecraft.glb').then(r => console.log(r.status, r.headers.get('content-type')))
# Expected: 200, model/gltf-binary (or application/octet-stream)
```

- [ ] **Step 6: Commit**

```bash
git add public/models/orion-spacecraft.glb
git commit -m "feat(artemis): add optimized Orion 3D model (.glb)"
```

---

### Task 2: Create spacecraft orientation module

**Files:**
- Create: `src/components/islands/CesiumGlobe/spacecraft-orientation.ts`

- [ ] **Step 1: Create the orientation module**

Create `src/components/islands/CesiumGlobe/spacecraft-orientation.ts`:

```ts
import {
  Cartesian3,
  Quaternion,
  Matrix3,
  Matrix4,
  Transforms,
  type SampledPositionProperty,
  JulianDate,
} from 'cesium';
import type { MissionPhase } from '../../../lib/schemas';

// Scratch variables — reused to avoid GC pressure in per-frame calls
const scratchVelocity = new Cartesian3();
const scratchNextPos = new Cartesian3();
const scratchCurrentPos = new Cartesian3();
const scratchMatrix3 = new Matrix3();
const scratchMatrix4 = new Matrix4();
const scratchQuaternion = new Quaternion();

// Time step for finite-difference velocity estimation (seconds)
const VELOCITY_DT = 1.0;

// Phase IDs that require retrograde attitude (180° yaw from prograde)
const RETROGRADE_PHASES = new Set(['tli', 'reentry']);

/**
 * Compute the orientation quaternion for the spacecraft at the given time.
 *
 * Layer 1: Velocity-vector alignment (prograde — nose forward along trajectory)
 * Layer 2: Phase-based override (retrograde for burns and re-entry)
 */
export function computeSpacecraftOrientation(
  positionProperty: SampledPositionProperty,
  currentJd: JulianDate,
  phases: MissionPhase[],
): Quaternion | undefined {
  // Sample position at t and t+dt to get velocity direction
  const pos = positionProperty.getValue(currentJd, scratchCurrentPos);
  if (!pos) return undefined;

  const nextJd = JulianDate.addSeconds(currentJd, VELOCITY_DT, new JulianDate());
  const nextPos = positionProperty.getValue(nextJd, scratchNextPos);
  if (!nextPos) return undefined;

  // Velocity vector (unnormalized direction of travel)
  Cartesian3.subtract(nextPos, pos, scratchVelocity);
  const speed = Cartesian3.magnitude(scratchVelocity);
  if (speed < 0.001) return undefined; // stationary — no meaningful orientation

  // Normalize velocity to get forward direction
  Cartesian3.normalize(scratchVelocity, scratchVelocity);

  // Build a rotation matrix: X = forward (velocity), Z = up (radial from Earth center)
  // Using Cesium's Transforms to build an east-north-up frame, then align X with velocity
  const transform = Transforms.eastNorthUpToFixedFrame(pos, undefined, scratchMatrix4);
  const rotation = Matrix4.getMatrix3(transform, scratchMatrix3);

  // Build quaternion from velocity direction in the local ENU frame
  const orientationQuat = quaternionFromDirection(scratchVelocity, pos);

  // Layer 2: Phase-based attitude override
  const currentPhase = findCurrentPhase(currentJd, phases);
  if (currentPhase && RETROGRADE_PHASES.has(currentPhase.id)) {
    // Rotate 180° around the local "up" axis (radial direction from Earth center)
    const up = Cartesian3.normalize(pos, new Cartesian3());
    const flipQuat = Quaternion.fromAxisAngle(up, Math.PI, scratchQuaternion);
    return Quaternion.multiply(flipQuat, orientationQuat, new Quaternion());
  }

  return orientationQuat;
}

/**
 * Build a quaternion that orients the model's +X axis along `direction`,
 * with +Z pointing roughly away from Earth center (radial up).
 */
function quaternionFromDirection(direction: Cartesian3, position: Cartesian3): Quaternion {
  // Radial "up" from Earth center
  const up = Cartesian3.normalize(position, new Cartesian3());

  // Right = direction × up (ensures orthogonality)
  const right = Cartesian3.cross(direction, up, new Cartesian3());
  if (Cartesian3.magnitude(right) < 1e-10) {
    // direction is parallel to up — use arbitrary perpendicular
    const arbitrary = Math.abs(Cartesian3.dot(direction, Cartesian3.UNIT_X)) < 0.9
      ? Cartesian3.UNIT_X : Cartesian3.UNIT_Y;
    Cartesian3.cross(direction, arbitrary, right);
  }
  Cartesian3.normalize(right, right);

  // Recompute up = right × direction (orthonormal)
  const correctedUp = Cartesian3.cross(right, direction, new Cartesian3());
  Cartesian3.normalize(correctedUp, correctedUp);

  // Build rotation matrix: columns = [direction, right, correctedUp]
  // CesiumJS glTF convention: model faces +X forward, +Z up
  const rotMatrix = new Matrix3();
  // Column 0: forward (+X of model) = direction
  Matrix3.setColumn(rotMatrix, 0, direction, rotMatrix);
  // Column 1: right (+Y of model) = right
  Matrix3.setColumn(rotMatrix, 1, right, rotMatrix);
  // Column 2: up (+Z of model) = correctedUp
  Matrix3.setColumn(rotMatrix, 2, correctedUp, rotMatrix);

  return Quaternion.fromRotationMatrix(rotMatrix, new Quaternion());
}

/**
 * Find the active mission phase at the given time.
 */
function findCurrentPhase(currentJd: JulianDate, phases: MissionPhase[]): MissionPhase | null {
  for (const phase of phases) {
    const phaseStart = JulianDate.fromIso8601(phase.start);
    const phaseEnd = JulianDate.fromIso8601(phase.end);
    if (
      JulianDate.greaterThanOrEquals(currentJd, phaseStart) &&
      JulianDate.lessThan(currentJd, phaseEnd)
    ) {
      return phase;
    }
  }
  return null;
}
```

- [ ] **Step 2: Verify the module compiles**

```bash
npx tsc --noEmit src/components/islands/CesiumGlobe/spacecraft-orientation.ts
```

Expected: no errors. If CesiumJS types complain about `Matrix3.setColumn` signature, check the exact API — Cesium 1.139 uses `Matrix3.setColumn(matrix, index, cartesian, result)`.

- [ ] **Step 3: Commit**

```bash
git add src/components/islands/CesiumGlobe/spacecraft-orientation.ts
git commit -m "feat(artemis): add spacecraft orientation module (velocity + phase layers)"
```

---

### Task 3: Create distance-adaptive scale module

**Files:**
- Create: `src/components/islands/CesiumGlobe/spacecraft-scale.ts`

- [ ] **Step 1: Create the scale module**

Create `src/components/islands/CesiumGlobe/spacecraft-scale.ts`:

```ts
import { Cartesian3, type Viewer as CesiumViewer } from 'cesium';

/**
 * Scale breakpoints: [cameraDistanceMeters, modelScale]
 * Interpolated on a log scale for smooth transitions.
 * Distances are from camera to spacecraft entity.
 */
const SCALE_BREAKPOINTS: [number, number][] = [
  [1e10,  500_000],   // > ~500,000 km — full trajectory view
  [5e8,   100_000],   // ~500k km
  [1e8,   10_000],    // ~100k km
  [1e7,   1_000],     // ~10k km — close approach
];

// Absolute floor: never smaller than this many pixels on screen
export const MIN_PIXEL_SIZE = 32;

/**
 * Compute adaptive model scale based on camera-to-entity distance.
 * Uses logarithmic interpolation between breakpoints for smooth transitions.
 */
export function computeAdaptiveScale(
  viewer: CesiumViewer,
  entityPosition: Cartesian3,
): number {
  const cameraPos = viewer.camera.positionWC;
  const dist = Cartesian3.distance(cameraPos, entityPosition);

  // Beyond the largest breakpoint — use max scale
  if (dist >= SCALE_BREAKPOINTS[0][0]) {
    return SCALE_BREAKPOINTS[0][1];
  }

  // Below the smallest breakpoint — use min scale
  const last = SCALE_BREAKPOINTS[SCALE_BREAKPOINTS.length - 1];
  if (dist <= last[0]) {
    return last[1];
  }

  // Find the two bracketing breakpoints and log-interpolate
  for (let i = 0; i < SCALE_BREAKPOINTS.length - 1; i++) {
    const [distHigh, scaleHigh] = SCALE_BREAKPOINTS[i];
    const [distLow, scaleLow] = SCALE_BREAKPOINTS[i + 1];

    if (dist <= distHigh && dist >= distLow) {
      const logDist = Math.log(dist);
      const logHigh = Math.log(distHigh);
      const logLow = Math.log(distLow);
      const t = (logDist - logLow) / (logHigh - logLow);

      // Interpolate in log-scale space for smooth transition
      const logScaleHigh = Math.log(scaleHigh);
      const logScaleLow = Math.log(scaleLow);
      return Math.exp(logScaleLow + t * (logScaleHigh - logScaleLow));
    }
  }

  // Fallback (shouldn't reach here)
  return SCALE_BREAKPOINTS[0][1];
}
```

- [ ] **Step 2: Verify the module compiles**

```bash
npx tsc --noEmit src/components/islands/CesiumGlobe/spacecraft-scale.ts
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/islands/CesiumGlobe/spacecraft-scale.ts
git commit -m "feat(artemis): add distance-adaptive scale module for 3D spacecraft"
```

---

### Task 4: Replace billboard with 3D model in useLunarMission

**Files:**
- Modify: `src/components/islands/CesiumGlobe/useLunarMission.ts`

This is the core integration task. We replace the `billboard` entity with a `model` entity, wiring in orientation and scale from the new modules.

- [ ] **Step 1: Update imports in useLunarMission.ts**

In `src/components/islands/CesiumGlobe/useLunarMission.ts`, replace the import block (lines 1–20):

```ts
import { useEffect, useRef, type MutableRefObject } from 'react';
import {
  Cartesian3,
  Color,
  JulianDate,
  SampledPositionProperty,
  LagrangePolynomialApproximation,
  PolylineGlowMaterialProperty,
  NearFarScalar,
  CallbackProperty,
  ColorBlendMode,
  Quaternion,
  type Viewer as CesiumViewer,
  type Entity,
} from 'cesium';
import {
  computeTelemetry,
  EMPTY_TELEMETRY,
  type TelemetryState,
} from './mission-helpers';
import type { MissionTrajectory } from '../../../lib/schemas';
import { createSpacecraftIcon } from './cesium-icons';
import { computeSpacecraftOrientation } from './spacecraft-orientation';
import { computeAdaptiveScale, MIN_PIXEL_SIZE } from './spacecraft-scale';
```

- [ ] **Step 2: Replace the spacecraft entity creation**

In the same file, replace the spacecraft entity block (lines 92–124, the `// Spacecraft entity` section) with:

```ts
      // Spacecraft entity — 3D model with velocity-aligned orientation
      const modelUri = '/models/orion-spacecraft.glb';

      // Shared position callback — reused by both model and scale
      const positionCallback = new CallbackProperty(() => {
        const simMs = simTimeRef.current;
        if (!simMs) return polylinePositions[0];
        const currentJd = JulianDate.fromDate(new Date(simMs));
        const pos = positionProperty.getValue(currentJd);
        if (!pos) {
          const launchMs = new Date(trajectory.launchTime).getTime();
          if (simMs < launchMs) return polylinePositions[0];
          return polylinePositions[polylinePositions.length - 1];
        }
        return pos;
      }, false);

      // Orientation: velocity alignment + phase overrides
      const orientationCallback = new CallbackProperty(() => {
        const simMs = simTimeRef.current;
        if (!simMs) return Quaternion.IDENTITY;
        const currentJd = JulianDate.fromDate(new Date(simMs));
        return computeSpacecraftOrientation(
          positionProperty,
          currentJd,
          trajectory.phases,
        ) ?? Quaternion.IDENTITY;
      }, false);

      // Attempt to load 3D model, fall back to billboard on error
      let spacecraftEntity: Entity;
      try {
        spacecraftEntity = viewer.entities.add({
          position: positionCallback as any,
          orientation: orientationCallback as any,
          model: {
            uri: modelUri,
            minimumPixelSize: MIN_PIXEL_SIZE,
            scale: new CallbackProperty(() => {
              const simMs = simTimeRef.current;
              if (!simMs) return 100_000;
              const currentJd = JulianDate.fromDate(new Date(simMs));
              const pos = positionProperty.getValue(currentJd);
              if (!pos) return 100_000;
              return computeAdaptiveScale(viewer, pos);
            }, false) as any,
            silhouetteColor: Color.fromCssColorString('#4ade80'),
            silhouetteSize: 1.0,
            colorBlendMode: ColorBlendMode.HIGHLIGHT,
            colorBlendAmount: 0.0,
          },
          label: {
            text: 'ORION',
            font: '14px JetBrains Mono',
            fillColor: Color.fromCssColorString('#4ade80'),
            outlineColor: Color.BLACK,
            outlineWidth: 3,
            style: 2,
            pixelOffset: { x: 0, y: -28 } as any,
            scaleByDistance: new NearFarScalar(1e5, 1.2, 5e8, 0.15),
          },
        });
      } catch (e) {
        console.warn('[lunar-mission] 3D model failed to load, falling back to billboard:', e);
        spacecraftEntity = viewer.entities.add({
          position: positionCallback as any,
          billboard: {
            image: createSpacecraftIcon(),
            scale: 1.0,
            scaleByDistance: new NearFarScalar(1e5, 1.2, 5e8, 0.15),
            color: Color.WHITE,
          },
          label: {
            text: 'ORION',
            font: '14px JetBrains Mono',
            fillColor: Color.fromCssColorString('#4ade80'),
            outlineColor: Color.BLACK,
            outlineWidth: 3,
            style: 2,
            pixelOffset: { x: 0, y: -28 } as any,
            scaleByDistance: new NearFarScalar(1e5, 1.2, 5e8, 0.15),
          },
        });
      }
      entitiesRef.current.push(spacecraftEntity);
      spacecraftEntityRef.current = spacecraftEntity;
```

- [ ] **Step 3: Verify the full project compiles**

```bash
npm run build
```

Expected: clean build with no TypeScript errors. The `createSpacecraftIcon` import is retained for the fallback path.

- [ ] **Step 4: Manual smoke test**

```bash
npm run dev
```

Open the Artemis-2 globe at `http://localhost:4321/artemis-2/globe/`. Verify:
1. The 3D Orion model appears on the trajectory path
2. The model rotates to follow the trajectory direction as sim time advances
3. The model scales appropriately when zooming in and out
4. The "ORION" label still appears above the model
5. The trajectory polyline is still visible

- [ ] **Step 5: Commit**

```bash
git add src/components/islands/CesiumGlobe/useLunarMission.ts
git commit -m "feat(artemis): replace 2D billboard with 3D Orion model on globe"
```

---

### Task 5: Solar array sun-tracking (stretch goal) — SKIPPED

**Status:** Skipped (2026-04-06)

**Reason:** The Sketchfab model (WISEMANmods "Orion Spacecraft") has generic node names — the solar panels are likely the 4 `Cube` nodes (`Cube_11`, `Cube.001_13`, `Cube.002_15`, `Cube.003_17`) but they aren't clearly labeled. Without clear node identification, `nodeTransformations` would require trial-and-error to find the right nodes and hinge axes. Not worth the risk of breaking the model.

**To revisit:** If a better-labeled Orion glTF model becomes available (e.g., with nodes named `solar_panel_left`/`solar_panel_right`), the approach below is ready to implement. Alternatively, the current model could be edited in Blender to rename the panel nodes.

**Implementation approach (for future reference):**

**Files:**
- Modify: `src/components/islands/CesiumGlobe/mission-helpers.ts` (add Sun position)
- Modify: `src/components/islands/CesiumGlobe/useLunarMission.ts` (add nodeTransformations)

**Gate:** Only feasible if the glTF model has clearly named, separate solar panel nodes.

- [ ] **Step 1: Add Sun position helper to mission-helpers.ts**

Add this function after the existing `getMoonPosition()` in `src/components/islands/CesiumGlobe/mission-helpers.ts`:

```ts
const scratchSunPos = new Cartesian3();

/**
 * Get Sun's ECEF position at a given time (meters).
 */
export function getSunPosition(julianDate: JulianDate): Cartesian3 {
  const sunEci = Simon1994PlanetaryPositions.computeSunPositionInEarthInertialFrame(julianDate);
  const rotationMatrix = Transforms.computeIcrfToFixedMatrix(julianDate, scratchMatrix);
  if (rotationMatrix) {
    Matrix3.multiplyByVector(rotationMatrix, sunEci, scratchSunPos);
    return Cartesian3.clone(scratchSunPos);
  }
  return Cartesian3.clone(sunEci);
}
```

- [ ] **Step 2: Add node transformation for solar panels in useLunarMission.ts**

After the spacecraft entity is created (inside the `try` block), add:

```ts
      // Stretch goal: solar array sun-tracking via node transformations
      // Replace 'solar_panel_left' and 'solar_panel_right' with actual node names from Step 1.4
      const PANEL_NODES = ['solar_panel_left', 'solar_panel_right']; // UPDATE with real names

      // Add per-frame panel rotation in the tick loop
      // (inserted inside the existing tick() function, after telemetry computation)
```

Inside the existing `tick()` function in `useLunarMission.ts`, after `telemetryRef.current = computeTelemetry(...)`, add:

```ts
          // Solar panel sun-tracking
          if (spacecraftEntity.model) {
            try {
              const sunPos = getSunPosition(currentJd);
              const sunDir = Cartesian3.subtract(sunPos, pos, new Cartesian3());
              Cartesian3.normalize(sunDir, sunDir);

              // Compute rotation angle to face panels toward sun
              // This is a simplified single-axis rotation around the panel hinge
              const modelMatrix = spacecraftEntity.computeModelMatrix(
                JulianDate.fromDate(new Date(simMs))
              );
              if (modelMatrix) {
                for (const nodeName of PANEL_NODES) {
                  const nodeTransforms = spacecraftEntity.model.nodeTransformations;
                  if (nodeTransforms) {
                    // Apply rotation to face Sun — axis depends on model orientation
                    // This will need tuning based on actual panel hinge axis in the model
                    nodeTransforms[nodeName] = {
                      rotation: Quaternion.fromAxisAngle(
                        Cartesian3.UNIT_Y, // panel hinge axis — adjust per model
                        Math.atan2(sunDir.z, sunDir.x),
                      ),
                    } as any;
                  }
                }
              }
            } catch {
              // Panel tracking is best-effort — don't break the tick loop
            }
          }
```

- [ ] **Step 3: Import getSunPosition**

Add to the imports in `useLunarMission.ts`:

```ts
import {
  computeTelemetry,
  EMPTY_TELEMETRY,
  getSunPosition,
  type TelemetryState,
} from './mission-helpers';
```

- [ ] **Step 4: Test and tune**

```bash
npm run dev
```

Open the Artemis-2 globe. Advance sim time and observe whether the solar panels rotate toward the Sun. The hinge axis (`Cartesian3.UNIT_Y` in the code above) may need adjustment based on the actual model's coordinate system. Rotate the camera around the spacecraft to verify panels track the Sun direction.

If the model doesn't have separate panel nodes, the `nodeTransformations` property will be empty and this code is a no-op. Remove the dead code and skip the rest of this task.

- [ ] **Step 5: Commit**

```bash
git add src/components/islands/CesiumGlobe/mission-helpers.ts src/components/islands/CesiumGlobe/useLunarMission.ts
git commit -m "feat(artemis): add solar array sun-tracking for Orion model"
```

---

### Task 6: Final tuning and cleanup

**Files:**
- Modify: `src/components/islands/CesiumGlobe/spacecraft-orientation.ts` (tune if needed)
- Modify: `src/components/islands/CesiumGlobe/spacecraft-scale.ts` (tune breakpoints)

- [ ] **Step 1: Tune model forward axis**

CesiumJS glTF models default to +X forward. If the downloaded Sketchfab model faces a different axis (common: +Z or -Y forward), add a static rotation offset in `spacecraft-orientation.ts`:

In `computeSpacecraftOrientation()`, before returning `orientationQuat`, apply a correction:

```ts
// If model faces +Z instead of +X, rotate -90° around Y to correct
const MODEL_CORRECTION = Quaternion.fromAxisAngle(Cartesian3.UNIT_Y, -Math.PI / 2);
const corrected = Quaternion.multiply(orientationQuat, MODEL_CORRECTION, new Quaternion());
return corrected;
```

The exact correction depends on the model's native forward axis. Test by observing the spacecraft on a known straight segment of the trajectory (outbound coast). The nose should point toward the Moon. Adjust the correction angle until it looks right.

- [ ] **Step 2: Tune scale breakpoints**

Open the globe and test at different zoom levels:
1. Full Earth-Moon trajectory view — model should be prominent but not huge
2. Mid-zoom — clearly visible, identifiable shape
3. Close-up — model detail should be appreciable

Adjust the values in `SCALE_BREAKPOINTS` in `spacecraft-scale.ts` until the scaling feels natural. The log interpolation should make transitions smooth.

- [ ] **Step 3: Verify no regressions on other trackers**

```bash
npm run build
```

The model changes are isolated to `useLunarMission.ts` which only runs when `missionTrajectory` is provided (Artemis tracker only). Other tracker globes should be unaffected. Verify the build succeeds cleanly.

- [ ] **Step 4: Final commit**

```bash
git add -A src/components/islands/CesiumGlobe/
git commit -m "fix(artemis): tune 3D model orientation axis and scale breakpoints"
```
