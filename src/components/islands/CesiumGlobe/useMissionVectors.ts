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
  /** Scale multiplier to convert physical units to visual arrow length.
   *  Velocity is in m/s, accelerations in m/s². Different scales needed. */
  unitScale: number;
}

const VECTOR_CONFIGS: VectorConfig[] = [
  { key: 'velocity', color: '#4ade80', width: 8, unitScale: 0.5 },       // 1 km/s → 500m visual
  { key: 'gravityEarth', color: '#f59e0b', width: 6, unitScale: 50000 }, // accel is tiny, scale up
  { key: 'gravityMoon', color: '#a78bfa', width: 6, unitScale: 50000 },
  { key: 'thrust', color: '#ef4444', width: 10, unitScale: 50000 },
];

// Central difference dt for thrust computation (seconds)
const THRUST_DT = 30;

export function useMissionVectors(
  viewer: CesiumViewer | null,
  trajectory: MissionTrajectory | null,
  simTimeRef: MutableRefObject<number>,
  toggles: VectorToggles,
) {
  const entitiesRef = useRef<Map<string, Entity>>(new Map());
  const vectorsRef = useRef<VectorSet | null>(null);

  // Create/destroy entities when toggles change
  useEffect(() => {
    if (!viewer || !trajectory) return;

    const existing = entitiesRef.current;

    for (const config of VECTOR_CONFIGS) {
      const isOn = toggles[config.key];
      const hasEntity = existing.has(config.key);

      if (isOn && !hasEntity) {
        // Create arrow entity
        const entity = viewer.entities.add({
          polyline: {
            positions: new CallbackProperty(() => {
              const vecs = vectorsRef.current;
              if (!vecs) return [Cartesian3.ZERO, Cartesian3.ZERO];

              const simMs = simTimeRef.current;
              if (!simMs) return [Cartesian3.ZERO, Cartesian3.ZERO];

              const launchMs = new Date(trajectory.launchTime).getTime();
              const splashMs = new Date(trajectory.splashdownTime).getTime();
              if (simMs < launchMs || simMs > splashMs) return [Cartesian3.ZERO, Cartesian3.ZERO];

              // Find spacecraft position from waypoints
              let scPos: Cartesian3 | null = null;
              for (let i = 0; i < trajectory.waypoints.length - 1; i++) {
                const t0 = new Date(trajectory.waypoints[i].t).getTime();
                const t1 = new Date(trajectory.waypoints[i + 1].t).getTime();
                if (simMs >= t0 && simMs < t1) {
                  const frac = (simMs - t0) / (t1 - t0);
                  const wp0 = trajectory.waypoints[i];
                  const wp1 = trajectory.waypoints[i + 1];
                  scPos = new Cartesian3(
                    (wp0.x + frac * (wp1.x - wp0.x)) * 1000,
                    (wp0.y + frac * (wp1.y - wp0.y)) * 1000,
                    (wp0.z + frac * (wp1.z - wp0.z)) * 1000,
                  );
                  break;
                }
              }
              if (!scPos) return [Cartesian3.ZERO, Cartesian3.ZERO];

              const vec = vecs[config.key];
              const mag = Cartesian3.magnitude(vec);
              if (mag < 1e-10) return [scPos, scPos]; // zero vector — collapse arrow

              // Scale arrow length: physical magnitude × unitScale × camera-adaptive scale
              const cameraScale = computeAdaptiveScale(viewer, scPos);
              const arrowLength = mag * config.unitScale * (cameraScale / 50000);

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
        // Remove arrow entity
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

  // Per-frame vector computation
  useEffect(() => {
    if (!viewer || !trajectory || trajectory.waypoints.length < 3) return;

    let rafId = 0;
    const tick = () => {
      const simMs = simTimeRef.current;
      if (simMs) {
        const currentJd = JulianDate.fromDate(new Date(simMs));

        // Interpolate current velocity
        const vel = interpolateVelocity(trajectory.waypoints, currentJd);
        if (vel) {
          // Get prev/next velocity for thrust derivation
          const prevVel = interpolateVelocityAtOffset(trajectory.waypoints, currentJd, -THRUST_DT);
          const nextVel = interpolateVelocityAtOffset(trajectory.waypoints, currentJd, THRUST_DT);

          // Spacecraft position (meters) — find from waypoints
          let scPos = Cartesian3.ZERO;
          for (let i = 0; i < trajectory.waypoints.length - 1; i++) {
            const t0 = new Date(trajectory.waypoints[i].t).getTime();
            const t1 = new Date(trajectory.waypoints[i + 1].t).getTime();
            if (simMs >= t0 && simMs < t1) {
              const frac = (simMs - t0) / (t1 - t0);
              const wp0 = trajectory.waypoints[i];
              const wp1 = trajectory.waypoints[i + 1];
              scPos = new Cartesian3(
                (wp0.x + frac * (wp1.x - wp0.x)) * 1000,
                (wp0.y + frac * (wp1.y - wp0.y)) * 1000,
                (wp0.z + frac * (wp1.z - wp0.z)) * 1000,
              );
              break;
            }
          }

          vectorsRef.current = computeVectorSet(
            scPos, vel, prevVel, nextVel, THRUST_DT, currentJd,
          );
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(rafId);
  }, [viewer, trajectory]);
}
