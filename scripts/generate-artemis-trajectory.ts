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
 * Convert Ecliptic J2000 → Equatorial J2000 (inertial only, no GMST).
 * Cesium's SampledPositionProperty with ReferenceFrame.INERTIAL handles
 * the inertial→ECEF rotation per frame, avoiding the spiral problem.
 */
function eclipticToEquatorialWp(wp: HorizonsWaypoint): HorizonsWaypoint {
  const eq = eclipticToEquatorial(wp.x, wp.y, wp.z);
  const eqV = eclipticToEquatorial(wp.vx, wp.vy, wp.vz);
  return { t: wp.t, x: eq.x, y: eq.y, z: eq.z, vx: eqV.x, vy: eqV.y, vz: eqV.z };
}

/**
 * Create a waypoint at a geodetic position (ECEF).
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

// ── Pre-Horizons phase: launch → ICPS separation (Keplerian computation) ──

const MU = 398600.4418; // Earth gravitational parameter km³/s²
const EARTH_R = 6371;   // km
const KSC_LAT = 28.573; // degrees
const KSC_LON = -80.649;
const LAUNCH_AZIMUTH = 44; // degrees (approximate east-northeast)
const INCLINATION = 28.573 * Math.PI / 180; // matches launch latitude

/**
 * Solve Kepler's equation M = E - e*sin(E) for eccentric anomaly E.
 */
function solveKepler(M: number, e: number): number {
  let E = M;
  for (let i = 0; i < 50; i++) {
    const dE = (M - E + e * Math.sin(E)) / (1 - e * Math.cos(E));
    E += dE;
    if (Math.abs(dE) < 1e-12) break;
  }
  return E;
}

/**
 * Compute position on a Keplerian orbit in the orbital plane,
 * then rotate to equatorial J2000 frame.
 *
 * @param a Semi-major axis (km)
 * @param e Eccentricity
 * @param incl Inclination (rad)
 * @param raan Right ascension of ascending node (rad)
 * @param argp Argument of perigee (rad)
 * @param M Mean anomaly (rad)
 * @param timeIso ISO timestamp
 */
function keplerianToEquatorial(
  a: number, e: number, incl: number, raan: number, argp: number,
  M: number, timeIso: string,
): HorizonsWaypoint {
  const E = solveKepler(M, e);
  const cosE = Math.cos(E);
  const sinE = Math.sin(E);

  // Position in orbital plane
  const r = a * (1 - e * cosE);
  const xOrb = a * (cosE - e);
  const yOrb = a * Math.sqrt(1 - e * e) * sinE;

  // Velocity in orbital plane
  const n = Math.sqrt(MU / (a * a * a)); // mean motion
  const factor = n * a / (1 - e * cosE);
  const vxOrb = -factor * sinE;
  const vyOrb = factor * Math.sqrt(1 - e * e) * cosE;

  // Rotation matrices: orbital plane → equatorial
  const cosR = Math.cos(raan), sinR = Math.sin(raan);
  const cosI = Math.cos(incl), sinI = Math.sin(incl);
  const cosW = Math.cos(argp), sinW = Math.sin(argp);

  // Combined rotation
  const Px = cosR * cosW - sinR * sinW * cosI;
  const Py = -cosR * sinW - sinR * cosW * cosI;
  const Qx = sinR * cosW + cosR * sinW * cosI;
  const Qy = -sinR * sinW + cosR * cosW * cosI;
  const Wx = sinW * sinI;
  const Wy = cosW * sinI;

  return {
    t: timeIso,
    x: Px * xOrb + Py * yOrb,
    y: Qx * xOrb + Qy * yOrb,
    z: Wx * xOrb + Wy * yOrb,
    vx: Px * vxOrb + Py * vyOrb,
    vy: Qx * vxOrb + Qy * vyOrb,
    vz: Wx * vxOrb + Wy * vyOrb,
  };
}

/**
 * Generate pre-Horizons waypoints from launch to ICPS separation.
 * Uses real orbital parameters from NASA press kit.
 */
