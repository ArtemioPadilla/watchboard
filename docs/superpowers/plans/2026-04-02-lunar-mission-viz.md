# Artemis 2 Lunar Mission Visualization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Visualize the Artemis 2 Earth-to-Moon trajectory on the existing CesiumGlobe with spacecraft tracking, telemetry HUD, and hybrid Moon LOD.

**Architecture:** New `useLunarMission` hook reads pre-computed ECI waypoints from `mission-trajectory.json`, converts to ECEF, creates a `SampledPositionProperty` for smooth interpolation, renders trajectory polyline + spacecraft billboard, computes telemetry per frame, and manages Moon LOD switching. A `MissionHUD` overlay displays telemetry. The globe page loads trajectory data and passes it as a prop.

**Tech Stack:** CesiumJS 1.139 (SampledPositionProperty, Transforms, Simon1994PlanetaryPositions), React 19, Zod, TypeScript

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/schemas.ts` | Modify | Add `MissionTrajectorySchema` |
| `src/components/islands/CesiumGlobe/mission-helpers.ts` | Create | ECI→ECEF conversion, telemetry math, Moon position, formatters |
| `scripts/generate-artemis-trajectory.ts` | Create | Generate approximate trajectory waypoints |
| `trackers/artemis-2/data/mission-trajectory.json` | Create (via script) | Pre-computed trajectory data |
| `src/components/islands/CesiumGlobe/MissionHUD.tsx` | Create | Telemetry overlay panels |
| `src/components/islands/CesiumGlobe/useLunarMission.ts` | Create | Hook: trajectory, spacecraft entity, telemetry, Moon LOD |
| `src/components/islands/CesiumGlobe/CesiumGlobe.tsx` | Modify | Accept `missionTrajectory` prop, wire hook + HUD |
| `src/pages/[tracker]/globe.astro` | Modify | Load trajectory data, pass to CesiumGlobe |

---

### Task 1: Add MissionTrajectorySchema

**Files:**
- Modify: `src/lib/schemas.ts`

- [ ] **Step 1: Add mission trajectory schemas at the end of the file (before any final exports)**

Append to `src/lib/schemas.ts`:

```typescript
// ── Mission Trajectory ──

export const MissionPhaseSchema = z.object({
  id: z.string(),
  label: z.string(),
  start: z.string(),
  end: z.string(),
});

export const MissionCrewSchema = z.object({
  name: z.string(),
  role: z.string(),
});

export const MissionWaypointSchema = z.object({
  t: z.string(),
  x: z.number(), y: z.number(), z: z.number(),
  vx: z.number(), vy: z.number(), vz: z.number(),
});

export const MissionTrajectorySchema = z.object({
  vehicle: z.string(),
  crew: z.array(MissionCrewSchema),
  launchTime: z.string(),
  splashdownTime: z.string(),
  phases: z.array(MissionPhaseSchema).min(1),
  waypoints: z.array(MissionWaypointSchema).min(2),
});

export type MissionPhase = z.infer<typeof MissionPhaseSchema>;
export type MissionCrew = z.infer<typeof MissionCrewSchema>;
export type MissionWaypoint = z.infer<typeof MissionWaypointSchema>;
export type MissionTrajectory = z.infer<typeof MissionTrajectorySchema>;
```

- [ ] **Step 2: Build to verify**

Run: `npm run build`
Expected: Build succeeds. No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/schemas.ts
git commit -m "feat(schema): add MissionTrajectorySchema for lunar mission visualization"
```

---

### Task 2: Create mission-helpers.ts

**Files:**
- Create: `src/components/islands/CesiumGlobe/mission-helpers.ts`

- [ ] **Step 1: Create the helpers file**

Create `src/components/islands/CesiumGlobe/mission-helpers.ts`:

