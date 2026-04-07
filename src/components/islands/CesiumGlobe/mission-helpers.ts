import {
  Cartesian3,
  JulianDate,
  Matrix3,
  Transforms,
  Simon1994PlanetaryPositions,
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
 */
export function eciToEcef(
  eciKm: { x: number; y: number; z: number },
  julianDate: JulianDate,
): Cartesian3 {
  const rotationMatrix = Transforms.computeIcrfToFixedMatrix(julianDate, scratchMatrix);
  if (!rotationMatrix) {
    return new Cartesian3(eciKm.x * 1000, eciKm.y * 1000, eciKm.z * 1000);
  }
  Cartesian3.fromElements(eciKm.x * 1000, eciKm.y * 1000, eciKm.z * 1000, scratchEci);
  Matrix3.multiplyByVector(rotationMatrix, scratchEci, scratchResult);
  return Cartesian3.clone(scratchResult);
}

// ── Moon position ──

const scratchMoonPos = new Cartesian3();

/**
 * Get Moon's ECEF position at a given time (meters).
 */
export function getMoonPosition(julianDate: JulianDate): Cartesian3 {
  const result = Simon1994PlanetaryPositions.computeMoonPositionInEarthInertialFrame(julianDate);
  const rotationMatrix = Transforms.computeIcrfToFixedMatrix(julianDate, scratchMatrix);
  if (rotationMatrix) {
    Matrix3.multiplyByVector(rotationMatrix, result, scratchMoonPos);
    return Cartesian3.clone(scratchMoonPos);
  }
  return Cartesian3.clone(result);
}

// ── Telemetry computation ──

export function computeTelemetry(
  positionEcef: Cartesian3,
  velocityKmS: number,
  launchJd: JulianDate,
  currentJd: JulianDate,
  splashdownJd: JulianDate,
  phases: MissionPhase[],
): TelemetryState {
  const distFromCenterM = Cartesian3.magnitude(positionEcef);
  const altitudeKm = (distFromCenterM / 1000) - EARTH_RADIUS_KM;

  // Use Moon's J2000 inertial position (same frame as spacecraft waypoints).
  // getMoonPosition() converts to ECEF which doesn't match our J2000 positions.
  const moonPosJ2000 = Simon1994PlanetaryPositions.computeMoonPositionInEarthInertialFrame(currentJd);
  const distToMoonM = Cartesian3.distance(positionEcef, moonPosJ2000);
  const distToMoonKm = distToMoonM / 1000;

  const metSeconds = JulianDate.secondsDifference(currentJd, launchJd);

  const totalDuration = JulianDate.secondsDifference(splashdownJd, launchJd);
  const overallProgress = Math.max(0, Math.min(1, metSeconds / totalDuration));

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

  return { altitudeKm, velocityKmS, distToMoonKm, metSeconds, currentPhase, phaseProgress, overallProgress };
}

// ── Formatters ──

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

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 100) return `${km.toFixed(1)} km`;
  return `${Math.round(km).toLocaleString('en-US')} km`;
}

export function formatVelocity(kmS: number): string {
  if (kmS < 1) return `${Math.round(kmS * 1000)} m/s`;
  return `${kmS.toFixed(2)} km/s`;
}
