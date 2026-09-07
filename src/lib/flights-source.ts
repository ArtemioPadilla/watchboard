/**
 * flights-source.ts — OpenSky parsing shared by the globe and the 2D map.
 *
 * Both surfaces used to carry their own copy of the military callsign list
 * and their own hard-coded Middle East bounding box. The bbox now comes
 * from whatever the viewer is looking at, quantised to whole degrees so
 * small camera moves reuse the cached response instead of firing a new
 * request (OpenSky's anonymous quota is 400 credits/day; a 30 s poll on a
 * small box costs 1 credit, a global box costs 4).
 */

export interface Bbox {
  latMin: number;
  latMax: number;
  lonMin: number;
  lonMax: number;
}

export interface FlightRecord {
  icao24: string;
  callsign: string;
  country: string;
  lat: number;
  lon: number;
  /** Metres. */
  altitude: number;
  /** m/s. */
  velocity: number;
  /** Degrees true. */
  heading: number;
  isMilitary: boolean;
}

/** Military callsign patterns; US/NATO/IDF prefixes most often seen in theatre. */
export const MILITARY_CALLSIGN_PATTERNS: RegExp[] = [
  /^RCH/i, /^DUKE/i, /^ETHYL/i, /^TOPCAT/i, /^NAVY/i, /^EVAC/i,
  /^RRR/i, /^JAKE/i, /^DOOM/i, /^DEATH/i, /^FORTE/i, /^HOMER/i,
  /^LAGR/i, /^IAF/i, /^ISR/i,
];

export function isMilitaryCallsign(callsign: string | null | undefined): boolean {
  if (!callsign) return false;
  const cs = callsign.trim();
  return MILITARY_CALLSIGN_PATTERNS.some((p) => p.test(cs));
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * Snaps a bbox outward to a grid so the cache key is stable while panning.
 * Also clamps to valid ranges and enforces a minimum 2° span so a very
 * close zoom still asks for something.
 */
export function quantizeBbox(b: Bbox, stepDeg = 1, minSpanDeg = 2): Bbox {
  const q = (v: number, dir: 'down' | 'up') => (dir === 'down' ? Math.floor(v / stepDeg) : Math.ceil(v / stepDeg)) * stepDeg;
  let latMin = clamp(q(b.latMin, 'down'), -90, 90);
  let latMax = clamp(q(b.latMax, 'up'), -90, 90);
  let lonMin = clamp(q(b.lonMin, 'down'), -180, 180);
  let lonMax = clamp(q(b.lonMax, 'up'), -180, 180);
  // Widen tiny boxes around their centre, then snap again so the result
  // stays on the grid (a key like "32.5,34.5" would defeat the cache).
  if (latMax - latMin < minSpanDeg) {
    const mid = (latMax + latMin) / 2;
    latMin = clamp(q(mid - minSpanDeg / 2, 'down'), -90, 90);
    latMax = clamp(q(mid + minSpanDeg / 2, 'up'), -90, 90);
  }
  if (lonMax - lonMin < minSpanDeg) {
    const mid = (lonMax + lonMin) / 2;
    lonMin = clamp(q(mid - minSpanDeg / 2, 'down'), -180, 180);
    lonMax = clamp(q(mid + minSpanDeg / 2, 'up'), -180, 180);
  }
  return { latMin, latMax, lonMin, lonMax };
}

/** Expands a bbox by a fraction of its span on every side. */
export function padBbox(b: Bbox, fraction = 0.1): Bbox {
  const dLat = (b.latMax - b.latMin) * fraction;
  const dLon = (b.lonMax - b.lonMin) * fraction;
  return {
    latMin: clamp(b.latMin - dLat, -90, 90), latMax: clamp(b.latMax + dLat, -90, 90),
    lonMin: clamp(b.lonMin - dLon, -180, 180), lonMax: clamp(b.lonMax + dLon, -180, 180),
  };
}

/** A bbox around a centre; used when a tracker has no map bounds. */
export function bboxAround(center: { lat: number; lon: number }, halfSpanDeg = 10): Bbox {
  return quantizeBbox({
    latMin: center.lat - halfSpanDeg, latMax: center.lat + halfSpanDeg,
    lonMin: center.lon - halfSpanDeg, lonMax: center.lon + halfSpanDeg,
  });
}

export function bboxKey(b: Bbox): string {
  return `${b.latMin},${b.latMax},${b.lonMin},${b.lonMax}`;
}

export function openSkyUrl(b: Bbox): string {
  return `https://opensky-network.org/api/states/all?lamin=${b.latMin}&lamax=${b.latMax}&lomin=${b.lonMin}&lomax=${b.lonMax}`;
}

/** OpenSky `states` vector positions, per their API docs. */
const IDX = { icao24: 0, callsign: 1, country: 2, lon: 5, lat: 6, baroAlt: 7, onGround: 8, velocity: 9, track: 10, geoAlt: 13 } as const;

/** Parses an OpenSky `/states/all` payload; airborne, positioned flights only. */
export function parseOpenSky(payload: unknown): FlightRecord[] {
  const states = (payload as { states?: unknown })?.states;
  if (!Array.isArray(states)) return [];
  const out: FlightRecord[] = [];
  for (const s of states) {
    if (!Array.isArray(s)) continue;
    const lon = s[IDX.lon];
    const lat = s[IDX.lat];
    const onGround = s[IDX.onGround] === true;
    if (onGround || typeof lon !== 'number' || typeof lat !== 'number') continue;
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    const callsign = (typeof s[IDX.callsign] === 'string' ? s[IDX.callsign] : '').trim();
    const alt = typeof s[IDX.baroAlt] === 'number' ? s[IDX.baroAlt] : typeof s[IDX.geoAlt] === 'number' ? s[IDX.geoAlt] : 0;
    out.push({
      icao24: String(s[IDX.icao24] ?? ''),
      callsign,
      country: typeof s[IDX.country] === 'string' ? s[IDX.country] : '',
      lat, lon,
      altitude: alt,
      velocity: typeof s[IDX.velocity] === 'number' ? s[IDX.velocity] : 0,
      heading: typeof s[IDX.track] === 'number' ? s[IDX.track] : 0,
      isMilitary: isMilitaryCallsign(callsign),
    });
  }
  return out;
}

/** OpenSky public credit tiers by requested area (square degrees). */
export function openSkyCredits(b: Bbox): 1 | 2 | 3 | 4 {
  const area = Math.max(0, b.latMax - b.latMin) * Math.max(0, b.lonMax - b.lonMin);
  if (area <= 25) return 1;
  if (area <= 100) return 2;
  if (area <= 400) return 3;
  return 4;
}

export const FLIGHTS_POLL_MS = 30_000;
export const FLIGHTS_TTL_MS = 25_000;

/**
 * Poll cadence that keeps a continuous session inside the anonymous
 * 400-credit/day quota whatever the zoom: the interval scales with the
 * credit tier so a theatre-wide view (4 credits) polls every 2 minutes
 * while a city-scale view keeps the 30 s cadence.
 */
export function pollIntervalForBbox(b: Bbox | null): number {
  if (!b) return FLIGHTS_POLL_MS;
  return FLIGHTS_POLL_MS * openSkyCredits(b);
}
