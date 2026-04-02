#!/usr/bin/env npx tsx
/**
 * generate-artemis-trajectory.ts
 *
 * Generates approximate free-return lunar trajectory waypoints for Artemis 2
 * using simplified patched-conic physics. Outputs ECI (Earth-Centered Inertial)
 * coordinates for ~500-700 waypoints covering the full ~10 day mission.
 *
 * Usage: npx tsx scripts/generate-artemis-trajectory.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Constants ───────────────────────────────────────────────────────────────

const MU_EARTH = 398600.4418;        // Earth gravitational parameter (km³/s²)
const R_EARTH = 6371.0;              // Earth mean radius (km)
const MOON_DISTANCE = 384400.0;      // Mean Earth-Moon distance (km)
const MOON_PERIOD = 27.321661 * 86400; // Lunar orbital period (seconds)
const MOON_INCLINATION = 5.14 * Math.PI / 180; // Moon's orbital inclination (rad)

const LEO_ALTITUDE = 185;            // Parking orbit altitude (km)
const LEO_RADIUS = R_EARTH + LEO_ALTITUDE;
const LEO_VELOCITY = Math.sqrt(MU_EARTH / LEO_RADIUS); // ~7.79 km/s
const LEO_PERIOD = 2 * Math.PI * Math.sqrt(LEO_RADIUS ** 3 / MU_EARTH); // ~5310s

const FLYBY_ALTITUDE = 100;          // Lunar flyby altitude (km)
const MOON_RADIUS = 1737.4;          // Moon mean radius (km)

// Launch site: KSC (28.6°N, 80.6°W)
const KSC_LAT = 28.6 * Math.PI / 180;
const KSC_LON = -80.6 * Math.PI / 180;

// Splashdown: Pacific Ocean (~15°N, 165°W)
const SPLASH_LAT = 15.0 * Math.PI / 180;
const SPLASH_LON = -165.0 * Math.PI / 180;

// Mission timeline
const LAUNCH_TIME = new Date('2026-04-01T18:24:00Z');
const TLI_TIME = new Date('2026-04-01T20:00:00Z');
const SPLASHDOWN_TIME = new Date('2026-04-11T14:00:00Z');

// Derived times
const LAUNCH_EPOCH = LAUNCH_TIME.getTime() / 1000;
const TLI_EPOCH = TLI_TIME.getTime() / 1000;
const SPLASHDOWN_EPOCH = SPLASHDOWN_TIME.getTime() / 1000;

// Phase boundaries (in seconds from launch)
const LAUNCH_DURATION = 8 * 60;           // 8 minutes
const LEO_DURATION = 90 * 60;             // 90 minutes in parking orbit
const OUTBOUND_DURATION = 4 * 86400;      // ~4 days
const FLYBY_DURATION = 6 * 3600;          // 6 hours
const REENTRY_DURATION = 2 * 3600;        // 2 hours

// Phase start times (seconds from launch)
const T_LAUNCH_START = 0;
const T_LEO_START = LAUNCH_DURATION;
const T_TLI = TLI_EPOCH - LAUNCH_EPOCH;
const T_OUTBOUND_START = T_TLI;
const T_OUTBOUND_END = T_OUTBOUND_START + OUTBOUND_DURATION;
const T_FLYBY_START = T_OUTBOUND_END;
const T_FLYBY_END = T_FLYBY_START + FLYBY_DURATION;
const T_REENTRY_START = SPLASHDOWN_EPOCH - LAUNCH_EPOCH - REENTRY_DURATION;
const T_RETURN_START = T_FLYBY_END;
const T_RETURN_END = T_REENTRY_START;
const T_REENTRY_END = SPLASHDOWN_EPOCH - LAUNCH_EPOCH;

// Earth's rotation rate (rad/s)
const EARTH_OMEGA = 7.2921159e-5;

// ─── Utility Functions ──────────────────────────────────────────────────────

/** Smooth interpolation (ease in-out) */
function smoothstep(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

/** Convert geodetic (lat, lon, alt) to ECI at a given time since J2000 */
function geodeticToECI(
  lat: number, lon: number, altKm: number, timeSinceLaunch: number
): { x: number; y: number; z: number } {
  const r = R_EARTH + altKm;
  // Greenwich sidereal angle at launch (approximate — using a fixed offset)
  // For 2026-04-01T18:24:00Z, GMST ≈ 12.5 hours ≈ 187.5°
  const gmst0 = 187.5 * Math.PI / 180;
  const theta = gmst0 + EARTH_OMEGA * timeSinceLaunch + lon;

  return {
    x: r * Math.cos(lat) * Math.cos(theta),
    y: r * Math.cos(lat) * Math.sin(theta),
    z: r * Math.sin(lat),
  };
}

/** Get Moon position in ECI at time since launch (simplified circular orbit) */
function getMoonPosition(timeSinceLaunch: number): { x: number; y: number; z: number } {
  // Moon's mean anomaly at launch (approximate — place Moon so flyby timing works)
  // We set initial angle so Moon is at the right position ~4 days after launch
  const moonAngle0 = -2 * Math.PI * (OUTBOUND_DURATION + FLYBY_DURATION / 2) / MOON_PERIOD;
  const angle = moonAngle0 + (2 * Math.PI * timeSinceLaunch) / MOON_PERIOD;

  // Inclined circular orbit
  return {
    x: MOON_DISTANCE * Math.cos(angle),
    y: MOON_DISTANCE * Math.sin(angle) * Math.cos(MOON_INCLINATION),
    z: MOON_DISTANCE * Math.sin(angle) * Math.sin(MOON_INCLINATION),
  };
}

/** Compute velocity by finite difference */
function velocityByDiff(
  posFn: (t: number) => { x: number; y: number; z: number },
  t: number,
  dt: number = 1.0
): { vx: number; vy: number; vz: number } {
  const p1 = posFn(t - dt / 2);
  const p2 = posFn(t + dt / 2);
  return {
    vx: (p2.x - p1.x) / dt,
    vy: (p2.y - p1.y) / dt,
    vz: (p2.z - p1.z) / dt,
  };
}

/** Get orbital position at angle theta for a circular orbit at given radius, inclination, and RAAN */
function circularOrbitPos(
  theta: number, radius: number, inclination: number, raan: number
): { x: number; y: number; z: number } {
  // Position in orbital plane
  const xOrb = radius * Math.cos(theta);
  const yOrb = radius * Math.sin(theta);

  // Rotate by inclination and RAAN
  const cosI = Math.cos(inclination);
  const sinI = Math.sin(inclination);
  const cosR = Math.cos(raan);
  const sinR = Math.sin(raan);

  return {
    x: cosR * xOrb - sinR * cosI * yOrb,
    y: sinR * xOrb + cosR * cosI * yOrb,
    z: sinI * yOrb,
  };
}

// ─── Phase Position Functions ───────────────────────────────────────────────

/**
 * LEO orbit parameters: we fix an orbital inclination of ~28.6° (launch latitude)
 * and compute a RAAN from the launch site geometry.
 */
const LEO_INCLINATION = KSC_LAT; // ~28.6° inclination
const LEO_RAAN_0 = (() => {
  // RAAN at launch: the ascending node is roughly 90° behind the launch azimuth
  const launchECI = geodeticToECI(KSC_LAT, KSC_LON, 0, 0);
  return Math.atan2(launchECI.y, launchECI.x);
})();

/** Angular velocity in LEO */
const LEO_OMEGA = LEO_VELOCITY / LEO_RADIUS; // rad/s

/** Initial true anomaly offset so that at t=T_LEO_START the position matches end of launch */
const LEO_THETA_0 = (() => {
  const launchEndECI = geodeticToECI(KSC_LAT, KSC_LON, LEO_ALTITUDE, LAUNCH_DURATION);
  // Project onto orbital plane to find initial angle
  const cosR = Math.cos(LEO_RAAN_0);
  const sinR = Math.sin(LEO_RAAN_0);
  const xRot = cosR * launchEndECI.x + sinR * launchEndECI.y;
  const yRot = -sinR * launchEndECI.x + cosR * launchEndECI.y;
  return Math.atan2(yRot, xRot);
})();

function getLaunchPosition(t: number): { x: number; y: number; z: number } {
  const frac = t / LAUNCH_DURATION;
  const s = smoothstep(frac);
  const alt = LEO_ALTITUDE * s;
  // Interpolate latitude slightly (gravity turn) — stay near KSC
  const lat = KSC_LAT + 0.02 * s; // slight northward drift
  const lon = KSC_LON + 0.05 * s; // slight eastward drift from Earth rotation
  return geodeticToECI(lat, lon, alt, t);
}

function getLEOPosition(t: number): { x: number; y: number; z: number } {
  const dt = t - T_LEO_START;
  const theta = LEO_THETA_0 + LEO_OMEGA * dt;
  return circularOrbitPos(theta, LEO_RADIUS, LEO_INCLINATION, LEO_RAAN_0);
}

function getOutboundPosition(t: number): { x: number; y: number; z: number } {
  const frac = (t - T_OUTBOUND_START) / OUTBOUND_DURATION;
  const s = smoothstep(frac);

  // Start position: LEO position at TLI
  const startPos = getLEOPosition(T_TLI);

  // End position: near Moon at flyby start
  const moonPos = getMoonPosition(T_FLYBY_START);
  const moonDist = Math.sqrt(moonPos.x ** 2 + moonPos.y ** 2 + moonPos.z ** 2);
  // Approach from Earth-side of Moon
  const approachFactor = (moonDist - MOON_RADIUS - FLYBY_ALTITUDE) / moonDist;
  const endPos = {
    x: moonPos.x * approachFactor,
    y: moonPos.y * approachFactor,
    z: moonPos.z * approachFactor,
  };

  // Add an outward arc perpendicular to the transfer plane
  // The arc peaks at about 30,000 km above the Earth-Moon line
  const arcHeight = 30000;
  const arcFrac = Math.sin(Math.PI * frac); // peaks at midpoint
  // Arc direction: cross product of start-to-end vector and z-axis
  const dx = endPos.x - startPos.x;
  const dy = endPos.y - startPos.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const arcDir = { x: -dy / len, y: dx / len, z: 0.3 }; // mostly in-plane with z tilt
  const arcNorm = Math.sqrt(arcDir.x ** 2 + arcDir.y ** 2 + arcDir.z ** 2);

  return {
    x: startPos.x * (1 - s) + endPos.x * s + arcHeight * arcFrac * arcDir.x / arcNorm,
    y: startPos.y * (1 - s) + endPos.y * s + arcHeight * arcFrac * arcDir.y / arcNorm,
    z: startPos.z * (1 - s) + endPos.z * s + arcHeight * arcFrac * arcDir.z / arcNorm,
  };
}

function getFlybyPosition(t: number): { x: number; y: number; z: number } {
  const frac = (t - T_FLYBY_START) / FLYBY_DURATION;

  // Moon position at flyby midpoint (approximately constant over 6 hours)
  const moonPos = getMoonPosition(T_FLYBY_START + FLYBY_DURATION / 2);

  // Flyby: half orbit around Moon at flyby altitude
  // The approach is from the Earth side, so we do a 180° arc
  const flybyRadius = MOON_RADIUS + FLYBY_ALTITUDE;
  const angle = Math.PI * frac; // 0 to π (half orbit)

  // Flyby plane: roughly in the Earth-Moon plane
  // Direction from Earth to Moon
  const moonDist = Math.sqrt(moonPos.x ** 2 + moonPos.y ** 2 + moonPos.z ** 2);
  const moonDir = {
    x: moonPos.x / moonDist,
    y: moonPos.y / moonDist,
    z: moonPos.z / moonDist,
  };

  // Perpendicular direction in the flyby plane
  // Use cross product with z-axis to get a tangent direction
  const tangent = {
    x: -moonDir.y,
    y: moonDir.x,
    z: 0,
  };
  const tangentNorm = Math.sqrt(tangent.x ** 2 + tangent.y ** 2) || 1;
  tangent.x /= tangentNorm;
  tangent.y /= tangentNorm;

  // Normal to both (for the flyby arc out of plane)
  const normal = {
    x: moonDir.y * tangent.z - moonDir.z * tangent.y,
    y: moonDir.z * tangent.x - moonDir.x * tangent.z,
    z: moonDir.x * tangent.y - moonDir.y * tangent.x,
  };

  // Position relative to Moon: start on Earth-side, arc around
  const relX = -flybyRadius * Math.cos(angle); // starts at -R (Earth side), goes to +R
  const relY = flybyRadius * Math.sin(angle);  // arcs perpendicular

  return {
    x: moonPos.x + relX * moonDir.x + relY * tangent.x,
    y: moonPos.y + relX * moonDir.y + relY * tangent.y,
    z: moonPos.z + relX * moonDir.z + relY * tangent.z + relY * normal.z * 0.1,
  };
}

function getReturnPosition(t: number): { x: number; y: number; z: number } {
  const frac = (t - T_RETURN_START) / (T_RETURN_END - T_RETURN_START);
  const s = smoothstep(frac);

  // Start: flyby end position
  const startPos = getFlybyPosition(T_FLYBY_END);

  // End: near Earth at reentry interface (120 km altitude)
  const reentryAlt = 120;
  const reentryPos = geodeticToECI(SPLASH_LAT, SPLASH_LON, reentryAlt, T_REENTRY_START);

  // Arc: return trajectory arcs above the Earth-Moon plane
  const arcHeight = 25000; // km
  const arcFrac = Math.sin(Math.PI * frac);
  const dx = reentryPos.x - startPos.x;
  const dy = reentryPos.y - startPos.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const arcDir = { x: dy / len, y: -dx / len, z: -0.25 };
  const arcNorm = Math.sqrt(arcDir.x ** 2 + arcDir.y ** 2 + arcDir.z ** 2);

  return {
    x: startPos.x * (1 - s) + reentryPos.x * s + arcHeight * arcFrac * arcDir.x / arcNorm,
    y: startPos.y * (1 - s) + reentryPos.y * s + arcHeight * arcFrac * arcDir.y / arcNorm,
    z: startPos.z * (1 - s) + reentryPos.z * s + arcHeight * arcFrac * arcDir.z / arcNorm,
  };
}

function getReentryPosition(t: number): { x: number; y: number; z: number } {
  const frac = (t - T_REENTRY_START) / REENTRY_DURATION;
  const s = smoothstep(frac);

  // Altitude decreases from 120 km to 0
  const alt = 120 * (1 - s);

  // Slight drift in lat/lon during reentry
  const lat = SPLASH_LAT + 0.05 * (1 - frac);
  const lon = SPLASH_LON + 0.03 * (1 - frac);

  return geodeticToECI(lat, lon, alt, t);
}

// ─── Unified Position Function ──────────────────────────────────────────────

function getPosition(t: number): { x: number; y: number; z: number } {
  if (t <= T_LEO_START) {
    return getLaunchPosition(t);
  } else if (t <= T_TLI) {
    return getLEOPosition(t);
  } else if (t <= T_OUTBOUND_END) {
    return getOutboundPosition(t);
  } else if (t <= T_FLYBY_END) {
    return getFlybyPosition(t);
  } else if (t <= T_REENTRY_START) {
    return getReturnPosition(t);
  } else {
    return getReentryPosition(t);
  }
}

function getPhase(t: number): string {
  if (t <= T_LEO_START) return 'launch';
  if (t <= T_TLI) return 'parking_orbit';
  if (t <= T_OUTBOUND_END) return 'outbound_coast';
  if (t <= T_FLYBY_END) return 'lunar_flyby';
  if (t <= T_REENTRY_START) return 'return_coast';
  return 'reentry';
}

// ─── Waypoint Generation ────────────────────────────────────────────────────

interface Waypoint {
  t: string;   // ISO timestamp
  phase: string;
  x: number;   // ECI km
  y: number;
  z: number;
  vx: number;  // km/s
  vy: number;
  vz: number;
  alt?: number; // altitude in km (for near-Earth phases)
}

function generateWaypoints(): Waypoint[] {
  const waypoints: Waypoint[] = [];
  const totalDuration = SPLASHDOWN_EPOCH - LAUNCH_EPOCH;

  // Generate time samples at varying intervals per phase
  const timeSamples: number[] = [];

  // Launch: 30s intervals (8 min = 16 points)
  for (let t = 0; t <= LAUNCH_DURATION; t += 30) {
    timeSamples.push(t);
  }

  // Parking orbit: 90s intervals (90 min = ~60 points)
  for (let t = T_LEO_START + 90; t <= T_TLI; t += 90) {
    timeSamples.push(t);
  }

  // Outbound coast: 30 min intervals (~4 days = 192 points)
  for (let t = T_OUTBOUND_START + 1800; t <= T_OUTBOUND_END; t += 1800) {
    timeSamples.push(t);
  }

  // Lunar flyby: 5 min intervals (6 hours = 72 points)
  for (let t = T_FLYBY_START + 300; t <= T_FLYBY_END; t += 300) {
    timeSamples.push(t);
  }

  // Return coast: 45 min intervals (~5.5 days = ~176 points)
  for (let t = T_RETURN_START + 2700; t <= T_RETURN_END; t += 2700) {
    timeSamples.push(t);
  }

  // Reentry: 1 min intervals (2 hours = 120 points)
  for (let t = T_REENTRY_START + 60; t <= T_REENTRY_END; t += 60) {
    timeSamples.push(t);
  }

  // Ensure we have the very first and last points
  if (timeSamples[0] !== 0) timeSamples.unshift(0);
  if (timeSamples[timeSamples.length - 1] !== totalDuration) timeSamples.push(totalDuration);

  // Sort and deduplicate
  const uniqueTimes = [...new Set(timeSamples)].sort((a, b) => a - b);

  for (const t of uniqueTimes) {
    const pos = getPosition(t);
    const vel = velocityByDiff(getPosition, t, 2.0);
    const phase = getPhase(t);

    // Compute altitude
    const distFromCenter = Math.sqrt(pos.x ** 2 + pos.y ** 2 + pos.z ** 2);
    const alt = distFromCenter - R_EARTH;

    const timestamp = new Date(LAUNCH_EPOCH * 1000 + t * 1000).toISOString();

    waypoints.push({
      t: timestamp,
      phase,
      x: Math.round(pos.x * 100) / 100,
      y: Math.round(pos.y * 100) / 100,
      z: Math.round(pos.z * 100) / 100,
      vx: Math.round(vel.vx * 10000) / 10000,
      vy: Math.round(vel.vy * 10000) / 10000,
      vz: Math.round(vel.vz * 10000) / 10000,
      ...(alt < 50000 ? { alt: Math.round(alt * 100) / 100 } : {}),
    });
  }

  return waypoints;
}

// ─── Main ───────────────────────────────────────────────────────────────────

function main() {
  console.log('Generating Artemis 2 trajectory data...');
  console.log(`  Launch:     ${LAUNCH_TIME.toISOString()}`);
  console.log(`  TLI:        ${TLI_TIME.toISOString()}`);
  console.log(`  Splashdown: ${SPLASHDOWN_TIME.toISOString()}`);
  console.log(`  Mission duration: ${((SPLASHDOWN_EPOCH - LAUNCH_EPOCH) / 86400).toFixed(2)} days`);

  const waypoints = generateWaypoints();

  // Count by phase
  const phaseCounts: Record<string, number> = {};
  for (const wp of waypoints) {
    phaseCounts[wp.phase] = (phaseCounts[wp.phase] || 0) + 1;
  }
  console.log('\nWaypoints by phase:');
  for (const [phase, count] of Object.entries(phaseCounts)) {
    console.log(`  ${phase}: ${count}`);
  }
  console.log(`  TOTAL: ${waypoints.length}`);

  // Build output
  const output = {
    vehicle: 'Orion MPCV (Artemis II)',
    crew: [
      { name: 'Reid Wiseman', role: 'Commander' },
      { name: 'Victor Glover', role: 'Pilot' },
      { name: 'Christina Koch', role: 'Mission Specialist 1' },
      { name: 'Jeremy Hansen', role: 'Mission Specialist 2' },
    ],
    launchTime: LAUNCH_TIME.toISOString(),
    splashdownTime: SPLASHDOWN_TIME.toISOString(),
    generatedAt: new Date().toISOString(),
    coordinateFrame: 'ECI (Earth-Centered Inertial, J2000)',
    units: { position: 'km', velocity: 'km/s', time: 'ISO 8601 UTC' },
    notes: 'Approximate trajectory using simplified patched-conic model. Not JPL-precision.',
    phases: [
      {
        id: 'launch',
        name: 'Launch & Ascent',
        start: LAUNCH_TIME.toISOString(),
        end: new Date(LAUNCH_EPOCH * 1000 + T_LEO_START * 1000).toISOString(),
        description: 'SLS Block 1 launch from KSC LC-39B, ascent to LEO',
        waypointCount: phaseCounts['launch'] || 0,
      },
      {
        id: 'parking_orbit',
        name: 'Parking Orbit',
        start: new Date(LAUNCH_EPOCH * 1000 + T_LEO_START * 1000).toISOString(),
        end: new Date(LAUNCH_EPOCH * 1000 + T_TLI * 1000).toISOString(),
        description: 'Circular LEO at 185 km altitude for systems checkout',
        waypointCount: phaseCounts['parking_orbit'] || 0,
      },
      {
        id: 'tli',
        name: 'Trans-Lunar Injection',
        start: new Date(LAUNCH_EPOCH * 1000 + T_TLI * 1000).toISOString(),
        end: new Date(LAUNCH_EPOCH * 1000 + T_TLI * 1000).toISOString(),
        description: 'ICPS upper stage burn to escape Earth orbit',
        waypointCount: 0,
      },
      {
        id: 'outbound_coast',
        name: 'Outbound Coast',
        start: new Date(LAUNCH_EPOCH * 1000 + T_OUTBOUND_START * 1000).toISOString(),
        end: new Date(LAUNCH_EPOCH * 1000 + T_OUTBOUND_END * 1000).toISOString(),
        description: 'Free-return trajectory coasting toward the Moon',
        waypointCount: phaseCounts['outbound_coast'] || 0,
      },
      {
        id: 'lunar_flyby',
        name: 'Lunar Flyby',
        start: new Date(LAUNCH_EPOCH * 1000 + T_FLYBY_START * 1000).toISOString(),
        end: new Date(LAUNCH_EPOCH * 1000 + T_FLYBY_END * 1000).toISOString(),
        description: `Close approach ~${FLYBY_ALTITUDE} km above lunar far side`,
        waypointCount: phaseCounts['lunar_flyby'] || 0,
      },
      {
        id: 'return_coast',
        name: 'Return Coast',
        start: new Date(LAUNCH_EPOCH * 1000 + T_FLYBY_END * 1000).toISOString(),
        end: new Date(LAUNCH_EPOCH * 1000 + T_REENTRY_START * 1000).toISOString(),
        description: 'Free-return coast back to Earth',
        waypointCount: phaseCounts['return_coast'] || 0,
      },
      {
        id: 'reentry',
        name: 'Reentry & Splashdown',
        start: new Date(LAUNCH_EPOCH * 1000 + T_REENTRY_START * 1000).toISOString(),
        end: SPLASHDOWN_TIME.toISOString(),
        description: 'Skip reentry and splashdown in the Pacific Ocean',
        waypointCount: phaseCounts['reentry'] || 0,
      },
    ],
    waypoints: waypoints,
  };

  // Write output
  const outDir = path.resolve(__dirname, '../trackers/artemis-2/data');
  const outPath = path.join(outDir, 'mission-trajectory.json');

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n');
  console.log(`\nWritten to: ${outPath}`);
  console.log(`File size: ${(fs.statSync(outPath).size / 1024).toFixed(1)} KB`);
}

main();