```typescript
import {
  Cartesian3,
  JulianDate,
  Matrix3,
  Transforms,
  Simon1994PlanetaryPositions,
  type Viewer as CesiumViewer,
} from 'cesium';
import type { MissionPhase } from '../../../lib/schemas';

// ── Types ──

export interface TelemetryState {
  altitudeKm: number;
  velocityKmS: number;
  distToMoonKm: number;
  metSeconds: number;
  currentPhase: MissionPhase | null;
  phaseProgress: number;
  overallProgress: number;
}

export const EMPTY_TELEMETRY: TelemetryState = {
  altitudeKm: 0,
  velocityKmS: 0,
  distToMoonKm: 0,
  metSeconds: 0,
  currentPhase: null,
  phaseProgress: 0,
  overallProgress: 0,
};

const EARTH_RADIUS_KM = 6371;

// ── ECI → ECEF conversion ──

const scratchMatrix = new Matrix3();
const scratchEci = new Cartesian3();
const scratchResult = new Cartesian3();

/**
 * Convert ECI J2000 position (km) to ECEF Cartesian3 (meters).
 * Uses CesiumJS's ICRF→Fixed rotation matrix for the given time.
 */
export function eciToEcef(
  eciKm: { x: number; y: number; z: number },
  julianDate: JulianDate,
): Cartesian3 {
  const rotationMatrix = Transforms.computeIcrfToFixedMatrix(julianDate, scratchMatrix);
  if (!rotationMatrix) {
    // Fallback: treat ECI as ECEF (small error for short durations)
    return new Cartesian3(eciKm.x * 1000, eciKm.y * 1000, eciKm.z * 1000);
  }
  // ECI position in meters
  Cartesian3.fromElements(eciKm.x * 1000, eciKm.y * 1000, eciKm.z * 1000, scratchEci);
  // Rotate from ICRF (ECI) to ECEF
  Matrix3.multiplyByVector(rotationMatrix, scratchEci, scratchResult);
  return Cartesian3.clone(scratchResult);
}

// ── Moon position ──

const scratchSunMoon = {
  moonPosition: new Cartesian3(),
};

/**
 * Get Moon's ECEF position at a given time (meters).
 */
export function getMoonPosition(julianDate: JulianDate): Cartesian3 {
  // Simon1994 gives Moon position in ECEF (Fixed frame) directly
  const result = Simon1994PlanetaryPositions.computeMoonPositionInEarthInertialFrame(julianDate);
  // Convert from inertial to fixed
  const rotationMatrix = Transforms.computeIcrfToFixedMatrix(julianDate, scratchMatrix);
  if (rotationMatrix) {
    Matrix3.multiplyByVector(rotationMatrix, result, scratchSunMoon.moonPosition);
    return Cartesian3.clone(scratchSunMoon.moonPosition);
  }
  return Cartesian3.clone(result);
}

// ── Telemetry computation ──

/**
 * Compute all telemetry values from current spacecraft state.
 */
export function computeTelemetry(
  positionEcef: Cartesian3,
  velocityKmS: number,
  launchJd: JulianDate,
  currentJd: JulianDate,
  splashdownJd: JulianDate,
  phases: MissionPhase[],
): TelemetryState {
  // Altitude (km) = distance from Earth center - Earth radius
  const distFromCenterM = Cartesian3.magnitude(positionEcef);
  const altitudeKm = (distFromCenterM / 1000) - EARTH_RADIUS_KM;

  // Distance to Moon (km)
  const moonPos = getMoonPosition(currentJd);
  const distToMoonM = Cartesian3.distance(positionEcef, moonPos);
  const distToMoonKm = distToMoonM / 1000;

  // Mission Elapsed Time (seconds)
  const metSeconds = JulianDate.secondsDifference(currentJd, launchJd);

  // Overall progress
  const totalDuration = JulianDate.secondsDifference(splashdownJd, launchJd);
  const overallProgress = Math.max(0, Math.min(1, metSeconds / totalDuration));

  // Current phase
  let currentPhase: MissionPhase | null = null;
  let phaseProgress = 0;
  for (const phase of phases) {
    const phaseStart = JulianDate.fromIso8601(phase.start);
    const phaseEnd = JulianDate.fromIso8601(phase.end);
    if (
      JulianDate.greaterThanOrEquals(currentJd, phaseStart) &&
      JulianDate.lessThan(currentJd, phaseEnd)
    ) {
      currentPhase = phase;
      const phaseDuration = JulianDate.secondsDifference(phaseEnd, phaseStart);
      const phaseElapsed = JulianDate.secondsDifference(currentJd, phaseStart);
      phaseProgress = Math.max(0, Math.min(1, phaseElapsed / phaseDuration));
      break;
    }
  }

  return {
    altitudeKm,
    velocityKmS: velocityKmS,
    distToMoonKm,
    metSeconds,
    currentPhase,
    phaseProgress,
    overallProgress,
  };
}

// ── Formatters ──

/**
 * Format Mission Elapsed Time as DD:HH:MM:SS
 */
export function formatMET(totalSeconds: number): string {
  const neg = totalSeconds < 0;
  const abs = Math.abs(Math.floor(totalSeconds));
  const days = Math.floor(abs / 86400);
  const hours = Math.floor((abs % 86400) / 3600);
  const minutes = Math.floor((abs % 3600) / 60);
  const seconds = abs % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  const str = `${pad(days)}:${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  return neg ? `-${str}` : str;
}

/**
 * Format distance with auto-scaling and thousands separators.
 */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 100) return `${km.toFixed(1)} km`;
  return `${Math.round(km).toLocaleString('en-US')} km`;
}

/**
 * Format velocity with auto-scaling.
 */
export function formatVelocity(kmS: number): string {
  if (kmS < 1) return `${Math.round(kmS * 1000)} m/s`;
  return `${kmS.toFixed(2)} km/s`;
}
```

- [ ] **Step 2: Build to verify types compile**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/islands/CesiumGlobe/mission-helpers.ts
git commit -m "feat(globe): add mission-helpers for ECI/ECEF conversion and telemetry math"
```

---

### Task 3: Generate trajectory data

**Files:**
- Create: `scripts/generate-artemis-trajectory.ts`
- Create: `trackers/artemis-2/data/mission-trajectory.json` (output)

- [ ] **Step 1: Create the trajectory generator script**

Create `scripts/generate-artemis-trajectory.ts`. This generates an approximate free-return lunar trajectory using patched conic approximation:

