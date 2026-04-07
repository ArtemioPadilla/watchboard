import { useEffect, useRef, type MutableRefObject } from 'react';
import {
  Cartesian3,
  Color,
  JulianDate,
  CallbackProperty,
  PolylineArrowMaterialProperty,
  type Viewer as CesiumViewer,
  type Entity,
} from 'cesium';
import type { MissionTrajectory } from '../../../lib/schemas';
import {
  computeVectorSet,
  interpolateVelocity,
  interpolateVelocityAtOffset,
  type VectorSet,
} from './mission-vectors';
import { computeAdaptiveScale } from './spacecraft-scale';

export interface VectorToggles {
  velocity: boolean;
  gravityEarth: boolean;
  gravityMoon: boolean;
  thrust: boolean;
}

export const DEFAULT_VECTOR_TOGGLES: VectorToggles = {
  velocity: false,
  gravityEarth: false,
  gravityMoon: false,
  thrust: false,
};

interface VectorConfig {
  key: keyof VectorToggles;
  color: string;
  width: number;
  /** Arrow length as multiple of spacecraft model scale */
  lengthMultiplier: number;
  /** Max expected magnitude for normalization (velocity in m/s, accel in m/s²) */
  maxMagnitude: number;
}

// Arrow length = (magnitude / maxMagnitude) * shipScale * lengthMultiplier
// This ties arrows to the ship's visual size at any zoom level.
const VECTOR_CONFIGS: VectorConfig[] = [
  { key: 'velocity', color: '#4ade80', width: 8, lengthMultiplier: 10, maxMagnitude: 11000 },    // max ~11 km/s during TLI
  { key: 'gravityEarth', color: '#f59e0b', width: 6, lengthMultiplier: 8, maxMagnitude: 10 },     // max ~9.8 m/s² at surface
  { key: 'gravityMoon', color: '#a78bfa', width: 6, lengthMultiplier: 8, maxMagnitude: 1.6 },     // max ~1.6 m/s² at Moon surface
  { key: 'thrust', color: '#ef4444', width: 10, lengthMultiplier: 12, maxMagnitude: 10 },         // engine thrust
];

const THRUST_DT = 30;

/**
 * Mission vector overlays — reads spacecraft position from useLunarMission's
 * positionRef (same frame, same tick) so arrows track the ship exactly.
 */
export function useMissionVectors(
  viewer: CesiumViewer | null,
  trajectory: MissionTrajectory | null,
  simTimeRef: MutableRefObject<number>,
  positionRef: MutableRefObject<Cartesian3 | null>,
  toggles: VectorToggles,
) {
  const entitiesRef = useRef<Map<string, Entity>>(new Map());
  const vectorsRef = useRef<VectorSet | null>(null);

  // Pre-parse waypoint timestamps once
  const waypointMsRef = useRef<number[] | null>(null);
  useEffect(() => {
    if (!trajectory) { waypointMsRef.current = null; return; }
    waypointMsRef.current = trajectory.waypoints.map(wp => new Date(wp.t).getTime());
  }, [trajectory]);

  // Per-frame vector computation — uses requestAnimationFrame but reads
  // positionRef from useLunarMission (written in the same frame)
  useEffect(() => {
    if (!viewer || !trajectory || trajectory.waypoints.length < 3) return;

    const wps = trajectory.waypoints;
    let rafId = 0;

    const tick = () => {
      const simMs = simTimeRef.current;
      const wpMs = waypointMsRef.current;
      const scPos = positionRef.current;

      if (simMs && wpMs && scPos) {
        // Find current waypoint bracket for velocity interpolation
        for (let i = 0; i < wps.length - 1; i++) {
          if (simMs >= wpMs[i] && simMs < wpMs[i + 1]) {
            const frac = (simMs - wpMs[i]) / (wpMs[i + 1] - wpMs[i]);
            const wp0 = wps[i];
            const wp1 = wps[i + 1];

            const vel = {
              x: wp0.vx + frac * (wp1.vx - wp0.vx),
              y: wp0.vy + frac * (wp1.vy - wp0.vy),
              z: wp0.vz + frac * (wp1.vz - wp0.vz),
            };

            const currentJd = JulianDate.fromDate(new Date(simMs));
            const prevVel = interpolateVelocityAtOffset(wps, currentJd, -THRUST_DT);
            const nextVel = interpolateVelocityAtOffset(wps, currentJd, THRUST_DT);

            vectorsRef.current = computeVectorSet(
              scPos, vel, prevVel, nextVel, THRUST_DT, currentJd,
            );
            break;
          }
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(rafId);
  }, [viewer, trajectory]);

  // Create/destroy arrow entities when toggles change
  useEffect(() => {
    if (!viewer || !trajectory) return;

    const existing = entitiesRef.current;

    for (const config of VECTOR_CONFIGS) {
      const isOn = toggles[config.key];
      const hasEntity = existing.has(config.key);

      if (isOn && !hasEntity) {
        const entity = viewer.entities.add({
          polyline: {
            positions: new CallbackProperty(() => {
              const vecs = vectorsRef.current;
              const scPos = positionRef.current;
              if (!vecs || !scPos) return [Cartesian3.ZERO, Cartesian3.ZERO];

              const vec = vecs[config.key];
              const mag = Cartesian3.magnitude(vec);
              if (mag < 1e-10) return [scPos, scPos];

              // Arrow length tied to spacecraft model scale
              const shipScale = computeAdaptiveScale(viewer, scPos);
              const normalizedMag = Math.min(1, mag / config.maxMagnitude);
              const arrowLength = normalizedMag * shipScale * config.lengthMultiplier;

              const dir = Cartesian3.normalize(vec, new Cartesian3());
              const end = Cartesian3.add(
                scPos,
                Cartesian3.multiplyByScalar(dir, arrowLength, new Cartesian3()),
                new Cartesian3(),
              );
              return [scPos, end];
            }, false),
            width: config.width,
            material: new PolylineArrowMaterialProperty(
              Color.fromCssColorString(config.color),
            ),
          },
        });
        existing.set(config.key, entity);
      } else if (!isOn && hasEntity) {
        const entity = existing.get(config.key)!;
        viewer.entities.remove(entity);
        existing.delete(config.key);
      }
    }

    return () => {
      for (const [, entity] of existing) {
        try { viewer.entities.remove(entity); } catch {}
      }
      existing.clear();
    };
  }, [viewer, trajectory, toggles.velocity, toggles.gravityEarth, toggles.gravityMoon, toggles.thrust]);
}
