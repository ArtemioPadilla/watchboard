#!/usr/bin/env tsx
/**
 * generate-artemis-trajectory.ts
 *
 * Fetches REAL Artemis II trajectory from JPL Horizons API (target -1024)
 * and writes mission-trajectory.json with actual state vectors.
 *
 * Usage: npx tsx scripts/generate-artemis-trajectory.ts
 */
import fs from 'fs';

const TARGET = '-1024'; // Artemis II / Orion EM-2
const OUTPUT = 'trackers/artemis-2/data/mission-trajectory.json';

// Mission timeline (from NASA press kit + JPL Horizons object data)
const MISSION = {
  vehicle: 'Orion MPCV',
  crew: [
    { name: 'Reid Wiseman', role: 'Commander' },
    { name: 'Victor Glover', role: 'Pilot' },
    { name: 'Christina Koch', role: 'Mission Specialist 1' },
    { name: 'Jeremy Hansen', role: 'Mission Specialist 2' },
  ],
  launchTime: '2026-04-01T22:35:12Z',
  splashdownTime: '2026-04-11T00:17:00Z',
  phases: [
    { id: 'launch', label: 'Launch & Earth Orbit', start: '2026-04-01T22:35:12Z', end: '2026-04-02T23:49:00Z' },
    { id: 'tli', label: 'Trans-Lunar Injection', start: '2026-04-02T23:49:00Z', end: '2026-04-02T23:55:00Z' },
    { id: 'outbound', label: 'Outbound Coast', start: '2026-04-02T23:55:00Z', end: '2026-04-06T04:43:00Z' },
    { id: 'flyby', label: 'Lunar Flyby', start: '2026-04-06T04:43:00Z', end: '2026-04-07T17:27:00Z' },
    { id: 'return', label: 'Return Coast', start: '2026-04-07T17:27:00Z', end: '2026-04-11T00:04:00Z' },
    { id: 'reentry', label: 'Reentry & Splashdown', start: '2026-04-11T00:04:00Z', end: '2026-04-11T00:17:00Z' },
  ],
};

interface HorizonsWaypoint {
  t: string;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
}

