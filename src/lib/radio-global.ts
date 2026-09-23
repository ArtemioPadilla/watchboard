/**
 * radio-global.ts — the homepage globe's radio-station layer: fetch the
 * static `radio-stations-global` GeoJSON (docs/licenses/radio-browser.md),
 * keep the top N stations by votes, and persist the viewer's on/off choice.
 *
 * Every failure throws instead of resolving to an empty list: an empty
 * layer and a broken one look identical on the globe, so the caller must be
 * able to tell them apart and show the error (docs/silent-failure-patterns.md).
 */
import type { RadioStationProperties } from './radio-station';

/**
 * `RadioStationProperties` has no coordinates — those live in the GeoJSON
 * `geometry`, not `properties`. This carries both, so CommandCenter's state
 * and GlobePanel's props can pass a self-contained pin.
 */
export type GlobeRadioStation = RadioStationProperties & { lat: number; lon: number };

/** 300 DOM pins is what the home globe carries without visible jank. */
export const RADIO_GLOBAL_TOP_N = 300;

export const RADIO_GLOBAL_PATH = 'geo/layers/radio-stations-global.geojson';

/**
 * Sorted descending by votes, capped at `limit`. Features without a point
 * geometry are skipped; if none remain the layer is unusable and this throws.
 */
export function selectTopRadioStations(fc: unknown, limit = RADIO_GLOBAL_TOP_N): GlobeRadioStation[] {
  const features = (fc as { features?: unknown })?.features;
  if (!Array.isArray(features)) throw new Error('radio layer: payload has no features array');
  const stations = features
    .filter((f: any) => f?.properties && Array.isArray(f.geometry?.coordinates)
      && typeof f.geometry.coordinates[0] === 'number' && typeof f.geometry.coordinates[1] === 'number')
    .sort((a: any, b: any) => (b.properties.votes ?? 0) - (a.properties.votes ?? 0))
    .slice(0, limit)
    .map((f: any): GlobeRadioStation => ({ ...f.properties, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] }));
  if (stations.length === 0) throw new Error('radio layer: no stations in payload');
  return stations;
}

export async function fetchGlobalRadioStations(
  basePath: string,
  fetchImpl: typeof fetch = fetch,
  limit = RADIO_GLOBAL_TOP_N,
): Promise<GlobeRadioStation[]> {
  const res = await fetchImpl(`${basePath}${RADIO_GLOBAL_PATH}`);
  if (!res.ok) throw new Error(`radio layer: HTTP ${res.status}`);
  return selectTopRadioStations(await res.json(), limit);
}

const PREF_KEY = 'watchboard:home-radio-layer';

/** Off unless the viewer turned it on. Read after mount (SSR renders it off). */
export function readRadioLayerPref(): boolean {
  try { return localStorage.getItem(PREF_KEY) === 'on'; } catch { return false; }
}

export function writeRadioLayerPref(on: boolean): void {
  try { localStorage.setItem(PREF_KEY, on ? 'on' : 'off'); } catch { /* private mode: choice lasts this visit only */ }
}
