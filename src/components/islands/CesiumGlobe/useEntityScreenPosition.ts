import { useState, useEffect, useRef } from 'react';
import {
  Cartesian3,
  Cartesian2,
  SceneTransforms,
  type Viewer as CesiumViewer,
} from 'cesium';

interface ScreenPosition {
  x: number;
  y: number;
  visible: boolean;
}

/**
 * Tracks a world-space Cartesian3 position to screen coordinates.
 * Updates every animation frame. Returns { x, y, visible }.
 * `visible` is false when the position is behind the globe or off-screen.
 */
export function useEntityScreenPosition(
  viewer: CesiumViewer | null,
  worldPosition: Cartesian3 | null,
): ScreenPosition {
  const [pos, setPos] = useState<ScreenPosition>({ x: 0, y: 0, visible: false });
  const rafRef = useRef<number>(0);
  const scratchCartesian2 = useRef(new Cartesian2());

  useEffect(() => {
    if (!viewer || !worldPosition) {
      setPos({ x: 0, y: 0, visible: false });
      return;
    }

    let prevX = 0;
    let prevY = 0;
    let prevVisible = false;

    const update = () => {
      if (viewer.isDestroyed()) return;

      const result = SceneTransforms.worldToWindowCoordinates(
        viewer.scene,
        worldPosition,
        scratchCartesian2.current,
      );

      if (result) {
        const x = Math.round(result.x);
        const y = Math.round(result.y);
        const canvas = viewer.canvas;
        const visible =
          x >= -50 && x <= canvas.clientWidth + 50 &&
          y >= -50 && y <= canvas.clientHeight + 50;

        // Only update state when values actually change (avoid re-renders every frame)
        if (x !== prevX || y !== prevY || visible !== prevVisible) {
          prevX = x;
          prevY = y;
          prevVisible = visible;
          setPos({ x, y, visible });
        }
      } else {
        // Position is behind the globe
        if (prevVisible) {
          prevVisible = false;
          setPos(p => p.visible ? { ...p, visible: false } : p);
        }
      }

      rafRef.current = requestAnimationFrame(update);
    };

    rafRef.current = requestAnimationFrame(update);
    return () => cancelAnimationFrame(rafRef.current);
  }, [viewer, worldPosition]);

  return pos;
}
