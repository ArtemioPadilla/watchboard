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
  /** Max expected magnitude for normalization */
  maxMagnitude: number;
}

// Arrow length = minLen + normalized * (maxLen - minLen)
// minLen = 3× ship scale (always visible), maxLen = multiplier × ship scale
const VECTOR_CONFIGS: VectorConfig[] = [
  { key: 'velocity', color: '#00ffaa', width: 14, lengthMultiplier: 10, maxMagnitude: 11000 },    // cyan-green (distinct from trajectory blue)
  { key: 'gravityEarth', color: '#ff9500', width: 12, lengthMultiplier: 8, maxMagnitude: 10 },    // bright orange
  { key: 'gravityMoon', color: '#bf7fff', width: 12, lengthMultiplier: 8, maxMagnitude: 1.6 },    // bright purple
  { key: 'thrust', color: '#ff3333', width: 16, lengthMultiplier: 12, maxMagnitude: 10 },          // bright red, thickest
];

const THRUST_DT = 30;

export function useMissionVectors(
  viewer: CesiumViewer | null,
  trajectory: MissionTrajectory | null,
  simTimeRef: MutableRefObject<number>,
  positionRef: MutableRefObject<Cartesian3 | null>,
  toggles: VectorToggles,
) {
  const entitiesRef = useRef<Map<string, Entity>>(new Map());
  const vectorsRef = useRef<VectorSet | null>(null);
  const waypointMsRef = useRef<number[] | null>(null);

  // Pre-parse waypoint timestamps once
  useEffect(() => {
    if (!trajectory) { waypointMsRef.current = null; return; }
    waypointMsRef.current = trajectory.waypoints.map(wp => new Date(wp.t).getTime());
  }, [trajectory]);

  // Per-frame vector computation
  useEffect(() => {
    if (!viewer || !trajectory || trajectory.waypoints.length < 3) return undefined;
    const wps = trajectory.waypoints;

    // Use CesiumJS preRender event instead of RAF — fires exactly once per
    // CesiumJS frame, synchronized with the render loop (no 1-frame lag)
    const onPreRender = () => {
      const simMs = simTimeRef.current;
      const wpMs = waypointMsRef.current;
      const scPos = positionRef.current;

      if (simMs && wpMs && scPos) {
        for (let i = 0; i < wps.length - 1; i++) {
          if (simMs >= wpMs[i] && simMs < wpMs[i + 1]) {
            const frac = (simMs - wpMs[i]) / (wpMs[i + 1] - wpMs[i]);
            const wp0 = wps[i], wp1 = wps[i + 1];
            const vel = {
              x: wp0.vx + frac * (wp1.vx - wp0.vx),
              y: wp0.vy + frac * (wp1.vy - wp0.vy),
              z: wp0.vz + frac * (wp1.vz - wp0.vz),
            };
            const currentJd = JulianDate.fromDate(new Date(simMs));
            const prevVel = interpolateVelocityAtOffset(wps, currentJd, -THRUST_DT);
            const nextVel = interpolateVelocityAtOffset(wps, currentJd, THRUST_DT);
            vectorsRef.current = computeVectorSet(scPos, vel, prevVel, nextVel, THRUST_DT, currentJd);
            break;
          }
        }
      }
    };
    viewer.scene.preRender.addEventListener(onPreRender);
    return () => { viewer.scene.preRender.removeEventListener(onPreRender); };
  }, [viewer, trajectory]);

  // Create/destroy arrow entities when toggles change
  useEffect(() => {
    if (!viewer || !trajectory) return;
    const existing = entitiesRef.current;
    const wps = trajectory.waypoints;

    for (const config of VECTOR_CONFIGS) {
      const isOn = toggles[config.key];
      const hasEntity = existing.has(config.key);

      if (isOn && !hasEntity) {
        const wpMs = waypointMsRef.current;
        const entity = viewer.entities.add({
          polyline: {
            positions: new CallbackProperty(() => {
              const vecs = vectorsRef.current;
              if (!vecs || !wpMs) return [Cartesian3.ZERO, Cartesian3.ZERO];

              // Compute position directly from waypoints at render time
              // (not from positionRef which may be 1 frame stale)
              const simMs = simTimeRef.current;
              if (!simMs) return [Cartesian3.ZERO, Cartesian3.ZERO];
              let scPos: Cartesian3 | null = null;
              for (let i = 0; i < wps.length - 1; i++) {
                if (simMs >= wpMs[i] && simMs < wpMs[i + 1]) {
                  const frac = (simMs - wpMs[i]) / (wpMs[i + 1] - wpMs[i]);
                  const wp0 = wps[i], wp1 = wps[i + 1];
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
              if (mag < 1e-10) return [scPos, scPos];

              // Dual scaling: use whichever is larger — camera fraction or ship scale.
              // Far zoom: camera fraction dominates (arrows are % of view).
              // Close zoom: ship scale dominates (arrows stay proportional to model).
              const cameraDist = Cartesian3.distance(viewer.camera.positionWC, scPos);
              const shipScale = computeAdaptiveScale(viewer, scPos);
              const normalizedMag = Math.min(1, mag / config.maxMagnitude);

              // Camera-based length (good for far zoom)
              const minFrac = 0.02;
              const maxFrac = 0.02 + 0.08 * config.lengthMultiplier / 12;
              const cameraLen = cameraDist * (minFrac + normalizedMag * (maxFrac - minFrac));

              // Ship-based length (good for close zoom)
              const shipMinLen = shipScale * 3;
              const shipMaxLen = shipScale * config.lengthMultiplier;
              const shipLen = shipMinLen + normalizedMag * (shipMaxLen - shipMinLen);

              const arrowLength = Math.max(cameraLen, shipLen);

              // Arrow starts at spacecraft center (no offset — cleaner look)
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
            depthFailMaterial: new PolylineArrowMaterialProperty(
              Color.fromCssColorString(config.color).withAlpha(0.4),
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
