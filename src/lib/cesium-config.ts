import { Ion } from 'cesium';

const ION_TOKEN = (import.meta as any).env?.PUBLIC_CESIUM_ION_TOKEN || '';

export function configureCesium() {
  if (ION_TOKEN) {
    Ion.defaultAccessToken = ION_TOKEN;
  }
}

export const CAMERA_PRESETS = {
  theater:  { lon: 49, lat: 29, alt: 3_000_000, pitch: -90, heading: 0 },
  tehran:   { lon: 51.39, lat: 35.69, alt: 80_000, pitch: -90, heading: 0 },
  natanz:   { lon: 51.73, lat: 33.51, alt: 60_000, pitch: -90, heading: 0 },
  hormuz:   { lon: 56.5, lat: 26.5, alt: 200_000, pitch: -90, heading: 0 },
  ford_csg: { lon: 33.5, lat: 34.5, alt: 150_000, pitch: -90, heading: 0 },
  lincoln:  { lon: 60, lat: 23, alt: 150_000, pitch: -90, heading: 0 },
  red_sea:  { lon: 42.5, lat: 14.5, alt: 300_000, pitch: -90, heading: 0 },
} as const;

export type CameraPresetKey = keyof typeof CAMERA_PRESETS;