```typescript
import fs from 'fs';

/**
 * Generate approximate Artemis 2 trajectory waypoints.
 * Uses simplified two-body patched conic: Earth departure ellipse → coast → lunar flyby → return.
 * NOT JPL-precision — physically plausible for visualization.
 */

const MU_EARTH = 398600.4418; // km³/s² — Earth gravitational parameter
const MU_MOON = 4902.8;       // km³/s² — Moon gravitational parameter
const EARTH_RADIUS = 6371;    // km
const MOON_RADIUS = 1737.4;   // km
const MOON_DIST = 384400;     // km — mean Earth-Moon distance

// Mission parameters
const LAUNCH_TIME = '2026-04-01T18:24:00Z';
const LEO_ALT = 185;          // km — parking orbit altitude
const TLI_TIME = '2026-04-01T20:00:00Z'; // Trans-Lunar Injection
const FLYBY_ALT = 100;        // km above lunar surface
const SPLASHDOWN_TIME = '2026-04-11T14:00:00Z';

// KSC coordinates (ECI at launch epoch — simplified)
const KSC_LAT = 28.6;
const KSC_LON = -80.6;

interface Waypoint {
  t: string;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
}

function isoDate(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function latLonAltToEci(lat: number, lon: number, altKm: number, timeMs: number): { x: number; y: number; z: number } {
  // Simplified: rotate lon by Earth rotation since J2000 epoch
  const r = EARTH_RADIUS + altKm;
  const latRad = lat * Math.PI / 180;
  // Approximate GMST rotation (Earth rotates ~360.98°/day)
  const j2000Epoch = Date.UTC(2000, 0, 1, 12, 0, 0);
  const daysSinceJ2000 = (timeMs - j2000Epoch) / 86400000;
  const gmst = (280.46061837 + 360.98564736629 * daysSinceJ2000) % 360;
  const lonEci = (lon + gmst) * Math.PI / 180;

  return {
    x: r * Math.cos(latRad) * Math.cos(lonEci),
    y: r * Math.cos(latRad) * Math.sin(lonEci),
    z: r * Math.sin(latRad),
  };
}

function getMoonPositionEci(timeMs: number): { x: number; y: number; z: number } {
  // Simplified circular Moon orbit in ECI
  const j2000Epoch = Date.UTC(2000, 0, 1, 12, 0, 0);
  const daysSinceJ2000 = (timeMs - j2000Epoch) / 86400000;
  // Moon orbital period ~27.32 days, inclination ~5.14° to ecliptic
  const moonPeriodDays = 27.321661;
  const angle = (2 * Math.PI * daysSinceJ2000) / moonPeriodDays;
  const incl = 5.14 * Math.PI / 180;

  return {
    x: MOON_DIST * Math.cos(angle),
    y: MOON_DIST * Math.sin(angle) * Math.cos(incl),
    z: MOON_DIST * Math.sin(angle) * Math.sin(incl),
  };
}

function generateWaypoints(): Waypoint[] {
  const waypoints: Waypoint[] = [];
  const launchMs = new Date(LAUNCH_TIME).getTime();
  const tliMs = new Date(TLI_TIME).getTime();
  const splashdownMs = new Date(SPLASHDOWN_TIME).getTime();
  const totalMs = splashdownMs - launchMs;

  // Phase 1: Launch to LEO (8 minutes, rapid altitude gain)
  const leoMs = launchMs + 8 * 60 * 1000;
  for (let t = launchMs; t <= leoMs; t += 30000) { // every 30s
    const frac = (t - launchMs) / (leoMs - launchMs);
    const alt = frac * LEO_ALT;
    const pos = latLonAltToEci(KSC_LAT, KSC_LON + frac * 5, alt, t);
    const v = 3 + frac * 4.7; // ramp to orbital velocity ~7.7 km/s
    const bearing = Math.atan2(pos.y, pos.x);
    waypoints.push({
      t: isoDate(t),
      x: round(pos.x), y: round(pos.y), z: round(pos.z),
      vx: round(-v * Math.sin(bearing)),
      vy: round(v * Math.cos(bearing)),
      vz: round(0.1 * v),
    });
  }

  // Phase 2: LEO parking orbit (launch+8min to TLI at launch+96min)
  const leoR = EARTH_RADIUS + LEO_ALT;
  const leoV = Math.sqrt(MU_EARTH / leoR); // ~7.79 km/s
  const leoPeriod = 2 * Math.PI * Math.sqrt(leoR ** 3 / MU_EARTH) * 1000; // ms
  for (let t = leoMs; t <= tliMs; t += 60000) { // every 60s
    const angle0 = Math.atan2(
      latLonAltToEci(KSC_LAT, KSC_LON + 5, LEO_ALT, leoMs).y,
      latLonAltToEci(KSC_LAT, KSC_LON + 5, LEO_ALT, leoMs).x,
    );
    const elapsed = t - leoMs;
    const angle = angle0 + (2 * Math.PI * elapsed) / leoPeriod;
    const inclRad = KSC_LAT * Math.PI / 180;
    waypoints.push({
      t: isoDate(t),
      x: round(leoR * Math.cos(angle) * Math.cos(inclRad)),
      y: round(leoR * Math.sin(angle) * Math.cos(inclRad)),
      z: round(leoR * Math.sin(inclRad) * Math.sin(angle)),
      vx: round(-leoV * Math.sin(angle)),
      vy: round(leoV * Math.cos(angle)),
      vz: round(0),
    });
  }

  // Phase 3: Trans-lunar coast (TLI to flyby — ~4 days)
  // Simplified: interpolate from LEO to Moon position along a curved path
  const flybyMs = launchMs + 4 * 86400000; // ~4 days after launch
  const moonAtFlyby = getMoonPositionEci(flybyMs);
  const tliPos = waypoints[waypoints.length - 1];
  const startPos = { x: tliPos.x, y: tliPos.y, z: tliPos.z };

  // Generate coast waypoints every 30 minutes
  for (let t = tliMs; t <= flybyMs; t += 1800000) {
    const frac = (t - tliMs) / (flybyMs - tliMs);
    // Smooth acceleration curve (slow start, fast approach)
    const smoothFrac = frac * frac * (3 - 2 * frac); // smoothstep

    // Interpolate position with a slight outward arc
    const arcHeight = 30000 * Math.sin(frac * Math.PI); // 30,000 km arc above direct line
    const moonAtT = getMoonPositionEci(t);
    const targetFrac = smoothFrac; // aim increasingly toward Moon's future position

    const x = startPos.x * (1 - smoothFrac) + moonAtT.x * targetFrac;
    const y = startPos.y * (1 - smoothFrac) + moonAtT.y * targetFrac;
    const z = startPos.z * (1 - smoothFrac) + moonAtT.z * targetFrac;

    // Add arc height perpendicular to the line
    const dist = Math.sqrt(x * x + y * y + z * z);
    const nx = x / dist, ny = y / dist, nz = z / dist;

    const px = x + nx * arcHeight;
    const py = y + ny * arcHeight;
    const pz = z + nz * arcHeight;

    // Velocity decreases as we coast, then increases near Moon
    const coastV = 10.8 - 7 * frac + 3 * frac * frac; // km/s
    const dx = (moonAtT.x - startPos.x);
    const dy = (moonAtT.y - startPos.y);
    const dz = (moonAtT.z - startPos.z);
    const dMag = Math.sqrt(dx * dx + dy * dy + dz * dz);

    waypoints.push({
      t: isoDate(t),
      x: round(px), y: round(py), z: round(pz),
      vx: round(coastV * dx / dMag),
      vy: round(coastV * dy / dMag),
      vz: round(coastV * dz / dMag),
    });
  }

  // Phase 4: Lunar flyby (6 hours around Moon)
  const flybyEndMs = flybyMs + 6 * 3600000;
  const flybyR = MOON_RADIUS + FLYBY_ALT;
  const flybyV = Math.sqrt(MU_MOON / flybyR); // ~1.63 km/s relative to Moon
  for (let t = flybyMs; t <= flybyEndMs; t += 300000) { // every 5 min
    const frac = (t - flybyMs) / (flybyEndMs - flybyMs);
    const angle = Math.PI + frac * Math.PI; // half orbit around far side
    const moonAtT = getMoonPositionEci(t);

    // Position relative to Moon center
    const relX = flybyR * Math.cos(angle);
    const relY = flybyR * Math.sin(angle);

    // Rotate into approximate Moon-centered frame
    const moonDist = Math.sqrt(moonAtT.x ** 2 + moonAtT.y ** 2 + moonAtT.z ** 2);
    const moonDir = { x: moonAtT.x / moonDist, y: moonAtT.y / moonDist, z: moonAtT.z / moonDist };

    // Perpendicular direction (cross with z-axis)
    const perpX = -moonDir.y;
    const perpY = moonDir.x;
    const perpZ = 0;

    waypoints.push({
      t: isoDate(t),
      x: round(moonAtT.x + moonDir.x * relX + perpX * relY),
      y: round(moonAtT.y + moonDir.y * relX + perpY * relY),
      z: round(moonAtT.z + moonDir.z * relX + perpZ * relY),
      vx: round(-flybyV * Math.sin(angle) * moonDir.x + flybyV * Math.cos(angle) * perpX),
      vy: round(-flybyV * Math.sin(angle) * moonDir.y + flybyV * Math.cos(angle) * perpY),
      vz: round(-flybyV * Math.sin(angle) * moonDir.z),
    });
  }

  // Phase 5: Return coast (flyby end to reentry — ~5.5 days)
  const reentryMs = splashdownMs - 2 * 3600000; // 2h before splashdown
  const returnStart = waypoints[waypoints.length - 1];
  const returnStartPos = { x: returnStart.x, y: returnStart.y, z: returnStart.z };

  // Splashdown: Pacific Ocean ~15°N, -165°W
  const splashdownPos = latLonAltToEci(15, -165, 0, splashdownMs);

  for (let t = flybyEndMs; t <= reentryMs; t += 1800000) { // every 30 min
    const frac = (t - flybyEndMs) / (reentryMs - flybyEndMs);
    const smoothFrac = frac * frac * (3 - 2 * frac);

    const arcHeight = 25000 * Math.sin(frac * Math.PI);
    const x = returnStartPos.x * (1 - smoothFrac) + splashdownPos.x * smoothFrac;
    const y = returnStartPos.y * (1 - smoothFrac) + splashdownPos.y * smoothFrac;
    const z = returnStartPos.z * (1 - smoothFrac) + splashdownPos.z * smoothFrac;

    const dist = Math.sqrt(x * x + y * y + z * z);
    const nx = x / dist, ny = y / dist, nz = z / dist;

    const returnV = 1.5 + 9 * frac * frac; // accelerates toward Earth
    const dx = splashdownPos.x - returnStartPos.x;
    const dy = splashdownPos.y - returnStartPos.y;
    const dz = splashdownPos.z - returnStartPos.z;
    const dMag = Math.sqrt(dx * dx + dy * dy + dz * dz);

    waypoints.push({
      t: isoDate(t),
      x: round(x + nx * arcHeight),
      y: round(y + ny * arcHeight),
      z: round(z + nz * arcHeight),
      vx: round(returnV * dx / dMag),
      vy: round(returnV * dy / dMag),
      vz: round(returnV * dz / dMag),
    });
  }

  // Phase 6: Reentry (2 hours, rapid altitude decrease)
  for (let t = reentryMs; t <= splashdownMs; t += 60000) { // every 1 min
    const frac = (t - reentryMs) / (splashdownMs - reentryMs);
    const alt = (1 - frac) * 120; // 120 km to 0
    const pos = latLonAltToEci(15 + frac * 5, -165 + frac * 10, alt, t);
    const reentryV = 11.0 * (1 - frac * 0.8); // decelerate from 11 km/s
    waypoints.push({
      t: isoDate(t),
      x: round(pos.x), y: round(pos.y), z: round(pos.z),
      vx: round(-reentryV * 0.5), vy: round(-reentryV * 0.5), vz: round(-reentryV * 0.3),
    });
  }

  return waypoints;
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

// ── Generate and write ──

const waypoints = generateWaypoints();

const trajectory = {
  vehicle: 'Orion MPCV',
  crew: [
    { name: 'Reid Wiseman', role: 'Commander' },
    { name: 'Victor Glover', role: 'Pilot' },
    { name: 'Christina Koch', role: 'Mission Specialist 1' },
    { name: 'Jeremy Hansen', role: 'Mission Specialist 2' },
  ],
  launchTime: LAUNCH_TIME,
  splashdownTime: SPLASHDOWN_TIME,
  phases: [
    { id: 'launch', label: 'Launch', start: '2026-04-01T18:24:00Z', end: '2026-04-01T18:32:00Z' },
    { id: 'leo', label: 'Parking Orbit', start: '2026-04-01T18:32:00Z', end: '2026-04-01T20:00:00Z' },
    { id: 'tli', label: 'Trans-Lunar Injection', start: '2026-04-01T20:00:00Z', end: '2026-04-01T20:25:00Z' },
    { id: 'outbound', label: 'Outbound Coast', start: '2026-04-01T20:25:00Z', end: '2026-04-05T12:00:00Z' },
    { id: 'flyby', label: 'Lunar Flyby', start: '2026-04-05T12:00:00Z', end: '2026-04-05T18:00:00Z' },
    { id: 'return', label: 'Return Coast', start: '2026-04-05T18:00:00Z', end: '2026-04-11T12:00:00Z' },
    { id: 'reentry', label: 'Reentry & Splashdown', start: '2026-04-11T12:00:00Z', end: '2026-04-11T14:00:00Z' },
  ],
  waypoints,
};

const outPath = 'trackers/artemis-2/data/mission-trajectory.json';
fs.writeFileSync(outPath, JSON.stringify(trajectory, null, 2) + '\n');
console.log(`Generated ${waypoints.length} waypoints → ${outPath}`);
```

