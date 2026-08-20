// Cesium Ion (the paid cloud service for imagery and terrain) is deliberately
// not used here. It was never connected: no workflow ever injected a token
// into the build and the secret never existed, so every Ion code path was
// dead. Its imagery is satellite photography, which would fight the dark
// stylised globe this dashboard is built around (scene.globe.baseColor
// #0d0f14), and terrain relief is invisible at the ~3,000 km camera altitudes
// used here.
//
// CesiumJS itself — the library that renders the globe — stays. Its assets are
// served locally from /cesium/ (see CESIUM_BASE_URL in astro.config.mjs), so
// nothing here talks to cesium.com.

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
