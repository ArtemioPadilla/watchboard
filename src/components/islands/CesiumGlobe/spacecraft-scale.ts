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
