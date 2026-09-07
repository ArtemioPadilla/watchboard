/**
 * geo-sources.ts — URL builders and parsers for the USGS earthquake feed
 * and the Open-Meteo archive, shared by the globe and the 2D map.
 *
 * Pure so both surfaces render the same data and the parsing is covered by
 * vitest. The bounding box comes from the tracker (map.bounds / map.center),
 * not from a constant: a Brazil tracker asks about Brazil.
 */
import type { Bbox } from './flights-source';

export interface Earthquake {
  id: string;
  mag: number;
  place: string;
  /** Epoch ms. */
  time: number;
  lon: number;
  lat: number;
  /** km. */
  depth: number;
}

export interface WeatherGridPoint { lat: number; lon: number; label: string }

export interface WeatherReading extends WeatherGridPoint {
  /** 0-100 */
  cloudCover: number;
  /** km/h */
  windSpeed: number;
  /** degrees */
  windDir: number;
}

export function nextDay(date: string): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().split('T')[0];
}

/** USGS FDSNWS query for one UTC day, magnitude ≥ 2.5, optionally boxed. */
export function usgsUrl(date: string, bbox?: Bbox | null, minMagnitude = 2.5): string {
  const params = new URLSearchParams({
    format: 'geojson',
    starttime: date,
    endtime: nextDay(date),
    minmagnitude: String(minMagnitude),
    orderby: 'magnitude',
    limit: '500',
  });
  if (bbox) {
    params.set('minlatitude', String(bbox.latMin));
    params.set('maxlatitude', String(bbox.latMax));
    params.set('minlongitude', String(bbox.lonMin));
    params.set('maxlongitude', String(bbox.lonMax));
  }
  return `https://earthquake.usgs.gov/fdsnws/event/1/query?${params.toString()}`;
}

export function parseUsgs(payload: unknown): Earthquake[] {
  const features = (payload as { features?: unknown })?.features;
  if (!Array.isArray(features)) return [];
  const out: Earthquake[] = [];
  for (const f of features) {
    const c = (f as any)?.geometry?.coordinates;
    const p = (f as any)?.properties;
    if (!Array.isArray(c) || typeof c[0] !== 'number' || typeof c[1] !== 'number') continue;
    const mag = typeof p?.mag === 'number' ? p.mag : null;
    if (mag === null) continue;
    out.push({
      id: String((f as any).id ?? `${c[0]},${c[1]},${p?.time ?? ''}`),
      mag,
      place: typeof p?.place === 'string' ? p.place : '',
      time: typeof p?.time === 'number' ? p.time : 0,
      lon: c[0],
      lat: c[1],
      depth: typeof c[2] === 'number' ? c[2] : 0,
    });
  }
  return out;
}

/**
 * A 3×3 grid of sample points inside the tracker's bounds, labelled by
 * compass position. Used when a tracker does not declare its own
 * `globe.weatherPoints`.
 */
export function weatherGridFromBounds(bounds: Bbox, n = 3): WeatherGridPoint[] {
  const pts: WeatherGridPoint[] = [];
  const rows = ['N', 'C', 'S'];
  const cols = ['W', 'C', 'E'];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const lat = bounds.latMax - ((i + 0.5) / n) * (bounds.latMax - bounds.latMin);
      const lon = bounds.lonMin + ((j + 0.5) / n) * (bounds.lonMax - bounds.lonMin);
      const label = i === 1 && j === 1 ? 'Center' : `${rows[Math.min(i, 2)]}${cols[Math.min(j, 2)]}`.replace('CC', 'Center');
      pts.push({ lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100, label });
    }
  }
  return pts;
}

export function openMeteoUrl(points: WeatherGridPoint[], date: string): string {
  const lats = points.map(p => p.lat).join(',');
  const lons = points.map(p => p.lon).join(',');
  return `https://archive-api.open-meteo.com/v1/archive?latitude=${lats}&longitude=${lons}&start_date=${date}&end_date=${date}&hourly=cloudcover,windspeed_10m,winddirection_10m&timezone=UTC`;
}

/** Noon-UTC reading per grid point; points with no `hourly` block are skipped. */
export function parseOpenMeteo(payload: unknown, points: WeatherGridPoint[], hourIdx = 12): WeatherReading[] {
  const results: any[] = Array.isArray(payload) ? payload : payload ? [payload] : [];
  const out: WeatherReading[] = [];
  for (let i = 0; i < Math.min(results.length, points.length); i++) {
    const r = results[i];
    if (!r?.hourly) continue;
    out.push({
      ...points[i],
      cloudCover: Number(r.hourly.cloudcover?.[hourIdx] ?? 0) || 0,
      windSpeed: Number(r.hourly.windspeed_10m?.[hourIdx] ?? 0) || 0,
      windDir: Number(r.hourly.winddirection_10m?.[hourIdx] ?? 0) || 0,
    });
  }
  return out;
}

export const WIND_ARROWS: Record<string, string> = {
  N: '↑', NE: '↗', E: '→', SE: '↘',
  S: '↓', SW: '↙', W: '←', NW: '↖',
};

export function windDirLabel(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[((Math.round(deg / 45) % 8) + 8) % 8];
}

/** Bounds for a tracker: explicit map.bounds, else 10° around the centre. */
export function trackerBbox(
  bounds?: { lonMin: number; lonMax: number; latMin: number; latMax: number } | null,
  center?: { lon: number; lat: number } | null,
): Bbox | null {
  if (bounds) return { latMin: bounds.latMin, latMax: bounds.latMax, lonMin: bounds.lonMin, lonMax: bounds.lonMax };
  if (center) return { latMin: center.lat - 10, latMax: center.lat + 10, lonMin: center.lon - 10, lonMax: center.lon + 10 };
  return null;
}
