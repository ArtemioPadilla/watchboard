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
  eciToEcef,
  getMoonPosition,
  computeTelemetry,
  EMPTY_TELEMETRY,
  type TelemetryState,
} from './mission-helpers';
import type { MissionTrajectory } from '../../../lib/schemas';
import { createSpacecraftIcon } from './cesium-icons';

interface UseLunarMissionResult {
  telemetryRef: MutableRefObject<TelemetryState>;
}

export function useLunarMission(
  viewer: CesiumViewer | null,
  trajectory: MissionTrajectory | null,
  simTimeRef: MutableRefObject<number>,
): UseLunarMissionResult {
  const telemetryRef = useRef<TelemetryState>(EMPTY_TELEMETRY);
  const entitiesRef = useRef<Entity[]>([]);
  const positionPropertyRef = useRef<SampledPositionProperty | null>(null);
  const rafRef = useRef<number>(0);
  const moonDetailLoadedRef = useRef(false);

  useEffect(() => {
    if (!viewer || !trajectory || trajectory.waypoints.length < 2) return;

    const launchJd = JulianDate.fromIso8601(trajectory.launchTime);
    const splashdownJd = JulianDate.fromIso8601(trajectory.splashdownTime);

    // Enable built-in Moon
    if (viewer.scene.moon) {
      viewer.scene.moon.show = true;
    }

    // Build SampledPositionProperty from ECI waypoints
    const positionProperty = new SampledPositionProperty();
    positionProperty.setInterpolationOptions({
      interpolationDegree: 5,
      interpolationAlgorithm: LagrangePolynomialApproximation,
    });

    const velocities: { t: JulianDate; v: number }[] = [];

    for (const wp of trajectory.waypoints) {
      const jd = JulianDate.fromIso8601(wp.t);
      const ecef = eciToEcef(wp, jd);
      positionProperty.addSample(jd, ecef);
      velocities.push({
        t: jd,
        v: Math.sqrt(wp.vx ** 2 + wp.vy ** 2 + wp.vz ** 2),
      });
    }
    positionPropertyRef.current = positionProperty;

    // Trajectory polyline — sample at uniform intervals for smoothness
    const allPositions: Cartesian3[] = [];
    const firstJd = JulianDate.fromIso8601(trajectory.waypoints[0].t);
    const lastJd = JulianDate.fromIso8601(trajectory.waypoints[trajectory.waypoints.length - 1].t);
    const totalSeconds = JulianDate.secondsDifference(lastJd, firstJd);
    const POLYLINE_SAMPLES = 1000;
    const stepSec = totalSeconds / POLYLINE_SAMPLES;

    for (let i = 0; i <= POLYLINE_SAMPLES; i++) {
      const sampleJd = JulianDate.addSeconds(firstJd, i * stepSec, new JulianDate());
      const pos = positionProperty.getValue(sampleJd);
      if (pos) allPositions.push(Cartesian3.clone(pos));
    }

    const trajectoryEntity = viewer.entities.add({
      polyline: {
        positions: allPositions,
        width: 2,
        material: new PolylineGlowMaterialProperty({
          glowPower: 0.3,
          color: Color.fromCssColorString('#60a5fa').withAlpha(0.6),
        }),
      },
    });
    entitiesRef.current.push(trajectoryEntity);

    // Spacecraft entity
    const spacecraftEntity = viewer.entities.add({
      position: new CallbackProperty(() => {
        const simMs = simTimeRef.current;
        const currentJd = JulianDate.fromDate(new Date(simMs));
        return positionProperty.getValue(currentJd) ?? Cartesian3.ZERO;
      }, false) as any,
      billboard: {
        image: createSpacecraftIcon(),
        scale: 0.8,
        scaleByDistance: new NearFarScalar(1e6, 1.0, 1e8, 0.3),
        color: Color.WHITE,
      },
      label: {
        text: 'ORION',
        font: '12px JetBrains Mono',
        fillColor: Color.fromCssColorString('#4ade80'),
        outlineColor: Color.BLACK,
        outlineWidth: 2,
        pixelOffset: new Cartesian3(0, -24, 0) as any,
        scaleByDistance: new NearFarScalar(1e6, 1.0, 1e8, 0.3),
      },
    });
    entitiesRef.current.push(spacecraftEntity);

    // Per-frame telemetry update
    const tick = () => {
      const simMs = simTimeRef.current;
      const currentJd = JulianDate.fromDate(new Date(simMs));
      const pos = positionProperty.getValue(currentJd);
      if (!pos) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      // Interpolate velocity from waypoint data
      let currentV = 0;
      for (let i = 0; i < velocities.length - 1; i++) {
        if (
          JulianDate.greaterThanOrEquals(currentJd, velocities[i].t) &&
          JulianDate.lessThan(currentJd, velocities[i + 1].t)
        ) {
          const frac = JulianDate.secondsDifference(currentJd, velocities[i].t) /
                       JulianDate.secondsDifference(velocities[i + 1].t, velocities[i].t);
          currentV = velocities[i].v * (1 - frac) + velocities[i + 1].v * frac;
          break;
        }
      }

      telemetryRef.current = computeTelemetry(
        pos, currentV, launchJd, currentJd, splashdownJd, trajectory.phases,
      );

      // Moon LOD check
      const moonPos = getMoonPosition(currentJd);
      const camPos = viewer.camera.positionWC;
      const camToMoonDist = Cartesian3.distance(camPos, moonPos) / 1000;

      if (camToMoonDist < 50000 && !moonDetailLoadedRef.current) {
        moonDetailLoadedRef.current = true;
      } else if (camToMoonDist > 60000 && moonDetailLoadedRef.current) {
        moonDetailLoadedRef.current = false;
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    // Cleanup
    return () => {
      cancelAnimationFrame(rafRef.current);
      for (const entity of entitiesRef.current) {
        viewer.entities.remove(entity);
      }
      entitiesRef.current = [];
      positionPropertyRef.current = null;
    };
  }, [viewer, trajectory]);

  return { telemetryRef };
}
