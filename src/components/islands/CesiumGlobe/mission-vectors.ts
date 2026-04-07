import { Cartesian3, JulianDate, Simon1994PlanetaryPositions } from 'cesium';

// Gravitational parameters (m³/s²)
export const GM_EARTH = 3.986004418e14;
export const GM_MOON = 4.9048695e12;

// Threshold below which thrust is considered numerical noise (m/s²)
const THRUST_THRESHOLD = 0.01;

export interface VectorSet {
  /** Velocity direction and magnitude in m/s (J2000 frame) */
  velocity: Cartesian3;
  /** Gravitational acceleration toward Earth center in m/s² */
  gravityEarth: Cartesian3;
  /** Gravitational acceleration toward Moon in m/s² */
  gravityMoon: Cartesian3;
  /** Thrust acceleration in m/s² (zero if below noise threshold) */
  thrust: Cartesian3;
}

// Scratch vectors for GC-free computation
const scratchGravDir = new Cartesian3();
const scratchMoonDir = new Cartesian3();
const scratchAccel = new Cartesian3();
const scratchGravTotal = new Cartesian3();

/**
 * Compute gravitational acceleration from a body at `bodyPos` with
 * gravitational parameter `gm`, acting on a spacecraft at `scPos`.
 * All positions in meters. Returns acceleration in m/s².
 */
export function computeGravity(
  scPos: Cartesian3,
  bodyPos: Cartesian3,
  gm: number,
  result: Cartesian3,
): Cartesian3 {
  // Direction: body - spacecraft
  Cartesian3.subtract(bodyPos, scPos, scratchGravDir);
  const dist = Cartesian3.magnitude(scratchGravDir);
  if (dist < 1) {
    return Cartesian3.clone(Cartesian3.ZERO, result);
  }
  // Normalize direction
  Cartesian3.normalize(scratchGravDir, scratchGravDir);
  // Magnitude = GM / r²
  const mag = gm / (dist * dist);
  return Cartesian3.multiplyByScalar(scratchGravDir, mag, result);
}

/**
 * Compute all physics vectors for the spacecraft at the given time.
 *
 * @param scPos Spacecraft position in meters (J2000-as-ECEF frame)
 * @param velKmS Velocity components in km/s (J2000 frame)
 * @param prevVelKmS Velocity at t - dt (for thrust derivation)
 * @param nextVelKmS Velocity at t + dt (for thrust derivation)
 * @param dt Time step in seconds between prev/next velocity samples
 * @param currentJd Julian date for Moon position computation
 */
export function computeVectorSet(
  scPos: Cartesian3,
  velKmS: { x: number; y: number; z: number },
  prevVelKmS: { x: number; y: number; z: number } | null,
  nextVelKmS: { x: number; y: number; z: number } | null,
  dt: number,
  currentJd: JulianDate,
): VectorSet {
  // Velocity in m/s
  const velocity = new Cartesian3(velKmS.x * 1000, velKmS.y * 1000, velKmS.z * 1000);

  // Earth gravity: Earth is at origin in our frame
  const gravityEarth = new Cartesian3();
  computeGravity(scPos, Cartesian3.ZERO, GM_EARTH, gravityEarth);

  // Moon gravity: Moon position in J2000 (meters)
  const moonEci = Simon1994PlanetaryPositions.computeMoonPositionInEarthInertialFrame(currentJd);
  const gravityMoon = new Cartesian3();
  computeGravity(scPos, moonEci, GM_MOON, gravityMoon);

  // Thrust = actual_accel - gravity_total (only if we have prev/next velocity)
  let thrust = Cartesian3.ZERO;
  if (prevVelKmS && nextVelKmS && dt > 0) {
    // Central difference: dv/dt = (v_next - v_prev) / (2*dt) in m/s²
    const accelX = ((nextVelKmS.x - prevVelKmS.x) * 1000) / (2 * dt);
    const accelY = ((nextVelKmS.y - prevVelKmS.y) * 1000) / (2 * dt);
    const accelZ = ((nextVelKmS.z - prevVelKmS.z) * 1000) / (2 * dt);
    Cartesian3.fromElements(accelX, accelY, accelZ, scratchAccel);

    // Subtract gravity to isolate thrust
    Cartesian3.add(gravityEarth, gravityMoon, scratchGravTotal);
    const thrustVec = Cartesian3.subtract(scratchAccel, scratchGravTotal, new Cartesian3());

    if (Cartesian3.magnitude(thrustVec) > THRUST_THRESHOLD) {
      thrust = thrustVec;
    }
  }

  return { velocity, gravityEarth, gravityMoon, thrust };
}

/**
 * Interpolate velocity components from waypoint data at a given time.
 * Returns {x, y, z} in km/s, or null if outside range.
 */
export function interpolateVelocity(
  waypoints: { t: string; vx: number; vy: number; vz: number }[],
  currentJd: JulianDate,
): { x: number; y: number; z: number } | null {
  for (let i = 0; i < waypoints.length - 1; i++) {
    const t0 = JulianDate.fromIso8601(waypoints[i].t);
    const t1 = JulianDate.fromIso8601(waypoints[i + 1].t);
    if (
      JulianDate.greaterThanOrEquals(currentJd, t0) &&
      JulianDate.lessThan(currentJd, t1)
    ) {
      const dur = JulianDate.secondsDifference(t1, t0);
      if (dur <= 0) return null;
      const frac = JulianDate.secondsDifference(currentJd, t0) / dur;
      const wp0 = waypoints[i];
      const wp1 = waypoints[i + 1];
      return {
        x: wp0.vx + frac * (wp1.vx - wp0.vx),
        y: wp0.vy + frac * (wp1.vy - wp0.vy),
        z: wp0.vz + frac * (wp1.vz - wp0.vz),
      };
    }
  }
  return null;
}

/**
 * Get velocity at t ± offset seconds for thrust central difference.
 */
export function interpolateVelocityAtOffset(
  waypoints: { t: string; vx: number; vy: number; vz: number }[],
  currentJd: JulianDate,
  offsetSeconds: number,
): { x: number; y: number; z: number } | null {
  const offsetJd = JulianDate.addSeconds(currentJd, offsetSeconds, new JulianDate());
  return interpolateVelocity(waypoints, offsetJd);
}