- [ ] **Step 2: Run the generator**

Run: `npx tsx scripts/generate-artemis-trajectory.ts`
Expected: Output like "Generated 650 waypoints → trackers/artemis-2/data/mission-trajectory.json"

- [ ] **Step 3: Validate the output against schema**

Run: `node -e "const z=require('zod');const d=JSON.parse(require('fs').readFileSync('trackers/artemis-2/data/mission-trajectory.json','utf8'));console.log('waypoints:',d.waypoints.length,'phases:',d.phases.length,'crew:',d.crew.length)"`
Expected: waypoints count > 400, phases: 7, crew: 4

- [ ] **Step 4: Build to ensure JSON doesn't break anything**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add scripts/generate-artemis-trajectory.ts trackers/artemis-2/data/mission-trajectory.json
git commit -m "feat(artemis): generate approximate lunar trajectory waypoints"
```

---

### Task 4: Create MissionHUD component

**Files:**
- Create: `src/components/islands/CesiumGlobe/MissionHUD.tsx`

- [ ] **Step 1: Create the HUD component**

Create `src/components/islands/CesiumGlobe/MissionHUD.tsx`:

```tsx
import { useEffect, useRef, type MutableRefObject } from 'react';
import type { TelemetryState } from './mission-helpers';
import { formatMET, formatDistance, formatVelocity } from './mission-helpers';
import type { MissionPhase } from '../../../lib/schemas';

