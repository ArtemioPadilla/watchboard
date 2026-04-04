#!/usr/bin/env tsx
/**
 * generate-artemis-trajectory.ts
 *
 * Downloads NASA AROW OEM file for Artemis II, parses state vectors.
 * Pure real data in EME2000 (equatorial J2000 inertial) frame.
 * No computed phases, no frame conversions, no approximations.
 *
 * Data: NASA/JSC/FOD/FDO (CCSDS OEM v2.0)
 * Source: https://www.nasa.gov/missions/artemis/artemis-2/track-nasas-artemis-ii-mission-in-real-time/
 */
import fs from 'fs';
import { execSync } from 'child_process';

const OUTPUT = 'trackers/artemis-2/data/mission-trajectory.json';
const OEM_URL = 'https://www.nasa.gov/wp-content/uploads/2026/03/artemis-ii-oem-2026-04-03-to-ei.zip?emrc=69d0646de736c';
const TMP = '/tmp/artemis-oem';

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

interface Waypoint { t: string; x: number; y: number; z: number; vx: number; vy: number; vz: number; }

function round(n: number, d = 2): number { const f = 10 ** d; return Math.round(n * f) / f; }

function parseOEM(content: string): Waypoint[] {
  const wps: Waypoint[] = [];
  let inData = false;
  for (const line of content.split('\n')) {
    const t = line.trim();
    if (t === 'META_STOP') { inData = true; continue; }
    if (t === 'META_START') { inData = false; continue; }
    if (!inData || !t.startsWith('2026-') || t.startsWith('COMMENT')) continue;
    const p = t.split(/\s+/);
    if (p.length >= 7) {
      wps.push({
        t: p[0].replace(/\.\d+$/, 'Z'),
        x: parseFloat(p[1]), y: parseFloat(p[2]), z: parseFloat(p[3]),
        vx: parseFloat(p[4]), vy: parseFloat(p[5]), vz: parseFloat(p[6]),
      });
    }
  }
  return wps;
}

async function main() {
  console.log('[artemis] Downloading NASA AROW OEM...');
  execSync(`mkdir -p ${TMP}`);
  execSync(`curl -sL "${OEM_URL}" -o ${TMP}/oem.zip`);
  execSync(`unzip -o ${TMP}/oem.zip -d ${TMP}`);

  const file = fs.readdirSync(TMP).find(f => f.endsWith('.asc'));
  if (!file) { console.error('No .asc file'); process.exit(1); }

  const waypoints = parseOEM(fs.readFileSync(`${TMP}/${file}`, 'utf8'));
  console.log(`[artemis] ${waypoints.length} waypoints from ${file}`);

  for (const wp of waypoints) {
    wp.x = round(wp.x); wp.y = round(wp.y); wp.z = round(wp.z);
    wp.vx = round(wp.vx, 5); wp.vy = round(wp.vy, 5); wp.vz = round(wp.vz, 5);
  }

  const dist = (w: Waypoint) => Math.sqrt(w.x ** 2 + w.y ** 2 + w.z ** 2);
  const f = waypoints[0], l = waypoints[waypoints.length - 1];
  console.log(`[artemis] Start: ${f.t} alt ${Math.round(dist(f) - 6371)} km`);
  console.log(`[artemis] End: ${l.t} alt ${Math.round(dist(l) - 6371)} km`);
  console.log(`[artemis] Max: ${Math.round(Math.max(...waypoints.map(dist)))} km`);

  fs.writeFileSync(OUTPUT, JSON.stringify({
    ...MISSION,
    coordinateFrame: 'EME2000',
    units: { position: 'km', velocity: 'km/s' },
    source: 'NASA AROW OEM (CCSDS v2.0), NASA/JSC/FOD/FDO',
    sourceUrl: 'https://www.nasa.gov/missions/artemis/artemis-2/track-nasas-artemis-ii-mission-in-real-time/',
    oemFile: file,
    waypoints,
  }, null, 2) + '\n');

  console.log(`[artemis] Written ${waypoints.length} waypoints (${Math.round(fs.statSync(OUTPUT).size / 1024)} KB)`);
}

main().catch(e => { console.error(e); process.exit(1); });