async function fetchHorizons(
  startTime: string,
  stopTime: string,
  stepSize: string,
  center = '500@399',
): Promise<HorizonsWaypoint[]> {
  const params = new URLSearchParams({
    format: 'text',
    COMMAND: `'${TARGET}'`,
    OBJ_DATA: 'NO',
    MAKE_EPHEM: 'YES',
    EPHEM_TYPE: 'VECTORS',
    CENTER: `'${center}'`,
    START_TIME: `'${startTime}'`,
    STOP_TIME: `'${stopTime}'`,
    STEP_SIZE: `'${stepSize}'`,
    VEC_TABLE: '2',
    REF_PLANE: 'ECLIPTIC',
    REF_SYSTEM: 'J2000',
    OUT_UNITS: 'KM-S',
  });

  const url = `https://ssd.jpl.nasa.gov/api/horizons.api?${params}`;
  console.log(`[horizons] Fetching ${startTime} → ${stopTime} step=${stepSize}`);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Horizons API error: ${res.status}`);
  const text = await res.text();

  const waypoints: HorizonsWaypoint[] = [];
  const lines = text.split('\n');
  let inData = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '$$SOE') { inData = true; continue; }
    if (line === '$$EOE') { inData = false; continue; }
    if (!inData) continue;

    if (line.includes('= A.D.')) {
      const dateMatch = line.match(/A\.D\.\s+(\d{4})-(\w{3})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
      if (!dateMatch) continue;

      const months: Record<string, string> = {
        Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
        Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
      };
      const [, year, mon, day, hour, min, sec] = dateMatch;
      const isoDate = `${year}-${months[mon]}-${day}T${hour}:${min}:${sec}Z`;

      const posLine = lines[i + 1]?.trim();
      const velLine = lines[i + 2]?.trim();
      if (!posLine || !velLine) continue;

      const xM = posLine.match(/X\s*=\s*([-+]?\d+\.\d+E[+-]\d+)/);
      const yM = posLine.match(/Y\s*=\s*([-+]?\d+\.\d+E[+-]\d+)/);
      const zM = posLine.match(/Z\s*=\s*([-+]?\d+\.\d+E[+-]\d+)/);
      const vxM = velLine.match(/VX\s*=\s*([-+]?\d+\.\d+E[+-]\d+)/);
      const vyM = velLine.match(/VY\s*=\s*([-+]?\d+\.\d+E[+-]\d+)/);
      const vzM = velLine.match(/VZ\s*=\s*([-+]?\d+\.\d+E[+-]\d+)/);

      if (xM && yM && zM && vxM && vyM && vzM) {
        waypoints.push({
          t: isoDate,
          x: parseFloat(xM[1]),
          y: parseFloat(yM[1]),
          z: parseFloat(zM[1]),
          vx: parseFloat(vxM[1]),
          vy: parseFloat(vyM[1]),
          vz: parseFloat(vzM[1]),
        });
      }
    }
  }

  console.log(`[horizons] Got ${waypoints.length} waypoints`);
  return waypoints;
}

function round(n: number, decimals = 1): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

/**
 * Compute GMST (Greenwich Mean Sidereal Time) in radians for a given UTC date.
 * This is the rotation angle of Earth relative to the J2000 equatorial frame.
 */
function gmstRad(date: Date): number {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const t = (jd - 2451545.0) / 36525.0;
  // IAU formula for GMST in seconds
  let gmstSec = 67310.54841 + (876600 * 3600 + 8640184.812866) * t + 0.093104 * t * t - 6.2e-6 * t * t * t;
  // Convert to radians (86400 seconds = 2π radians)
  return ((gmstSec % 86400) / 86400) * 2 * Math.PI;
}

/**
 * Rotate from Ecliptic J2000 to Equatorial J2000.
 * Obliquity of the ecliptic: ε ≈ 23.4393°
 */
const OBLIQUITY = 23.4393 * Math.PI / 180;
const COS_E = Math.cos(OBLIQUITY);
const SIN_E = Math.sin(OBLIQUITY);

function eclipticToEquatorial(x: number, y: number, z: number): { x: number; y: number; z: number } {
  return {
    x: x,
    y: COS_E * y - SIN_E * z,
    z: SIN_E * y + COS_E * z,
  };
}

/**
 * Convert Ecliptic J2000 position to ECEF:
 * 1. Ecliptic → Equatorial J2000 (rotate by obliquity)
 * 2. Equatorial J2000 → ECEF (rotate by GMST)
 */
function eciToEcef(wp: HorizonsWaypoint): HorizonsWaypoint {
  // Step 1: Ecliptic → Equatorial
  const eq = eclipticToEquatorial(wp.x, wp.y, wp.z);
  const eqV = eclipticToEquatorial(wp.vx, wp.vy, wp.vz);

  // Step 2: Equatorial → ECEF via GMST
  const date = new Date(wp.t);
  const theta = gmstRad(date);
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);
  return {
    t: wp.t,
    x: cosT * eq.x + sinT * eq.y,
    y: -sinT * eq.x + cosT * eq.y,
    z: eq.z,
    vx: cosT * eqV.x + sinT * eqV.y,
    vy: -sinT * eqV.x + cosT * eqV.y,
    vz: eqV.z,
  };
}

/**
 * Create a waypoint at a geodetic position (for launch/splashdown anchors).
 */
function geoToEcef(lat: number, lon: number, altKm: number, time: string): HorizonsWaypoint {
  const r = 6371 + altKm;
  const latR = lat * Math.PI / 180;
  const lonR = lon * Math.PI / 180;
  return {
    t: time,
    x: r * Math.cos(latR) * Math.cos(lonR),
    y: r * Math.cos(latR) * Math.sin(lonR),
    z: r * Math.sin(latR),
    vx: 0, vy: 0, vz: 0,
  };
}

async function main() {
  console.log('[artemis] Fetching real Artemis II trajectory from JPL Horizons (target -1024)...\n');

  const segments = [
    { start: '2026-Apr-02 02:00', stop: '2026-Apr-02 23:50', step: '30m' },
    { start: '2026-Apr-02 23:50', stop: '2026-Apr-03 12:00', step: '30m' },
    { start: '2026-Apr-03 12:00', stop: '2026-Apr-06 04:00', step: '2h' },
    { start: '2026-Apr-06 04:00', stop: '2026-Apr-07 18:00', step: '10m' },
    { start: '2026-Apr-07 18:00', stop: '2026-Apr-10 20:00', step: '2h' },
    { start: '2026-Apr-10 20:00', stop: '2026-Apr-10 23:55', step: '30m' },
  ];

  let allWaypoints: HorizonsWaypoint[] = [];

  for (const seg of segments) {
    try {
      const wps = await fetchHorizons(seg.start, seg.stop, seg.step);
      allWaypoints.push(...wps);
    } catch (e) {
      console.error(`[artemis] Failed segment ${seg.start}—${seg.stop}:`, e);
    }
  }

  // Deduplicate by timestamp
  const seen = new Set<string>();
  allWaypoints = allWaypoints.filter(wp => {
    if (seen.has(wp.t)) return false;
    seen.add(wp.t);
    return true;
  });

  // Sort by time
  allWaypoints.sort((a, b) => new Date(a.t).getTime() - new Date(b.t).getTime());

  // Convert from equatorial J2000 (inertial) to ECEF (Earth-fixed)
  console.log('[artemis] Converting ECI → ECEF...');
  allWaypoints = allWaypoints.map(eciToEcef);

  // Add launch and splashdown anchor points at Earth's surface
  // KSC LC-39B: 28.6°N, 80.6°W
  const launchAnchor = geoToEcef(28.6, -80.6, 0, MISSION.launchTime);
  const launchLeo = geoToEcef(28.6, -80.6, 185, '2026-04-02T00:00:00Z');
  // Splashdown: Pacific off San Diego ~32°N, 117.5°W
  const splashAnchor = geoToEcef(32.0, -117.5, 0, MISSION.splashdownTime);
  const reentryStart = geoToEcef(32.0, -130.0, 122, '2026-04-11T00:04:00Z');

  // Prepend launch anchors, append splashdown anchors
  allWaypoints = [launchAnchor, launchLeo, ...allWaypoints, reentryStart, splashAnchor];

  // Round for file size
  for (const wp of allWaypoints) {
    wp.x = round(wp.x); wp.y = round(wp.y); wp.z = round(wp.z);
    wp.vx = round(wp.vx, 4); wp.vy = round(wp.vy, 4); wp.vz = round(wp.vz, 4);
  }

  console.log(`\n[artemis] Total: ${allWaypoints.length} unique waypoints (ECEF)`);
  if (allWaypoints.length > 0) {
    const first = allWaypoints[0];
    const last = allWaypoints[allWaypoints.length - 1];
    console.log(`[artemis] Range: ${first.t} → ${last.t}`);
    const maxDist = Math.max(...allWaypoints.map(w => Math.sqrt(w.x ** 2 + w.y ** 2 + w.z ** 2)));
    const firstDist = Math.sqrt(first.x ** 2 + first.y ** 2 + first.z ** 2);
    const lastDist = Math.sqrt(last.x ** 2 + last.y ** 2 + last.z ** 2);
    console.log(`[artemis] Max distance from Earth center: ${Math.round(maxDist)} km`);
    console.log(`[artemis] First waypoint distance: ${Math.round(firstDist)} km (should be ~6371)`);
    console.log(`[artemis] Last waypoint distance: ${Math.round(lastDist)} km (should be ~6371)`);
  }

  if (allWaypoints.length === 0) {
    console.error('[artemis] No waypoints fetched! Check JPL Horizons availability.');
    process.exit(1);
  }

  const trajectory = {
    ...MISSION,
    coordinateFrame: 'ECEF (Earth-Centered Earth-Fixed)',
    units: { position: 'km', velocity: 'km/s' },
    source: 'JPL Horizons API, target -1024 (Artemis II / Orion EM-2), converted ECI→ECEF via GMST',
    waypoints: allWaypoints,
  };

  fs.writeFileSync(OUTPUT, JSON.stringify(trajectory, null, 2) + '\n');
  console.log(`[artemis] Written to ${OUTPUT} (${Math.round(fs.statSync(OUTPUT).size / 1024)} KB)`);
}

main().catch(e => {
  console.error('[artemis] Fatal:', e);
  process.exit(1);
});
