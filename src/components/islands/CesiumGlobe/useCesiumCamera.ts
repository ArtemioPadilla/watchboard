import { useCallback, useRef, useEffect } from 'react';
import { Cartesian3, Math as CesiumMath, HeadingPitchRange } from 'cesium';
import type { CesiumComponentRef } from 'resium';
import type { Viewer as CesiumViewer } from 'cesium';
import type { CameraPresetKey, CameraPresetsMap } from '../../../lib/cesium-config';

export type OrbitMode = 'off' | 'flat' | 'spiral_in' | 'spiral_out';

export function useCesiumCamera(viewerRef: React.RefObject<CesiumComponentRef<CesiumViewer> | null>, cameraPresets: CameraPresetsMap = {}) {
  const orbitModeRef = useRef<OrbitMode>('off');
  const orbitRafRef = useRef<number>(0);
  const orbitAngleRef = useRef(0);
  const orbitRadiusRef = useRef(0);
  const orbitTargetRef = useRef<{ lon: number; lat: number }>({ lon: 49, lat: 29 });
  const orbitLastFrameRef = useRef(0);

  const flyTo = useCallback((presetKey: CameraPresetKey) => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer) return;

    const preset = cameraPresets[presetKey];
    if (!preset) return;
    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(preset.lon, preset.lat, preset.alt),
      orientation: {
        heading: CesiumMath.toRadians(preset.heading),
        pitch: CesiumMath.toRadians(preset.pitch),
        roll: 0,
      },
      duration: 2.0,
    });
  }, [viewerRef, cameraPresets]);

  const startOrbit = useCallback((mode: OrbitMode, speedDegPerSec: number = 3) => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer || viewer.isDestroyed()) return;

    // Stop any existing orbit
    cancelAnimationFrame(orbitRafRef.current);
    orbitModeRef.current = mode;

    if (mode === 'off') return;

    // Get current camera position as orbit center reference
    const carto = viewer.camera.positionCartographic;
    orbitTargetRef.current = {
      lon: CesiumMath.toDegrees(carto.longitude),
      lat: CesiumMath.toDegrees(carto.latitude),
    };
    orbitRadiusRef.current = carto.height;
    orbitAngleRef.current = 0;
    orbitLastFrameRef.current = 0;

    const tick = (timestamp: number) => {
      if (!viewer || viewer.isDestroyed() || orbitModeRef.current === 'off') return;

      if (orbitLastFrameRef.current === 0) {
        orbitLastFrameRef.current = timestamp;
        orbitRafRef.current = requestAnimationFrame(tick);
        return;
      }

      const dt = Math.min((timestamp - orbitLastFrameRef.current) / 1000, 0.1);
      orbitLastFrameRef.current = timestamp;

      orbitAngleRef.current += speedDegPerSec * dt;

      // Spiral adjustment
      if (mode === 'spiral_in') {
        orbitRadiusRef.current = Math.max(50000, orbitRadiusRef.current * (1 - 0.02 * dt));
      } else if (mode === 'spiral_out') {
        orbitRadiusRef.current = Math.min(10000000, orbitRadiusRef.current * (1 + 0.02 * dt));
      }

      const angleRad = CesiumMath.toRadians(orbitAngleRef.current);
      const orbitOffset = 0.5; // degrees offset from center
      const lon = orbitTargetRef.current.lon + orbitOffset * Math.cos(angleRad);
      const lat = orbitTargetRef.current.lat + orbitOffset * Math.sin(angleRad) * 0.5;

      viewer.camera.setView({
        destination: Cartesian3.fromDegrees(lon, lat, orbitRadiusRef.current),
        orientation: {
          heading: CesiumMath.toRadians(orbitAngleRef.current % 360),
          pitch: CesiumMath.toRadians(-45),
          roll: 0,
        },
      });

      orbitRafRef.current = requestAnimationFrame(tick);
    };

    orbitRafRef.current = requestAnimationFrame(tick);
  }, [viewerRef]);

  const stopOrbit = useCallback(() => {
    cancelAnimationFrame(orbitRafRef.current);
    orbitModeRef.current = 'off';
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => cancelAnimationFrame(orbitRafRef.current);
  }, []);

  return { flyTo, startOrbit, stopOrbit, orbitModeRef };
}
