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
import { INTERNET_BLACKOUTS } from '../../../lib/snapshots';




const SEVERITY_STYLES: Record<string, { color: string; fillAlpha: number; outlineAlpha: number; fontSize: string }> = {
  total: { color: '#ff2244', fillAlpha: 0.15, outlineAlpha: 0.6, fontSize: '14px' },
  major: { color: '#ff6644', fillAlpha: 0.10, outlineAlpha: 0.5, fontSize: '12px' },
  partial: { color: '#ff9944', fillAlpha: 0.07, outlineAlpha: 0.4, fontSize: '11px' },
};

/** Internet blackout overlays synced to timeline */
export function useInternetBlackout(
  viewer: CesiumViewer | null,
  enabled: boolean,
  currentDate?: string,
) {
  const [count, setCount] = useState(0);
  const entitiesRef = useRef<Entity[]>([]);

  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;

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

    for (const bo of INTERNET_BLACKOUTS) {
      if (dateStr < bo.startDate) continue;
      if (bo.endDate && dateStr > bo.endDate) continue;

      active++;
      const style = SEVERITY_STYLES[bo.severity] || SEVERITY_STYLES.partial;
      const color = Color.fromCssColorString(style.color);

      // Zone polygon
      const positions = bo.polygon.map(([lon, lat]) => Cartesian3.fromDegrees(lon, lat, 600));
      const polyEntity = viewer.entities.add({
        name: `Internet Blackout: ${bo.region}`,
        polygon: {
          hierarchy: positions as any,
          material: color.withAlpha(style.fillAlpha),
          outline: true,
          outlineColor: color.withAlpha(style.outlineAlpha),
          outlineWidth: 2,
          height: 600,
        },
      });
      entitiesRef.current.push(polyEntity);

      // Dashed border
      const borderEntity = viewer.entities.add({
        polyline: {
          positions: [...positions, positions[0]],
          width: 2.5,
          material: color.withAlpha(style.outlineAlpha),
          clampToGround: false,
        },
      });
      entitiesRef.current.push(borderEntity);

      // Large label
      const labelEntity = viewer.entities.add({
        position: Cartesian3.fromDegrees(bo.center[0], bo.center[1], 1500),
        label: {
          text: bo.label,
          font: `bold ${style.fontSize} 'JetBrains Mono', monospace`,
          fillColor: color.withAlpha(0.95),
          outlineColor: Color.BLACK,
          outlineWidth: 4,
          style: LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: VerticalOrigin.CENTER,
          horizontalOrigin: HorizontalOrigin.CENTER,
          scaleByDistance: new NearFarScalar(1e5, 1.2, 6e6, 0.2),
        },
      });
      entitiesRef.current.push(labelEntity);

      // Source sub-label
      if (bo.source) {
        const srcEntity = viewer.entities.add({
          position: Cartesian3.fromDegrees(bo.center[0], bo.center[1] - 0.4, 1500),
          label: {
            text: `SRC: ${bo.source}`,
            font: "8px 'JetBrains Mono', monospace",
            fillColor: color.withAlpha(0.5),
            outlineColor: Color.BLACK,
            outlineWidth: 2,
            style: LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: VerticalOrigin.CENTER,
            horizontalOrigin: HorizontalOrigin.CENTER,
            scaleByDistance: new NearFarScalar(1e5, 0.8, 3e6, 0.0),
          },
        });
        entitiesRef.current.push(srcEntity);
      }
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