interface Props {
  telemetryRef: MutableRefObject<TelemetryState>;
  vehicle: string;
  phases: MissionPhase[];
}

export default function MissionHUD({ telemetryRef, vehicle, phases }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  // DOM refs for direct updates (no React re-renders)
  const phaseRef = useRef<HTMLDivElement>(null);
  const metRef = useRef<HTMLDivElement>(null);
  const altRef = useRef<HTMLDivElement>(null);
  const velRef = useRef<HTMLDivElement>(null);
  const moonDistRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const phaseHighlightRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tick = () => {
      const t = telemetryRef.current;
      if (phaseRef.current) {
        phaseRef.current.textContent = t.currentPhase?.label ?? 'Pre-Launch';
      }
      if (metRef.current) {
        metRef.current.textContent = `MET ${formatMET(t.metSeconds)}`;
      }
      if (altRef.current) {
        altRef.current.textContent = formatDistance(t.altitudeKm);
      }
      if (velRef.current) {
        velRef.current.textContent = formatVelocity(t.velocityKmS);
      }
      if (moonDistRef.current) {
        moonDistRef.current.textContent = formatDistance(t.distToMoonKm);
      }
      if (progressRef.current) {
        progressRef.current.style.width = `${(t.overallProgress * 100).toFixed(1)}%`;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [telemetryRef]);

  // Compute phase positions for timeline bar
  const totalDuration = phases.reduce((sum, p) => {
    const s = new Date(p.start).getTime();
    const e = new Date(p.end).getTime();
    return sum + (e - s);
  }, 0);
  const missionStart = new Date(phases[0].start).getTime();

  return (
    <div ref={containerRef} style={{ pointerEvents: 'none' }}>
      {/* Top-left: Mission identity */}
      <div style={{
        position: 'absolute', top: 12, left: 12, zIndex: 100,
        background: 'rgba(0,0,0,0.75)', border: '1px solid #333',
        borderRadius: 6, padding: '8px 14px', fontFamily: "'JetBrains Mono', monospace",
      }}>
        <div style={{ color: '#4ade80', fontWeight: 'bold', fontSize: 15 }}>{vehicle}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80' }} />
          <div ref={phaseRef} style={{ color: '#ccc', fontSize: 12 }}>Pre-Launch</div>
        </div>
        <div ref={metRef} style={{ color: '#888', fontSize: 11, marginTop: 4 }}>MET 00:00:00:00</div>
      </div>

      {/* Top-right: Telemetry */}
      <div style={{
        position: 'absolute', top: 12, right: 12, zIndex: 100,
        background: 'rgba(0,0,0,0.75)', border: '1px solid #333',
        borderRadius: 6, padding: '8px 14px', fontFamily: "'JetBrains Mono', monospace",
        textAlign: 'right',
      }}>
        <div style={{ fontSize: 10, color: '#60a5fa', textTransform: 'uppercase' }}>Altitude</div>
        <div ref={altRef} style={{ fontSize: 16, color: '#fff', marginBottom: 4 }}>0 km</div>
        <div style={{ fontSize: 10, color: '#f59e0b', textTransform: 'uppercase' }}>Velocity</div>
        <div ref={velRef} style={{ fontSize: 16, color: '#fff', marginBottom: 4 }}>0 m/s</div>
        <div style={{ fontSize: 10, color: '#a78bfa', textTransform: 'uppercase' }}>Distance to Moon</div>
        <div ref={moonDistRef} style={{ fontSize: 16, color: '#fff' }}>0 km</div>
      </div>

      {/* Bottom: Phase timeline */}
      <div style={{
        position: 'absolute', bottom: 12, left: 12, right: 12, zIndex: 100,
        background: 'rgba(0,0,0,0.75)', border: '1px solid #333',
        borderRadius: 6, padding: '8px 14px', fontFamily: "'JetBrains Mono', monospace",
      }}>
        {/* Phase labels */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 10 }}>
          {phases.map((phase) => {
            const phaseStart = new Date(phase.start).getTime();
            const phaseDur = new Date(phase.end).getTime() - phaseStart;
            const widthPct = (phaseDur / totalDuration) * 100;
            return (
              <div key={phase.id} style={{
                width: `${widthPct}%`, textAlign: 'center', color: '#888',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {phase.label}
              </div>
            );
          })}
        </div>
        {/* Progress bar */}
        <div style={{ height: 4, background: '#222', borderRadius: 2, position: 'relative' }}>
          <div ref={progressRef} style={{
            height: 4, borderRadius: 2, width: '0%',
            background: 'linear-gradient(90deg, #4ade80, #60a5fa, #f59e0b, #a78bfa)',
            transition: 'width 0.3s ease',
          }} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build to verify**

Run: `npm run build`
Expected: Build succeeds. Component isn't used yet but must compile.

- [ ] **Step 3: Commit**

```bash
git add src/components/islands/CesiumGlobe/MissionHUD.tsx
git commit -m "feat(globe): add MissionHUD telemetry overlay component"
```

---

### Task 5: Create useLunarMission hook

**Files:**
- Create: `src/components/islands/CesiumGlobe/useLunarMission.ts`

This is the core hook. It must be implemented by an engineer who reads `useSatellites.ts` and `useMissiles.ts` as pattern references.

- [ ] **Step 1: Create the hook**

Create `src/components/islands/CesiumGlobe/useLunarMission.ts`:

```typescript
import { useEffect, useRef, type MutableRefObject } from 'react';
import {
  Cartesian3,
  Color,
  JulianDate,
  SampledPositionProperty,
  LagrangePolynomialApproximation,
  PolylineGlowMaterialProperty,
  NearFarScalar,
  CallbackProperty,
  type Viewer as CesiumViewer,
  type Entity,
} from 'cesium';
import {
  eciToEcef,
  getMoonPosition,
  computeTelemetry,
  EMPTY_TELEMETRY,
  type TelemetryState,
} from './mission-helpers';
import type { MissionTrajectory } from '../../../lib/schemas';
import { createSpacecraftIcon } from './cesium-icons';

interface UseLunarMissionResult {
  telemetryRef: MutableRefObject<TelemetryState>;
}

export function useLunarMission(
  viewer: CesiumViewer | null,
  trajectory: MissionTrajectory | null,
  simTimeRef: MutableRefObject<number>,
): UseLunarMissionResult {
  const telemetryRef = useRef<TelemetryState>(EMPTY_TELEMETRY);
  const entitiesRef = useRef<Entity[]>([]);
  const positionPropertyRef = useRef<SampledPositionProperty | null>(null);
  const rafRef = useRef<number>(0);
  const moonDetailLoadedRef = useRef(false);
  const moonEntityRef = useRef<Entity | null>(null);

  useEffect(() => {
    if (!viewer || !trajectory || trajectory.waypoints.length < 2) return;

    const launchJd = JulianDate.fromIso8601(trajectory.launchTime);
    const splashdownJd = JulianDate.fromIso8601(trajectory.splashdownTime);

    // ── Enable built-in Moon ──
    if (viewer.scene.moon) {
      viewer.scene.moon.show = true;
    }

    // ── Build SampledPositionProperty from ECI waypoints ──
    const positionProperty = new SampledPositionProperty();
    positionProperty.setInterpolationOptions({
      interpolationDegree: 5,
      interpolationAlgorithm: LagrangePolynomialApproximation,
    });

    // Also build a sampled velocity for telemetry
    const velocities: { t: JulianDate; v: number }[] = [];

    for (const wp of trajectory.waypoints) {
      const jd = JulianDate.fromIso8601(wp.t);
      const ecef = eciToEcef(wp, jd);
      positionProperty.addSample(jd, ecef);
      velocities.push({
        t: jd,
        v: Math.sqrt(wp.vx ** 2 + wp.vy ** 2 + wp.vz ** 2),
      });
    }
    positionPropertyRef.current = positionProperty;

    // ── Trajectory polyline (full arc) ──
    const allPositions: Cartesian3[] = [];
    const totalWaypoints = trajectory.waypoints.length;
    // Sample at uniform intervals for smooth polyline
    const firstJd = JulianDate.fromIso8601(trajectory.waypoints[0].t);
    const lastJd = JulianDate.fromIso8601(trajectory.waypoints[totalWaypoints - 1].t);
    const totalSeconds = JulianDate.secondsDifference(lastJd, firstJd);
    const POLYLINE_SAMPLES = 1000;
    const stepSec = totalSeconds / POLYLINE_SAMPLES;

    for (let i = 0; i <= POLYLINE_SAMPLES; i++) {
      const sampleJd = JulianDate.addSeconds(firstJd, i * stepSec, new JulianDate());
      const pos = positionProperty.getValue(sampleJd);
      if (pos) allPositions.push(Cartesian3.clone(pos));
    }

    const trajectoryEntity = viewer.entities.add({
      polyline: {
        positions: allPositions,
        width: 2,
        material: new PolylineGlowMaterialProperty({
          glowPower: 0.3,
          color: Color.fromCssColorString('#60a5fa').withAlpha(0.6),
        }),
      },
    });
    entitiesRef.current.push(trajectoryEntity);

    // ── Spacecraft entity ──
    const spacecraftEntity = viewer.entities.add({
      position: new CallbackProperty(() => {
        const simMs = simTimeRef.current;
        const currentJd = JulianDate.fromDate(new Date(simMs));
        return positionProperty.getValue(currentJd) ?? Cartesian3.ZERO;
      }, false) as any,
      billboard: {
        image: createSpacecraftIcon(),
        scale: 0.8,
        scaleByDistance: new NearFarScalar(1e6, 1.0, 1e8, 0.3),
        color: Color.WHITE,
      },
      label: {
        text: 'ORION',
        font: '12px JetBrains Mono',
        fillColor: Color.fromCssColorString('#4ade80'),
        outlineColor: Color.BLACK,
        outlineWidth: 2,
        pixelOffset: new Cartesian3(0, -24, 0) as any,
        scaleByDistance: new NearFarScalar(1e6, 1.0, 1e8, 0.3),
      },
    });
    entitiesRef.current.push(spacecraftEntity);

    // ── Per-frame telemetry update ──
    const tick = () => {
      const simMs = simTimeRef.current;
      const currentJd = JulianDate.fromDate(new Date(simMs));
      const pos = positionProperty.getValue(currentJd);
      if (!pos) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      // Interpolate velocity
      let currentV = 0;
      for (let i = 0; i < velocities.length - 1; i++) {
        if (
          JulianDate.greaterThanOrEquals(currentJd, velocities[i].t) &&
          JulianDate.lessThan(currentJd, velocities[i + 1].t)
        ) {
          const frac = JulianDate.secondsDifference(currentJd, velocities[i].t) /
                       JulianDate.secondsDifference(velocities[i + 1].t, velocities[i].t);
          currentV = velocities[i].v * (1 - frac) + velocities[i + 1].v * frac;
          break;
        }
      }

      telemetryRef.current = computeTelemetry(
        pos, currentV, launchJd, currentJd, splashdownJd, trajectory.phases,
      );

      // ── Moon LOD check ──
      const moonPos = getMoonPosition(currentJd);
      const camPos = viewer.camera.positionWC;
      const camToMoonDist = Cartesian3.distance(camPos, moonPos) / 1000; // km

      if (camToMoonDist < 50000 && !moonDetailLoadedRef.current) {
        // Load detailed Moon — for now just increase Moon visibility
        // Full LROC integration would add SingleTileImageryProvider here
        moonDetailLoadedRef.current = true;
        console.log('Moon LOD: switching to high detail');
      } else if (camToMoonDist > 60000 && moonDetailLoadedRef.current) {
        moonDetailLoadedRef.current = false;
        console.log('Moon LOD: switching to low detail');
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    // ── Cleanup ──
    return () => {
      cancelAnimationFrame(rafRef.current);
      for (const entity of entitiesRef.current) {
        viewer.entities.remove(entity);
      }
      entitiesRef.current = [];
      if (moonEntityRef.current) {
        viewer.entities.remove(moonEntityRef.current);
        moonEntityRef.current = null;
      }
      positionPropertyRef.current = null;
    };
  }, [viewer, trajectory]);

  return { telemetryRef };
}
```

- [ ] **Step 2: Add spacecraft icon to cesium-icons.ts**

Read `src/components/islands/CesiumGlobe/cesium-icons.ts` and add a `createSpacecraftIcon` export. Append to the file:

```typescript
export function createSpacecraftIcon(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <defs><filter id="g"><feGaussianBlur stdDeviation="0.5"/></filter></defs>
    <path d="M16 2 L20 12 L20 24 L24 28 L24 30 L20 27 L20 30 L16 28 L12 30 L12 27 L8 30 L8 28 L12 24 L12 12 Z"
      fill="#e0e0e0" stroke="#4ade80" stroke-width="0.5" filter="url(#g)"/>
    <circle cx="16" cy="10" r="2" fill="#60a5fa" opacity="0.8"/>
  </svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}
```

- [ ] **Step 3: Build to verify**

Run: `npm run build`
Expected: Build succeeds. Hook isn't wired yet but must compile.

- [ ] **Step 4: Commit**

```bash
git add src/components/islands/CesiumGlobe/useLunarMission.ts src/components/islands/CesiumGlobe/cesium-icons.ts
git commit -m "feat(globe): add useLunarMission hook for trajectory visualization"
```

---

### Task 6: Wire everything into CesiumGlobe and globe.astro

**Files:**
- Modify: `src/components/islands/CesiumGlobe/CesiumGlobe.tsx:1-55` (imports + Props)
- Modify: `src/components/islands/CesiumGlobe/CesiumGlobe.tsx:~404-430` (hooks section)
- Modify: `src/components/islands/CesiumGlobe/CesiumGlobe.tsx:~515-525` (JSX after CesiumHud)
- Modify: `src/pages/[tracker]/globe.astro`

- [ ] **Step 1: Add imports and prop to CesiumGlobe.tsx**

In `src/components/islands/CesiumGlobe/CesiumGlobe.tsx`, add these imports after the existing imports (around line 41):

```typescript
import { useLunarMission } from './useLunarMission';
import MissionHUD from './MissionHUD';
import type { MissionTrajectory } from '../../../lib/schemas';
```

Add `missionTrajectory` to the Props interface (around line 43-55). After `clocks?`:

```typescript
  missionTrajectory?: MissionTrajectory | null;
```

- [ ] **Step 2: Initialize the hook in the hooks section**

In `CesiumGlobe.tsx`, after the `useCinematicMode` hook call (around line 435-445), add:

```typescript
  // ── Lunar mission trajectory ──
  const { telemetryRef } = useLunarMission(cesiumViewer, missionTrajectory ?? null, simTimeRef);
```

- [ ] **Step 3: Render MissionHUD in the JSX**

In `CesiumGlobe.tsx`, after the `CesiumHud` component (around line 522), add:

```tsx
      {/* Mission telemetry HUD */}
      {missionTrajectory && (
        <MissionHUD
          telemetryRef={telemetryRef}
          vehicle={missionTrajectory.vehicle}
          phases={missionTrajectory.phases}
        />
      )}
```

- [ ] **Step 4: Update globe.astro to load trajectory data**

In `src/pages/[tracker]/globe.astro`, add after line 26 (`const events = ...`):

```typescript
// Load mission trajectory if present
let missionTrajectory = null;
try {
  const allTrajectories = import.meta.glob('../../trackers/*/data/mission-trajectory.json', { eager: true });
  const trajKey = Object.keys(allTrajectories).find(k => k.includes(`/${config.slug}/`));
  if (trajKey) missionTrajectory = (allTrajectories[trajKey] as any).default;
} catch {}
```

And add the prop to the `<CesiumGlobe>` component (after `clocks={...}`):

```
    missionTrajectory={missionTrajectory}
```

- [ ] **Step 5: Build and verify**

Run: `npm run build`
Expected: Build succeeds. The Artemis 2 globe page (`/artemis-2/globe/`) now loads trajectory data and passes it to CesiumGlobe.

- [ ] **Step 6: Commit**

```bash
git add src/components/islands/CesiumGlobe/CesiumGlobe.tsx src/pages/\\[tracker\\]/globe.astro
git commit -m "feat(globe): wire lunar mission hook and HUD into globe page"
```

---

### Task 7: Build validation and dev testing

- [ ] **Step 1: Full production build**

Run: `npm run build`
Expected: Build succeeds with all pages including `/artemis-2/globe/`.

- [ ] **Step 2: Dev server smoke test**

Run: `npm run dev`
Then manually navigate to `http://localhost:4321/artemis-2/globe/` and verify:
- Globe loads without errors
- Trajectory polyline is visible (blue glow arc from Earth toward Moon region)
- Spacecraft icon "ORION" is visible along the trajectory
- Mission HUD panels appear (top-left: ARTEMIS II + phase, top-right: altitude/velocity/distance, bottom: phase timeline)
- Telemetry values update as the simulation clock runs

- [ ] **Step 3: Verify other globe pages unaffected**

Navigate to `http://localhost:4321/iran-conflict/globe/` and verify:
- Globe loads normally with map points and missiles
- No MissionHUD is shown (no trajectory data for this tracker)
- No errors in console

- [ ] **Step 4: Commit any fixes**

If any fixes were needed during testing:
```bash
git add -u
git commit -m "fix(globe): address issues found during lunar mission smoke test"
```
