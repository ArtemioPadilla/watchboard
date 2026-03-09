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

interface InternetBlackout {
  id: string;
  label: string;
  region: string;
  polygon: [number, number][]; // [lon, lat] pairs
  center: [number, number];
  startDate: string;
  endDate?: string;
  severity: 'total' | 'major' | 'partial';
  source?: string;
}

const INTERNET_BLACKOUTS: InternetBlackout[] = [
  {
    id: 'blackout-tehran',
    label: 'TEHRAN\nINTERNET BLACKOUT',
    region: 'Tehran Province',
    polygon: [
      [50.5, 36.2], [52.5, 36.2], [52.5, 35.0], [50.5, 35.0], [50.5, 36.2],
    ],
    center: [51.4, 35.7],
    startDate: '2026-02-28',
    severity: 'total',
    source: 'NetBlocks / IODA',
  },
  {
    id: 'blackout-isfahan',
    label: 'ISFAHAN\nINTERNET DISRUPTION',
    region: 'Isfahan Province',
    polygon: [
      [50.5, 33.5], [52.5, 33.5], [52.5, 32.0], [50.5, 32.0], [50.5, 33.5],
    ],
    center: [51.7, 32.7],
    startDate: '2026-02-28',
    severity: 'major',
    source: 'NetBlocks / Cloudflare Radar',
  },
  {
    id: 'blackout-shiraz',
    label: 'SHIRAZ\nINTERNET DISRUPTION',
    region: 'Fars Province',
    polygon: [
      [51.5, 30.2], [53.0, 30.2], [53.0, 29.0], [51.5, 29.0], [51.5, 30.2],
    ],
    center: [52.5, 29.6],
    startDate: '2026-03-01',
    severity: 'major',
    source: 'NetBlocks',
  },
  {
    id: 'blackout-mashhad',
    label: 'MASHHAD\nPARTIAL BLACKOUT',
    region: 'Khorasan Razavi',
    polygon: [
      [58.5, 37.0], [60.0, 37.0], [60.0, 35.8], [58.5, 35.8], [58.5, 37.0],
    ],
    center: [59.6, 36.3],
    startDate: '2026-03-01',
    severity: 'partial',
    source: 'IODA / Kentik',
  },
  {
    id: 'blackout-tabriz',
    label: 'TABRIZ\nPARTIAL BLACKOUT',
    region: 'East Azerbaijan',
    polygon: [
      [45.5, 38.5], [47.0, 38.5], [47.0, 37.5], [45.5, 37.5], [45.5, 38.5],
    ],
    center: [46.3, 38.1],
    startDate: '2026-03-01',
    severity: 'partial',
    source: 'NetBlocks',
  },
];

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
