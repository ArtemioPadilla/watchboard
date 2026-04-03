import { useEffect, useRef, type MutableRefObject } from 'react';
import {
  Cartesian3,
  Color,
  JulianDate,
  SampledPositionProperty,
  LagrangePolynomialApproximation,
  PolylineGlowMaterialProperty,
  NearFarScalar,
  ReferenceFrame,
  type Viewer as CesiumViewer,
  type Entity,
} from 'cesium';
import {
  computeTelemetry,
  EMPTY_TELEMETRY,
  type TelemetryState,
} from './mission-helpers';
import type { MissionTrajectory } from '../../../lib/schemas';
import { createSpacecraftIcon } from './cesium-icons';

interface UseLunarMissionResult {
  telemetryRef: MutableRefObject<TelemetryState>;
  trackSpacecraft: () => void;
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
      const totalMissionSec = JulianDate.secondsDifference(splashdownJd, launchJd);

      // Enable built-in Moon
      if (viewer.scene.moon) {
        viewer.scene.moon.show = true;
      }

      // Build SampledPositionProperty in INERTIAL frame
      // Cesium handles inertial→ECEF conversion per frame (no spiral!)
      const positionProperty = new SampledPositionProperty(ReferenceFrame.INERTIAL);
      positionProperty.setInterpolationOptions({
        interpolationDegree: 3,
        interpolationAlgorithm: LagrangePolynomialApproximation,
      });

      const velocities: { t: JulianDate; v: number }[] = [];

      for (const wp of trajectory.waypoints) {
        const jd = JulianDate.fromIso8601(wp.t);
        // Waypoints are in Equatorial J2000 inertial (km) → convert to meters
        const pos = new Cartesian3(wp.x * 1000, wp.y * 1000, wp.z * 1000);
        positionProperty.addSample(jd, pos);
        velocities.push({
          t: jd,
          v: Math.sqrt(wp.vx ** 2 + wp.vy ** 2 + wp.vz ** 2),
        });
      }

      // Spacecraft entity with PathGraphics (draws the trajectory trail)
      // PathGraphics uses the SampledPositionProperty and handles reference frame conversion
      const spacecraftEntity = viewer.entities.add({
        position: positionProperty,
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
        path: {
          // Show full trajectory: trail behind + lead ahead
          leadTime: totalMissionSec,
          trailTime: totalMissionSec,
          width: 3,
          material: new PolylineGlowMaterialProperty({
            glowPower: 0.4,
            color: Color.fromCssColorString('#60a5fa').withAlpha(0.8),
          }),
        },
      });
      entitiesRef.current.push(spacecraftEntity);
      spacecraftEntityRef.current = spacecraftEntity;

      console.log(`[lunar-mission] Loaded ${trajectory.waypoints.length} waypoints (inertial frame, PathGraphics trail)`);

      // Per-frame telemetry update
      const tick = () => {
        try {
          const simMs = simTimeRef.current;
          if (!simMs) { rafRef.current = requestAnimationFrame(tick); return; }
          const currentJd = JulianDate.fromDate(new Date(simMs));

          // Get position in fixed (ECEF) frame for telemetry computation
          const pos = positionProperty.getValue(currentJd, new Cartesian3());
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
      spacecraftEntityRef.current = null;
    };
  }, [viewer, trajectory]);

  const trackSpacecraft = () => {
    if (!viewer || !spacecraftEntityRef.current) return;
    viewer.trackedEntity = spacecraftEntityRef.current;
  };

  return { telemetryRef, trackSpacecraft };
}
