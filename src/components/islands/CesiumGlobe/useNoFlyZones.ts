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

interface NoFlyZone {
  id: string;
  label: string;
  startDate: string;       // Airspace closed from this date
  endDate?: string;         // Airspace reopened (undefined = still closed)
  polygon: [number, number][];  // [lon, lat] pairs
  center: [number, number];     // label position
  color: string;
}

// Simplified country airspace boundaries and conflict closure dates
const NO_FLY_ZONES: NoFlyZone[] = [
  {
    id: 'nfz-iran',
    label: 'IRAN\nAIRSPACE CLOSED',
    startDate: '2026-02-28',
    polygon: [
      [44.0, 39.5], [48.5, 38.5], [54.0, 37.5], [60.5, 36.5], [63.0, 34.0],
      [63.5, 27.0], [61.5, 25.3], [57.5, 25.5], [54.0, 26.5], [51.5, 27.8],
      [49.0, 29.5], [48.0, 30.5], [45.5, 33.5], [44.0, 35.5], [44.0, 39.5],
    ],
    center: [54, 33],
    color: '#e74c3c',
  },
  {
    id: 'nfz-iraq',
    label: 'IRAQ\nAIRSPACE CLOSED',
    startDate: '2026-02-28',
    polygon: [
      [38.8, 37.2], [42.0, 37.3], [44.8, 37.1], [46.0, 35.0], [48.0, 30.5],
      [47.5, 29.5], [44.5, 29.0], [39.0, 32.5], [38.8, 37.2],
    ],
    center: [43.5, 33],
    color: '#e74c3c',
  },
  {
    id: 'nfz-kuwait',
    label: 'KUWAIT\nCLOSED',
    startDate: '2026-03-01',
    polygon: [
      [46.5, 30.1], [48.5, 30.1], [48.5, 28.5], [46.5, 28.5], [46.5, 30.1],
    ],
    center: [47.5, 29.3],
    color: '#f39c12',
  },
  {
    id: 'nfz-bahrain',
    label: 'BAHRAIN\nRESTRICTED',
    startDate: '2026-03-01',
    polygon: [
      [50.2, 26.4], [50.8, 26.4], [50.8, 25.8], [50.2, 25.8], [50.2, 26.4],
    ],
    center: [50.5, 26.1],
    color: '#f39c12',
  },
  {
    id: 'nfz-qatar',
    label: 'QATAR\nRESTRICTED',
    startDate: '2026-03-01',
    polygon: [
      [50.7, 26.2], [51.7, 26.2], [51.7, 24.5], [50.7, 24.5], [50.7, 26.2],
    ],
    center: [51.2, 25.3],
    color: '#f39c12',
  },
  {
    id: 'nfz-uae',
    label: 'UAE\nRESTRICTED',
    startDate: '2026-03-01',
    polygon: [
      [51.5, 26.1], [56.4, 26.1], [56.4, 22.6], [52.0, 22.6], [51.5, 24.0], [51.5, 26.1],
    ],
    center: [54.5, 24.5],
    color: '#f39c12',
  },
];

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
