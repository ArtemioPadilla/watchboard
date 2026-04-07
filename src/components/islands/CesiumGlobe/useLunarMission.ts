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
  ColorBlendMode,
  Quaternion,
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
import { computeSpacecraftOrientation } from './spacecraft-orientation';
import { computeAdaptiveScale, MIN_PIXEL_SIZE } from './spacecraft-scale';

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

      // Enable built-in Moon
      if (viewer.scene.moon) {
        viewer.scene.moon.show = true;
      }

      // Build SampledPositionProperty (FIXED/ECEF frame — no rotation)
      // Waypoints are equatorial J2000 inertial but we treat them as ECEF.
      // This gives a clean static arc. Geographic positions under the path
      // aren't exact but at 400,000 km scale it's imperceptible.
      const positionProperty = new SampledPositionProperty();
      positionProperty.setInterpolationOptions({
        interpolationDegree: 3,
        interpolationAlgorithm: LagrangePolynomialApproximation,
      });

      const velocities: { t: JulianDate; v: number }[] = [];

      for (const wp of trajectory.waypoints) {
        const jd = JulianDate.fromIso8601(wp.t);
        const pos = new Cartesian3(wp.x * 1000, wp.y * 1000, wp.z * 1000);
        positionProperty.addSample(jd, pos);
        velocities.push({
          t: jd,
          v: Math.sqrt(wp.vx ** 2 + wp.vy ** 2 + wp.vz ** 2),
        });
      }

      // Static polyline from all waypoints — clean arc, no spiral
      const polylinePositions: Cartesian3[] = trajectory.waypoints.map(
        wp => new Cartesian3(wp.x * 1000, wp.y * 1000, wp.z * 1000),
      );

      const trajectoryEntity = viewer.entities.add({
        polyline: {
          positions: polylinePositions,
          width: 3,
          material: new PolylineGlowMaterialProperty({
            glowPower: 0.4,
            color: Color.fromCssColorString('#60a5fa').withAlpha(0.8),
          }),
          depthFailMaterial: new PolylineGlowMaterialProperty({
            glowPower: 0.2,
            color: Color.fromCssColorString('#60a5fa').withAlpha(0.4),
          }),
        },
      });
      entitiesRef.current.push(trajectoryEntity);

      // Spacecraft entity — 3D model with velocity-aligned orientation
      const modelUri = '/models/orion-spacecraft.glb';

      // Shared position callback — reused by both model and scale
      const positionCallback = new CallbackProperty(() => {
        const simMs = simTimeRef.current;
        if (!simMs) return polylinePositions[0];
        const currentJd = JulianDate.fromDate(new Date(simMs));
        const pos = positionProperty.getValue(currentJd);
        if (!pos) {
          const launchMs = new Date(trajectory.launchTime).getTime();
          if (simMs < launchMs) return polylinePositions[0];
          return polylinePositions[polylinePositions.length - 1];
        }
        return pos;
      }, false);

      // Orientation: velocity alignment + phase overrides
      const orientationCallback = new CallbackProperty(() => {
        const simMs = simTimeRef.current;
        if (!simMs) return Quaternion.IDENTITY;
        const currentJd = JulianDate.fromDate(new Date(simMs));
        return computeSpacecraftOrientation(
          positionProperty,
          currentJd,
          trajectory.phases,
        ) ?? Quaternion.IDENTITY;
      }, false);

      // Attempt to load 3D model, fall back to billboard on error
      let spacecraftEntity: Entity;
      try {
        spacecraftEntity = viewer.entities.add({
          position: positionCallback as any,
          orientation: orientationCallback as any,
          model: {
            uri: modelUri,
            minimumPixelSize: MIN_PIXEL_SIZE,
            scale: new CallbackProperty(() => {
              const simMs = simTimeRef.current;
              if (!simMs) return 100_000;
              const currentJd = JulianDate.fromDate(new Date(simMs));
              const pos = positionProperty.getValue(currentJd);
              if (!pos) return 100_000;
              return computeAdaptiveScale(viewer, pos);
            }, false) as any,
            silhouetteColor: Color.fromCssColorString('#4ade80'),
            silhouetteSize: 1.0,
            colorBlendMode: ColorBlendMode.HIGHLIGHT,
            colorBlendAmount: 0.0,
          },
          label: {
            text: 'ORION',
            font: '14px JetBrains Mono',
            fillColor: Color.fromCssColorString('#4ade80'),
            outlineColor: Color.BLACK,
            outlineWidth: 3,
            style: 2,
            pixelOffset: { x: 0, y: -28 } as any,
            scaleByDistance: new NearFarScalar(1e5, 1.2, 5e8, 0.15),
          },
        });
      } catch (e) {
        console.warn('[lunar-mission] 3D model failed to load, falling back to billboard:', e);
        spacecraftEntity = viewer.entities.add({
          position: positionCallback as any,
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
            style: 2,
            pixelOffset: { x: 0, y: -28 } as any,
            scaleByDistance: new NearFarScalar(1e5, 1.2, 5e8, 0.15),
          },
        });
      }
      entitiesRef.current.push(spacecraftEntity);
      spacecraftEntityRef.current = spacecraftEntity;

      console.log(`[lunar-mission] Loaded ${trajectory.waypoints.length} waypoints, static polyline + tracked entity`);

      // Per-frame telemetry update
      const tick = () => {
        try {
          const simMs = simTimeRef.current;
          if (!simMs) { rafRef.current = requestAnimationFrame(tick); return; }
          const currentJd = JulianDate.fromDate(new Date(simMs));
          const pos = positionProperty.getValue(currentJd);
          if (!pos) { rafRef.current = requestAnimationFrame(tick); return; }

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
