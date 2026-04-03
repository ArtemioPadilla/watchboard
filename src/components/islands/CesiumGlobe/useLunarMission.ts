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
  computeTelemetry,
  getMoonPosition,
  EMPTY_TELEMETRY,
  type TelemetryState,
} from './mission-helpers';
import type { MissionTrajectory } from '../../../lib/schemas';
import { createSpacecraftIcon } from './cesium-icons';

interface UseLunarMissionResult {
  telemetryRef: MutableRefObject<TelemetryState>;
  trackSpacecraft: () => void;
}

/**
 * Convert ECI km to ECEF meters (simplified — treats ECI as ECEF).
 * The rotation error is small for visualization purposes.
 */
function eciKmToCartesian(wp: { x: number; y: number; z: number }): Cartesian3 {
  return new Cartesian3(wp.x * 1000, wp.y * 1000, wp.z * 1000);
}

export function useLunarMission(
  viewer: CesiumViewer | null,
  trajectory: MissionTrajectory | null,
  simTimeRef: MutableRefObject<number>,
): UseLunarMissionResult {
  const telemetryRef = useRef<TelemetryState>(EMPTY_TELEMETRY);
  const entitiesRef = useRef<Entity[]>([]);
  const rafRef = useRef<number>(0);
  const spacecraftEntityRef = useRef<Entity | null>(null);

  useEffect(() => {
    if (!viewer || !trajectory || trajectory.waypoints.length < 2) return;

    try {
      const launchJd = JulianDate.fromIso8601(trajectory.launchTime);
      const splashdownJd = JulianDate.fromIso8601(trajectory.splashdownTime);

      // Enable built-in Moon
      if (viewer.scene.moon) {
        viewer.scene.moon.show = true;
      }

      // Build SampledPositionProperty from waypoints
      const positionProperty = new SampledPositionProperty();
      positionProperty.setInterpolationOptions({
        interpolationDegree: 3,
        interpolationAlgorithm: LagrangePolynomialApproximation,
      });

      const velocities: { t: JulianDate; v: number }[] = [];

      for (const wp of trajectory.waypoints) {
        const jd = JulianDate.fromIso8601(wp.t);
        const pos = eciKmToCartesian(wp);
        positionProperty.addSample(jd, pos);
        velocities.push({
          t: jd,
          v: Math.sqrt(wp.vx ** 2 + wp.vy ** 2 + wp.vz ** 2),
        });
      }

      // Build static polyline positions from waypoints directly (skip interpolation sampling)
      const polylinePositions: Cartesian3[] = [];
      // Sample every Nth waypoint for the polyline (all 632 is fine)
      for (const wp of trajectory.waypoints) {
        polylinePositions.push(eciKmToCartesian(wp));
      }

      // Trajectory polyline
      const trajectoryEntity = viewer.entities.add({
        polyline: {
          positions: polylinePositions,
          width: 3,
          material: new PolylineGlowMaterialProperty({
            glowPower: 0.4,
            color: Color.fromCssColorString('#60a5fa').withAlpha(0.8),
          }),
        },
      });
      entitiesRef.current.push(trajectoryEntity);

      // Spacecraft entity
      const spacecraftEntity = viewer.entities.add({
        position: new CallbackProperty(() => {
          const simMs = simTimeRef.current;
          if (!simMs) return eciKmToCartesian(trajectory.waypoints[0]);
          const currentJd = JulianDate.fromDate(new Date(simMs));
          const pos = positionProperty.getValue(currentJd);
          // Fallback to first/last waypoint if outside range
          if (!pos) {
            const launchMs = new Date(trajectory.launchTime).getTime();
            if (simMs < launchMs) return eciKmToCartesian(trajectory.waypoints[0]);
            return eciKmToCartesian(trajectory.waypoints[trajectory.waypoints.length - 1]);
          }
          return pos;
        }, false) as any,
        billboard: {
          image: createSpacecraftIcon(),
          scale: 1.0,
          scaleByDistance: new NearFarScalar(1e5, 1.2, 5e8, 0.15),
          color: Color.WHITE,
        },
        label: {
          text: 'ORION',
          font: '14px JetBrains Mono',
          fillColor: Color.fromCssColorString('#4ade80'),
          outlineColor: Color.BLACK,
          outlineWidth: 3,
          style: 2, // FILL_AND_OUTLINE
          pixelOffset: { x: 0, y: -28 } as any,
          scaleByDistance: new NearFarScalar(1e5, 1.2, 5e8, 0.15),
        },
      });
      entitiesRef.current.push(spacecraftEntity);
      spacecraftEntityRef.current = spacecraftEntity;

      console.log(`[lunar-mission] Loaded ${trajectory.waypoints.length} waypoints, ${polylinePositions.length} polyline points`);

      // Per-frame telemetry update
      const tick = () => {
        try {
          const simMs = simTimeRef.current;
          if (!simMs) { rafRef.current = requestAnimationFrame(tick); return; }
          const currentJd = JulianDate.fromDate(new Date(simMs));
          const pos = positionProperty.getValue(currentJd);
          if (!pos) { rafRef.current = requestAnimationFrame(tick); return; }

          // Interpolate velocity
          let currentV = 0;
          for (let i = 0; i < velocities.length - 1; i++) {
            if (
              JulianDate.greaterThanOrEquals(currentJd, velocities[i].t) &&
              JulianDate.lessThan(currentJd, velocities[i + 1].t)
            ) {
              const secDiff = JulianDate.secondsDifference(velocities[i + 1].t, velocities[i].t);
              if (secDiff > 0) {
                const frac = JulianDate.secondsDifference(currentJd, velocities[i].t) / secDiff;
                currentV = velocities[i].v * (1 - frac) + velocities[i + 1].v * frac;
              }
              break;
            }
          }

          telemetryRef.current = computeTelemetry(
            pos, currentV, launchJd, currentJd, splashdownJd, trajectory.phases,
          );
        } catch (e) {
          console.warn('[lunar-mission] tick error:', e);
        }

        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);

    } catch (e) {
      console.error('[lunar-mission] init error:', e);
    }

    // Cleanup
    return () => {
      cancelAnimationFrame(rafRef.current);
      for (const entity of entitiesRef.current) {
        try { viewer.entities.remove(entity); } catch {}
      }
      entitiesRef.current = [];
    };
  }, [viewer, trajectory]);

  const trackSpacecraft = () => {
    if (!viewer || !spacecraftEntityRef.current) return;
    viewer.trackedEntity = spacecraftEntityRef.current;
  };

  return { telemetryRef, trackSpacecraft };
}
