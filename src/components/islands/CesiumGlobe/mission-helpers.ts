import {
  Cartesian3,
  JulianDate,
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

// ── ECI↔ECEF frame conversion ──

// Earth's rotation rate (rad/s) — WGS84
const EARTH_OMEGA = 7.2921150e-5;

/**
 * Compute Greenwich Mean Sidereal Time (GMST) in radians.
 * Uses the simplified IAU 2006 formula based on Julian UT1 date.
 * Accurate to ~0.1° over a few decades — sufficient for visualization.
 */
export function computeGMST(jd: JulianDate): number {
  // Julian centuries since J2000.0 (2000-01-12 12:00 TT)
  const T = (jd.dayNumber - 2451545.0 + jd.secondsOfDay / 86400.0) / 36525.0;
  // GMST in seconds of time (IAU 2006 simplified)
  const gmstSec =
    67310.54841 +
    (876600.0 * 3600 + 8640184.812866) * T +
    0.093104 * T * T -
    6.2e-6 * T * T * T;
  // Convert seconds of time → radians (360° = 86400 seconds of time)
  const gmstRad = ((gmstSec % 86400) / 86400) * 2 * Math.PI;
  return gmstRad;
}

/**
 * Rotate a J2000 ECI position to ECEF given GMST angle.
 * R_z(-gmst): x_ecef = x*cos + y*sin, y_ecef = -x*sin + y*cos, z unchanged.
 */
export function eciToEcef(x: number, y: number, z: number, gmst: number): [number, number, number] {
  const c = Math.cos(gmst);
  const s = Math.sin(gmst);
  return [
    x * c + y * s,
    -x * s + y * c,
    z,
  ];
}

/**
 * Blend an ECI position toward ECEF based on altitude.
 * Returns ECEF-frame Cartesian3 (meters).
 *
 * Above `upperKm` → pure ECI (treated as ECEF, matching the deep-space approach).
 * Below `lowerKm` → full ECEF conversion.
 * Between them → smooth cosine blend to avoid visual discontinuity.
 */
export function blendEciToEcef(
  xEci: number, yEci: number, zEci: number,
  jd: JulianDate,
  upperKm = 2000,
  lowerKm = 500,
): Cartesian3 {
  const altKm = (Math.sqrt(xEci * xEci + yEci * yEci + zEci * zEci) / 1000) - EARTH_RADIUS_KM;

  if (altKm >= upperKm) {
    // Deep space — keep ECI-as-ECEF (no rotation)
    return new Cartesian3(xEci, yEci, zEci);
  }

  const gmst = computeGMST(jd);
  const [xEcef, yEcef, zEcef] = eciToEcef(xEci, yEci, zEci, gmst);

  if (altKm <= lowerKm) {
    // Low altitude — full ECEF
    return new Cartesian3(xEcef, yEcef, zEcef);
  }

  // Transition zone — smooth cosine blend
  const t = (altKm - lowerKm) / (upperKm - lowerKm); // 0 at lower, 1 at upper
  const blend = 0.5 * (1 - Math.cos(Math.PI * t)); // 0→1 smooth (0=ECEF, 1=ECI)
  return new Cartesian3(
    xEcef + blend * (xEci - xEcef),
    yEcef + blend * (yEci - yEcef),
    zEcef + blend * (zEci - zEcef),
  );
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
