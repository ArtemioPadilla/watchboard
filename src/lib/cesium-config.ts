import { Ion } from 'cesium';

const ION_TOKEN = import.meta.env.PUBLIC_CESIUM_ION_TOKEN ?? '';

/**
 * Whether a Cesium Ion token is configured.
 *
 * Without one, Cesium's Viewer still requests its default Ion assets — asset 2
 * for imagery, asset 1 for terrain — using the bundled demo token, and both
 * come back 401 on every globe load:
 *
 *   401 https://api.cesium.com/v1/assets/1/endpoint?access_token=...
 *   401 https://api.cesium.com/v1/assets/2/endpoint?access_token=...
 *
 * Nothing broke visibly, which is why it went unnoticed: the imagery simply
 * never arrives and the globe shows scene.globe.baseColor (#0d0f14), which is
 * the dark look this dashboard wants anyway. So the requests were pure waste —
 * two failed round trips per load for imagery that was never going to render.
 *
 * Callers use this to skip the Ion base layer entirely when there is no token,
 * rather than requesting it and letting it fail.
 */
export const hasIonToken = ION_TOKEN.length > 0;

export function configureCesium() {
  if (ION_TOKEN) {
    Ion.defaultAccessToken = ION_TOKEN;
  }
}

export interface CameraPreset {
  lon: number;
  lat: number;
  alt: number;
  pitch: number;
  heading: number;
  label?: string;
}

export type CameraPresetKey = string;
export type CameraPresetsMap = Record<string, CameraPreset>;