function generatePreHorizonsPhase(firstHorizonsWp: HorizonsWaypoint): HorizonsWaypoint[] {
  const waypoints: HorizonsWaypoint[] = [];
  const launchMs = new Date(MISSION.launchTime).getTime();
  const firstHorizonsMs = new Date(firstHorizonsWp.t).getTime();

  // Convert KSC position to equatorial J2000 at launch time
  const kscEcef = geoToEcef(KSC_LAT, KSC_LON, 0, MISSION.launchTime);
  const theta = gmstRad(new Date(MISSION.launchTime));
  const cosT = Math.cos(theta), sinT = Math.sin(theta);
  // ECEF → ECI
  const kscEci = {
    x: cosT * kscEcef.x - sinT * kscEcef.y,
    y: sinT * kscEcef.x + cosT * kscEcef.y,
    z: kscEcef.z,
  };

  // Launch point
  waypoints.push({ t: MISSION.launchTime, ...kscEci, vx: 0, vy: 0, vz: 0 });

  // Compute RAAN from KSC position at launch
  const raan = Math.atan2(kscEci.y, kscEci.x);

  // Phase 1: Ascent to parking orbit (T+0 to T+8min)
  // Linear interpolation from surface to 185 km
  const ascentEnd = launchMs + 8 * 60 * 1000;
  const parkingR = EARTH_R + 185;
  for (let t = launchMs + 60000; t <= ascentEnd; t += 60000) {
    const frac = (t - launchMs) / (ascentEnd - launchMs);
    const alt = frac * 185;
    const r = EARTH_R + alt;
    // Ascend along the orbital plane, gaining velocity
    const angle = frac * 0.15; // partial orbit during ascent
    const x = r * (Math.cos(raan) * Math.cos(angle) - Math.sin(raan) * Math.sin(angle) * Math.cos(INCLINATION));
    const y = r * (Math.sin(raan) * Math.cos(angle) + Math.cos(raan) * Math.sin(angle) * Math.cos(INCLINATION));
    const z = r * Math.sin(angle) * Math.sin(INCLINATION);
    const v = frac * Math.sqrt(MU / parkingR); // ramp to orbital velocity
    waypoints.push({
      t: new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z'),
      x, y, z, vx: 0, vy: v, vz: 0,
    });
  }

  // Phase 2: Parking orbit at 185 km (T+8min to T+50min)
  // Circular orbit, period ~88 min
  const parkingA = parkingR;
  const parkingPeriod = 2 * Math.PI * Math.sqrt(parkingA ** 3 / MU); // seconds
  const parkingStart = ascentEnd;
  const perigeeRaiseTime = launchMs + 50 * 60 * 1000;

  for (let t = parkingStart; t <= perigeeRaiseTime; t += 60000) { // 1-min steps
    const elapsed = (t - parkingStart) / 1000;
    const M = (elapsed / parkingPeriod) * 2 * Math.PI;
    const wp = keplerianToEquatorial(parkingA, 0.001, INCLINATION, raan, 0, M,
      new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z'));
    waypoints.push(wp);
  }

  // Phase 3: First elliptical orbit 185 x 2,223 km (T+50min to T+1h48m)
  const orbit1Perigee = EARTH_R + 185;
  const orbit1Apogee = EARTH_R + 2223;
  const orbit1A = (orbit1Perigee + orbit1Apogee) / 2;
  const orbit1E = (orbit1Apogee - orbit1Perigee) / (orbit1Apogee + orbit1Perigee);
  const orbit1Period = 2 * Math.PI * Math.sqrt(orbit1A ** 3 / MU);
  const apogeeRaiseTime = launchMs + 108 * 60 * 1000; // T+1h48m

  for (let t = perigeeRaiseTime; t <= apogeeRaiseTime; t += 60000) {
    const elapsed = (t - perigeeRaiseTime) / 1000;
    const M = (elapsed / orbit1Period) * 2 * Math.PI;
    const wp = keplerianToEquatorial(orbit1A, orbit1E, INCLINATION, raan, 0, M,
      new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z'));
    waypoints.push(wp);
  }

  // Phase 4: High elliptical orbit 185 x 70,377 km (T+1h48m to Horizons start)
  const orbit2Perigee = EARTH_R + 185;
  const orbit2Apogee = EARTH_R + 70377;
  const orbit2A = (orbit2Perigee + orbit2Apogee) / 2;
  const orbit2E = (orbit2Apogee - orbit2Perigee) / (orbit2Apogee + orbit2Perigee);
  const orbit2Period = 2 * Math.PI * Math.sqrt(orbit2A ** 3 / MU);

  for (let t = apogeeRaiseTime; t < firstHorizonsMs; t += 120000) { // 2-min steps
    const elapsed = (t - apogeeRaiseTime) / 1000;
    const M = (elapsed / orbit2Period) * 2 * Math.PI;
    const wp = keplerianToEquatorial(orbit2A, orbit2E, INCLINATION, raan, 0, M,
      new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z'));
    waypoints.push(wp);
  }

  console.log(`[artemis] Generated ${waypoints.length} pre-Horizons waypoints (launch → ICPS separation)`);
  return waypoints;
}

async function main() {
  console.log('[artemis] Fetching real Artemis II trajectory from JPL Horizons (target -1024)...\n');

  const segments = [
    // Earth orbit phase — fine sampling (5min) for smooth elliptical orbits
    { start: '2026-Apr-02 02:00', stop: '2026-Apr-03 00:00', step: '5m' },
    // Post-TLI early outbound
    { start: '2026-Apr-03 00:00', stop: '2026-Apr-03 12:00', step: '30m' },
    { start: '2026-Apr-03 12:00', stop: '2026-Apr-06 04:00', step: '1h' },
    // Lunar flyby — high resolution
    { start: '2026-Apr-06 04:00', stop: '2026-Apr-07 18:00', step: '10m' },
    // Return coast
    { start: '2026-Apr-07 18:00', stop: '2026-Apr-10 20:00', step: '1h' },
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

  // Convert Ecliptic J2000 → Equatorial J2000 (inertial)
  // Cesium will handle inertial→ECEF per-frame via ReferenceFrame.INERTIAL
  console.log('[artemis] Converting Ecliptic → Equatorial J2000 (inertial)...');
  allWaypoints = allWaypoints.map(eclipticToEquatorialWp);

  // Generate pre-Horizons phase (launch → ICPS separation) using Keplerian orbits
  if (allWaypoints.length > 0) {
    const prePhase = generatePreHorizonsPhase(allWaypoints[0]);
    allWaypoints = [...prePhase, ...allWaypoints];
  }

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
    coordinateFrame: 'Equatorial J2000 Inertial (use ReferenceFrame.INERTIAL in Cesium)',
    units: { position: 'km', velocity: 'km/s' },
    source: 'JPL Horizons API, target -1024 (Artemis II / Orion EM-2), Ecliptic→Equatorial J2000',
    waypoints: allWaypoints,
  };

  fs.writeFileSync(OUTPUT, JSON.stringify(trajectory, null, 2) + '\n');
  console.log(`[artemis] Written to ${OUTPUT} (${Math.round(fs.statSync(OUTPUT).size / 1024)} KB)`);
}

main().catch(e => {
  console.error('[artemis] Fatal:', e);
  process.exit(1);
});
