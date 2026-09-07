// ── Overlay styling + helpers for the 2D IntelMap ──
// Zone DATA lives in src/data/snapshots/*.json and is loaded (validated,
// provenance-stamped) by src/lib/snapshots.ts; both the globe and this map
// read the same arrays. All coordinates are [lon, lat]; flip for Leaflet.
export {
  NO_FLY_ZONES, GPS_JAMMING_ZONES, INTERNET_BLACKOUTS,
  type NoFlyZone, type GpsJammingZone, type InternetBlackout,
} from '../../lib/snapshots';

// ────────────────────────────────────────────
//  No-Fly Zones
// ────────────────────────────────────────────

// ────────────────────────────────────────────
//  GPS Jamming Zones
// ────────────────────────────────────────────

export const GPS_SEVERITY_COLORS: Record<string, string> = {
  high: '#ff2244',
  medium: '#ff6644',
  low: '#ff9944',
};

export const GPS_SEVERITY_ALPHA: Record<string, number> = {
  high: 0.18,
  medium: 0.12,
  low: 0.08,
};

// ────────────────────────────────────────────
//  Internet Blackout Zones
// ────────────────────────────────────────────

export const BLACKOUT_STYLES: Record<string, { color: string; fillAlpha: number; outlineAlpha: number }> = {
  total: { color: '#ff2244', fillAlpha: 0.15, outlineAlpha: 0.6 },
  major: { color: '#ff6644', fillAlpha: 0.10, outlineAlpha: 0.5 },
  partial: { color: '#ff9944', fillAlpha: 0.07, outlineAlpha: 0.4 },
};

// ────────────────────────────────────────────
//  Weather Grid
// ────────────────────────────────────────────

export const WIND_ARROWS: Record<string, string> = {
  N: '\u2191', NE: '\u2197', E: '\u2192', SE: '\u2198',
  S: '\u2193', SW: '\u2199', W: '\u2190', NW: '\u2196',
};

export function windDirLabel(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(deg / 45) % 8];
}

// ────────────────────────────────────────────
//  Geometry helpers
// ────────────────────────────────────────────

/**
 * Generate hexagonal polygon vertices as [lat, lon] pairs for Leaflet.
 * Leaflet uses [lat, lon] order, so the output is ready for Leaflet Polygon.
 */
export function hexagonLatLngs(
  centerLon: number,
  centerLat: number,
  radiusKm: number,
): [number, number][] {
  const dLat = radiusKm / 111;
  const dLon = radiusKm / (111 * Math.cos((centerLat * Math.PI) / 180));
  const positions: [number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    const lon = centerLon + dLon * Math.cos(angle);
    const lat = centerLat + dLat * Math.sin(angle);
    positions.push([lat, lon]); // [lat, lon] for Leaflet
  }
  return positions;
}
