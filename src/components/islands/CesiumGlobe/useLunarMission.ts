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
  Simon1994PlanetaryPositions,
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

      // Hide built-in Moon — it's in true ECEF which doesn't match our J2000
      // trajectory frame. We add a custom Moon entity below in the same frame.
      if (viewer.scene.moon) {
        viewer.scene.moon.show = false;
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

      // Custom Moon entity in J2000-as-ECEF frame (matches trajectory coordinates).
      // The built-in CesiumJS Moon is in true ECEF, which diverges from J2000 due to
      // Earth rotation. At lunar distance this mismatch is tens of thousands of km.
      const MOON_RADIUS_M = 1_737_400;
      const moonEntity = viewer.entities.add({
        position: new CallbackProperty(() => {
          const simMs = simTimeRef.current;
          const jd = simMs
            ? JulianDate.fromDate(new Date(simMs))
            : launchJd;
          // Get Moon position in Earth inertial frame (J2000) — same frame as trajectory
          // Do NOT apply ICRF→Fixed rotation — that would put it in ECEF
          const moonEci = Simon1994PlanetaryPositions.computeMoonPositionInEarthInertialFrame(jd);
          return new Cartesian3(moonEci.x, moonEci.y, moonEci.z);
        }, false) as any,
        ellipsoid: {
          radii: new Cartesian3(MOON_RADIUS_M, MOON_RADIUS_M, MOON_RADIUS_M) as any,
          material: Color.fromCssColorString('#8a8a8a').withAlpha(0.9),
          outline: true,
          outlineColor: Color.fromCssColorString('#555555'),
          slicePartitions: 36,
          stackPartitions: 18,
        },
        label: {
          text: 'MOON',
          font: '12px JetBrains Mono',
          fillColor: Color.fromCssColorString('#94a3b8'),
          outlineColor: Color.BLACK,
          outlineWidth: 2,
          style: 2,
          pixelOffset: { x: 0, y: -24 } as any,
          scaleByDistance: new NearFarScalar(1e6, 1.0, 1e9, 0.1),
        },
      });
      entitiesRef.current.push(moonEntity);

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

      // Common label config shared by model and billboard entities
      const labelConfig = {
        text: 'ORION',
        font: '14px JetBrains Mono',
        fillColor: Color.fromCssColorString('#4ade80'),
        outlineColor: Color.BLACK,
        outlineWidth: 3,
        style: 2,
        pixelOffset: { x: 0, y: -28 } as any,
        scaleByDistance: new NearFarScalar(1e5, 1.2, 5e8, 0.15),
      };

      // Start with billboard — upgrade to 3D model once we confirm the .glb is reachable
      const spacecraftEntity = viewer.entities.add({
        position: positionCallback as any,
        billboard: {
          image: createSpacecraftIcon(),
          scale: 1.0,
          scaleByDistance: new NearFarScalar(1e5, 1.2, 5e8, 0.15),
          color: Color.WHITE,
        },
        label: labelConfig,
      });
      entitiesRef.current.push(spacecraftEntity);
      spacecraftEntityRef.current = spacecraftEntity;

      // Async upgrade: verify model is reachable, then swap billboard → 3D model
      fetch(modelUri, { method: 'HEAD' }).then(resp => {
        if (!resp.ok) throw new Error(`Model HEAD ${resp.status}`);
        // Model exists — swap to 3D
        (spacecraftEntity as any).billboard = undefined;
        (spacecraftEntity as any).orientation = orientationCallback;
        (spacecraftEntity as any).model = {
          uri: modelUri,
          minimumPixelSize: MIN_PIXEL_SIZE,
          scale: new CallbackProperty(() => {
            const simMs = simTimeRef.current;
            if (!simMs) return 1_000;
            const currentJd = JulianDate.fromDate(new Date(simMs));
            const pos = positionProperty.getValue(currentJd);
            if (!pos) return 1_000;
            return computeAdaptiveScale(viewer, pos);
          }, false) as any,
          silhouetteColor: Color.fromCssColorString('#4ade80'),
          silhouetteSize: 1.0,
          colorBlendMode: ColorBlendMode.HIGHLIGHT,
        };
        console.log('[lunar-mission] Upgraded spacecraft to 3D model');
      }).catch(e => {
        console.warn('[lunar-mission] 3D model unavailable, keeping billboard:', e);
      });

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
