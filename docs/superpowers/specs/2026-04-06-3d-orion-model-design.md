# 3D Orion Spacecraft Model for CesiumJS Globe

**Date:** 2026-04-06
**Status:** Approved
**Tracker:** artemis-2

## Problem

The Orion spacecraft on the Artemis tracker's 3D globe is rendered as a flat 2D SVG billboard (a simple capsule silhouette in `cesium-icons.ts`). It has no orientation — it doesn't rotate with the trajectory. The user wants a realistic 3D model aligned to the flight path.

## Solution

Replace the 2D billboard with a glTF 3D model from Sketchfab, oriented along the trajectory vector with phase-aware attitude overrides and distance-adaptive scaling.

## 1. Model Source & Asset Pipeline

- **Source:** Sketchfab — "Orion Spacecraft" by NASA (https://sketchfab.com/3d-models/orion-spacecraft-d3cfbb9bdf674a6e95288898345541e7). CC / public domain (US government work).
- **Why this model:** Includes the full Orion stack — crew module, European Service Module, and solar arrays. The NASA 3D Resources alternative only has the capsule.
- **Format:** Download glTF from Sketchfab, convert/optimize to `.glb` using `gltf-transform` (Draco mesh compression, textures capped at 1024px).
- **Location:** `public/models/orion-spacecraft.glb`
- **Target size:** <3 MB after optimization.
- **Inspection step:** After download, check whether solar panel nodes are separate in the glTF scene hierarchy (determines whether Layer 3 orientation is feasible).

## 2. Entity Swap — Billboard to Model

In `useLunarMission.ts`, replace the `billboard` property on the spacecraft entity with CesiumJS `model`:

```ts
model: {
  uri: '/watchboard/models/orion-spacecraft.glb',
  minimumPixelSize: 32,
  scale: new CallbackProperty(() => computeAdaptiveScale(viewer, entity), false),
  silhouetteColor: Color.fromCssColorString('#4ade80'),
  silhouetteSize: 1.0,
  colorBlendMode: ColorBlendMode.HIGHLIGHT,
}
```

The existing `CallbackProperty` for position stays unchanged. The `ORION` label entity stays as-is.

## 3. Orientation — Three-Layer System

Orientation is computed per-frame via a `CallbackProperty` that returns a `Quaternion`.

### Layer 1: Velocity Vector Alignment (Base)

The spacecraft nose points in the direction of travel. Computed by sampling the `SampledPositionProperty` at `t` and `t + dt` to get a forward vector, then building a quaternion from that vector using `Transforms.headingPitchRollQuaternion` or manual construction from the velocity direction.

CesiumJS's `VelocityOrientationProperty` could work but doesn't compose well with overrides, so we compute manually for full control.

### Layer 2: Phase-Based Attitude Override

The `trajectory.phases` array provides timestamps and phase names. During specific phases, apply a rotation offset to the base velocity quaternion:

| Phase | Attitude | Rotation Offset |
|-------|----------|-----------------|
| TLI coast | Prograde (nose forward) | None (base) |
| LOI burn | Retrograde (service module forward) | 180° around local up |
| Lunar orbit | Prograde | None |
| TEI burn | Retrograde | 180° around local up |
| Re-entry | Heat-shield forward | ~180° pitch (nose away from velocity) |
| All other | Prograde | None |

Phase lookup is a linear scan of the phases array comparing current sim time against phase start/end timestamps.

### Layer 3: Solar Array Sun-Tracking (Stretch Goal)

If the glTF model has solar panel nodes as separate children in the scene graph:
- Compute Sun direction from spacecraft position each frame (Cesium's `Simon1994PlanetaryPositions` gives Sun position)
- Apply a rotation to the panel nodes via `model.nodeTransformations` to face the Sun
- If panels are baked into a single mesh, skip this layer entirely

## 4. Distance-Adaptive Scale

Custom `CallbackProperty` that computes scale based on camera-to-spacecraft distance using logarithmic interpolation:

| Camera Distance | Model Scale | Visual Result |
|----------------|-------------|---------------|
| > 500,000 km | 500,000x | Prominent on full trajectory view |
| 100k–500k km | 100,000x | Moderate, clearly visible |
| 10k–100k km | 10,000x | Smaller, detailed |
| < 10k km | 1,000x | Close-up, model detail shines |

Smooth interpolation between breakpoints on a log scale. `minimumPixelSize: 32` as a floor so the model never disappears entirely.

```ts
function computeAdaptiveScale(viewer: CesiumViewer, entityPosition: Cartesian3): number {
  const cameraPos = viewer.camera.positionWC;
  const dist = Cartesian3.distance(cameraPos, entityPosition);
  // Log-interpolate between breakpoints
  // ... returns scale factor
}
```

## 5. Files to Modify

| File | Change |
|------|--------|
| `src/components/islands/CesiumGlobe/useLunarMission.ts` | Replace billboard with model entity, add orientation + scale CallbackProperties |
| `src/components/islands/CesiumGlobe/mission-helpers.ts` | Add `computeAdaptiveScale()`, `computeOrientationQuaternion()`, Sun position util |
| `src/components/islands/CesiumGlobe/cesium-icons.ts` | Keep `createSpacecraftIcon()` as fallback (no changes) |
| `public/models/orion-spacecraft.glb` | New file — optimized 3D model |

## 6. Graceful Fallback

If the `.glb` fails to load (network error, unsupported browser, file missing), fall back to the existing 2D SVG billboard. The model load is wrapped in try/catch — on failure, the entity switches to `billboard` mode with the current capsule icon from `createSpacecraftIcon()`.

## Out of Scope

- Exhaust/thruster particle effects
- SLS booster separation animation
- Interior crew module detail
- Model LOD (level-of-detail) variants — single model with adaptive scale is sufficient
