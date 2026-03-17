import { Ion } from 'cesium';

const ION_TOKEN = (import.meta as any).env?.PUBLIC_CESIUM_ION_TOKEN || '';

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
