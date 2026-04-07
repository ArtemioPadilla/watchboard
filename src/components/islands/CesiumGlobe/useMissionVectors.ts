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
  /** Scale multiplier to convert physical units to visual arrow length */
  unitScale: number;
}

// unitScale converts physical magnitude to meters for base arrow length.
// Velocity is in m/s (~1000-10000), gravity in m/s² (~0.001-10).
// At Earth-Moon scale (384,000 km), arrows need to be ~50,000+ km to be visible.
// Arrow length = magnitude * unitScale * cameraScaleFactor
const VECTOR_CONFIGS: VectorConfig[] = [
  { key: 'velocity', color: '#4ade80', width: 8, unitScale: 5000 },          // 5 km/s → 25,000 km base
  { key: 'gravityEarth', color: '#f59e0b', width: 6, unitScale: 5e9 },       // 9.8 m/s² → 49,000 km base
  { key: 'gravityMoon', color: '#a78bfa', width: 6, unitScale: 5e9 },        // 0.003 m/s² → 15,000 km base
  { key: 'thrust', color: '#ef4444', width: 10, unitScale: 5e9 },            // same scale as gravity
];

const THRUST_DT = 30; // seconds for central difference

/** Shared state updated per-frame by the tick loop, read by CallbackProperties */
interface VectorState {
  scPos: Cartesian3;
  vectors: VectorSet;
}

export function useMissionVectors(
  viewer: CesiumViewer | null,
  trajectory: MissionTrajectory | null,
  simTimeRef: MutableRefObject<number>,
  toggles: VectorToggles,
) {
  const entitiesRef = useRef<Map<string, Entity>>(new Map());
  const stateRef = useRef<VectorState | null>(null);

  // Pre-parse waypoint timestamps once (avoid per-frame Date parsing)
  const waypointMsRef = useRef<number[] | null>(null);
  useEffect(() => {
    if (!trajectory) { waypointMsRef.current = null; return; }
    waypointMsRef.current = trajectory.waypoints.map(wp => new Date(wp.t).getTime());
  }, [trajectory]);

  // Per-frame vector computation
  useEffect(() => {
    if (!viewer || !trajectory || trajectory.waypoints.length < 3) return;

    let rafId = 0;
    const wps = trajectory.waypoints;

    const tick = () => {
      const simMs = simTimeRef.current;
      const wpMs = waypointMsRef.current;
      if (simMs && wpMs && wpMs.length === wps.length) {
        // Find current waypoint bracket using pre-parsed timestamps
        for (let i = 0; i < wps.length - 1; i++) {
          if (simMs >= wpMs[i] && simMs < wpMs[i + 1]) {
            const frac = (simMs - wpMs[i]) / (wpMs[i + 1] - wpMs[i]);
            const wp0 = wps[i];
            const wp1 = wps[i + 1];

            const scPos = new Cartesian3(
              (wp0.x + frac * (wp1.x - wp0.x)) * 1000,
              (wp0.y + frac * (wp1.y - wp0.y)) * 1000,
              (wp0.z + frac * (wp1.z - wp0.z)) * 1000,
            );

            const vel = {
              x: wp0.vx + frac * (wp1.vx - wp0.vx),
              y: wp0.vy + frac * (wp1.vy - wp0.vy),
              z: wp0.vz + frac * (wp1.vz - wp0.vz),
            };

            const currentJd = JulianDate.fromDate(new Date(simMs));
            const prevVel = interpolateVelocityAtOffset(wps, currentJd, -THRUST_DT);
            const nextVel = interpolateVelocityAtOffset(wps, currentJd, THRUST_DT);

            stateRef.current = {
              scPos,
              vectors: computeVectorSet(scPos, vel, prevVel, nextVel, THRUST_DT, currentJd),
            };
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
              const state = stateRef.current;
              if (!state) return [Cartesian3.ZERO, Cartesian3.ZERO];

              const { scPos, vectors } = state;
              const vec = vectors[config.key];
              const mag = Cartesian3.magnitude(vec);
              if (mag < 1e-10) return [scPos, scPos];

              // Arrow length = physical magnitude × unitScale (already in meters)
              // Then scale with camera distance so arrows stay visible at all zooms
              const cameraScale = computeAdaptiveScale(viewer, scPos);
              const arrowLength = mag * config.unitScale * Math.sqrt(cameraScale / 1000);

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
