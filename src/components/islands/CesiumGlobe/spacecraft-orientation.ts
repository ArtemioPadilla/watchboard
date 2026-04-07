import {
  Cartesian3,
  Quaternion,
  Matrix3,
  type SampledPositionProperty,
  JulianDate,
} from 'cesium';
import type { MissionPhase } from '../../../lib/schemas';

// Scratch variables — reused to avoid GC pressure in per-frame calls
const scratchVelocity = new Cartesian3();
const scratchNextPos = new Cartesian3();
const scratchCurrentPos = new Cartesian3();
const scratchQuaternion = new Quaternion();

// Time step for finite-difference velocity estimation (seconds)
const VELOCITY_DT = 1.0;

// Phase IDs that require retrograde attitude (180° yaw from prograde)
const RETROGRADE_PHASES = new Set(['tli', 'reentry']);

/**
 * Compute the orientation quaternion for the spacecraft at the given time.
 *
 * Layer 1: Velocity-vector alignment (prograde — nose forward along trajectory)
 * Layer 2: Phase-based override (retrograde for burns and re-entry)
 */
export function computeSpacecraftOrientation(
  positionProperty: SampledPositionProperty,
  currentJd: JulianDate,
  phases: MissionPhase[],
): Quaternion | undefined {
  // Sample position at t and t+dt to get velocity direction
  const pos = positionProperty.getValue(currentJd, scratchCurrentPos);
  if (!pos) return undefined;

  const nextJd = JulianDate.addSeconds(currentJd, VELOCITY_DT, new JulianDate());
  const nextPos = positionProperty.getValue(nextJd, scratchNextPos);
  if (!nextPos) return undefined;

  // Velocity vector (unnormalized direction of travel)
  Cartesian3.subtract(nextPos, pos, scratchVelocity);
  const speed = Cartesian3.magnitude(scratchVelocity);
  if (speed < 0.001) return undefined; // stationary — no meaningful orientation

  // Normalize velocity to get forward direction
  Cartesian3.normalize(scratchVelocity, scratchVelocity);

  // Build quaternion from velocity direction
  const orientationQuat = quaternionFromDirection(scratchVelocity, pos);

  // Layer 2: Phase-based attitude override
  const currentPhase = findCurrentPhase(currentJd, phases);
  if (currentPhase && RETROGRADE_PHASES.has(currentPhase.id)) {
    // Rotate 180° around the local "up" axis (radial direction from Earth center)
    const up = Cartesian3.normalize(pos, new Cartesian3());
    const flipQuat = Quaternion.fromAxisAngle(up, Math.PI, scratchQuaternion);
    return Quaternion.multiply(flipQuat, orientationQuat, new Quaternion());
  }

  return orientationQuat;
}

/**
 * Build a quaternion that orients the model's +X axis along `direction`,
 * with +Z pointing roughly away from Earth center (radial up).
 */
function quaternionFromDirection(direction: Cartesian3, position: Cartesian3): Quaternion {
  // Radial "up" from Earth center
  const up = Cartesian3.normalize(position, new Cartesian3());

  // Right = direction × up (ensures orthogonality)
  const right = Cartesian3.cross(direction, up, new Cartesian3());
  if (Cartesian3.magnitude(right) < 1e-10) {
    // direction is parallel to up — use arbitrary perpendicular
    const arbitrary = Math.abs(Cartesian3.dot(direction, Cartesian3.UNIT_X)) < 0.9
      ? Cartesian3.UNIT_X : Cartesian3.UNIT_Y;
    Cartesian3.cross(direction, arbitrary, right);
  }
  Cartesian3.normalize(right, right);

  // Recompute up = right × direction (orthonormal)
  const correctedUp = Cartesian3.cross(right, direction, new Cartesian3());
  Cartesian3.normalize(correctedUp, correctedUp);

  // Build rotation matrix: columns = [direction, right, correctedUp]
  // CesiumJS glTF convention: model faces +X forward, +Z up
  const rotMatrix = new Matrix3();
  // Column 0: forward (+X of model) = direction
  Matrix3.setColumn(rotMatrix, 0, direction, rotMatrix);
  // Column 1: right (+Y of model) = right
  Matrix3.setColumn(rotMatrix, 1, right, rotMatrix);
  // Column 2: up (+Z of model) = correctedUp
  Matrix3.setColumn(rotMatrix, 2, correctedUp, rotMatrix);

  return Quaternion.fromRotationMatrix(rotMatrix, new Quaternion());
}

/**
 * Find the active mission phase at the given time.
 */
function findCurrentPhase(currentJd: JulianDate, phases: MissionPhase[]): MissionPhase | null {
  for (const phase of phases) {
    const phaseStart = JulianDate.fromIso8601(phase.start);
    const phaseEnd = JulianDate.fromIso8601(phase.end);
    if (
      JulianDate.greaterThanOrEquals(currentJd, phaseStart) &&
      JulianDate.lessThan(currentJd, phaseEnd)
    ) {
      return phase;
    }
  }
  return null;
}
