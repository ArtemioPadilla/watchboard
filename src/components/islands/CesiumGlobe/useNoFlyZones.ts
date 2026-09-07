import { useEffect, useRef, useState } from 'react';
import {
  Cartesian3,
  Color,
  LabelStyle,
  VerticalOrigin,
  HorizontalOrigin,
  NearFarScalar,
  type Viewer as CesiumViewer,
  type Entity,
} from 'cesium';
import { NO_FLY_ZONES } from '../../../lib/snapshots';




/** Render no-fly zone overlays synced to the timeline date */
export function useNoFlyZones(
  viewer: CesiumViewer | null,
  enabled: boolean,
  currentDate?: string,
) {
  const [count, setCount] = useState(0);
  const entitiesRef = useRef<Entity[]>([]);

  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;

    // Clean up
    entitiesRef.current.forEach(e => {
      try { viewer.entities.remove(e); } catch { /* ok */ }
    });
    entitiesRef.current = [];

    if (!enabled) {
      setCount(0);
      return;
    }

    const dateStr = currentDate || new Date().toISOString().split('T')[0];
    let active = 0;

    for (const nfz of NO_FLY_ZONES) {
      // Only show if current date is within the closure window
      if (dateStr < nfz.startDate) continue;
      if (nfz.endDate && dateStr > nfz.endDate) continue;

      active++;
      const color = Color.fromCssColorString(nfz.color);

      // Polygon overlay
      const positions = nfz.polygon.map(([lon, lat]) => Cartesian3.fromDegrees(lon, lat, 500));
      const polyEntity = viewer.entities.add({
        name: nfz.label.replace('\n', ' — '),
        polygon: {
          hierarchy: positions as any,
          material: color.withAlpha(0.08),
          outline: true,
          outlineColor: color.withAlpha(0.4),
          outlineWidth: 2,
          height: 500,
        },
      });
      entitiesRef.current.push(polyEntity);

      // Dashed border for emphasis — use polyline along the boundary
      const borderEntity = viewer.entities.add({
        polyline: {
          positions: [...positions, positions[0]],
          width: 2,
          material: color.withAlpha(0.5),
          clampToGround: false,
        },
      });
      entitiesRef.current.push(borderEntity);

      // Large bold label (WORLDVIEW style)
      const labelEntity = viewer.entities.add({
        position: Cartesian3.fromDegrees(nfz.center[0], nfz.center[1], 2000),
        label: {
          text: nfz.label,
          font: "bold 13px 'JetBrains Mono', monospace",
          fillColor: color.withAlpha(0.9),
          outlineColor: Color.BLACK,
          outlineWidth: 4,
          style: LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: VerticalOrigin.CENTER,
          horizontalOrigin: HorizontalOrigin.CENTER,
          scaleByDistance: new NearFarScalar(1e5, 1.2, 6e6, 0.25),
        },
      });
      entitiesRef.current.push(labelEntity);
    }

    setCount(active);

    return () => {
      if (!viewer.isDestroyed()) {
        entitiesRef.current.forEach(e => {
          try { viewer.entities.remove(e); } catch { /* ok */ }
        });
      }
      entitiesRef.current = [];
    };
  }, [enabled, viewer, currentDate]);

  return { count };
}
