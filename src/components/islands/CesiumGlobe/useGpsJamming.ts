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

interface GpsJammingZone {
  id: string;
  label: string;
  center: [number, number]; // [lon, lat]
  radiusKm: number;
  startDate: string;
  endDate?: string;
  severity: 'high' | 'medium' | 'low';
  source?: string;
}

// Known GPS jamming / spoofing zones in the theater
const GPS_JAMMING_ZONES: GpsJammingZone[] = [
  {
    id: 'jam-tehran',
    label: 'GPS JAMMING\nTEHRAN REGION',
    center: [51.4, 35.7],
    radiusKm: 80,
    startDate: '2026-02-28',
    severity: 'high',
    source: 'ADSB anomaly reports',
  },
  {
    id: 'jam-isfahan',
    label: 'GPS JAMMING\nISFAHAN/NATANZ',
    center: [51.7, 32.8],
    radiusKm: 60,
    startDate: '2026-02-28',
    severity: 'high',
    source: 'ADSB anomaly reports',
  },
  {
    id: 'jam-bushehr',
    label: 'GPS SPOOFING\nBUSHEHR NUCLEAR',
    center: [50.8, 28.9],
    radiusKm: 45,
    startDate: '2026-02-28',
    severity: 'medium',
    source: 'Maritime GPS disruption',
  },
  {
    id: 'jam-hormuz',
    label: 'GPS DISRUPTION\nSTRAIT OF HORMUZ',
    center: [56.3, 26.6],
    radiusKm: 70,
    startDate: '2026-03-01',
    severity: 'medium',
    source: 'IRGCN electronic warfare',
  },
  {
    id: 'jam-tabriz',
    label: 'GPS JAMMING\nTABRIZ AD',
    center: [46.3, 38.1],
    radiusKm: 40,
    startDate: '2026-03-01',
    severity: 'low',
    source: 'Air defense EW activity',
  },
  {
    id: 'jam-bandar',
    label: 'GPS SPOOFING\nBANDAR ABBAS',
    center: [56.3, 27.2],
    radiusKm: 50,
    startDate: '2026-02-28',
    severity: 'high',
    source: 'IRGCN naval EW',
  },
];

const SEVERITY_COLORS: Record<string, string> = {
  high: '#ff2244',
  medium: '#ff6644',
  low: '#ff9944',
};

const SEVERITY_ALPHA: Record<string, number> = {
  high: 0.18,
  medium: 0.12,
  low: 0.08,
};

/** Generate hexagonal polygon positions around a center point */
function hexagonPositions(
  centerLon: number,
  centerLat: number,
  radiusKm: number,
): Cartesian3[] {
  const dLat = radiusKm / 111;
  const dLon = radiusKm / (111 * Math.cos((centerLat * Math.PI) / 180));
  const positions: Cartesian3[] = [];

  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6; // flat-top hexagon
    const lon = centerLon + dLon * Math.cos(angle);
    const lat = centerLat + dLat * Math.sin(angle);
    positions.push(Cartesian3.fromDegrees(lon, lat, 800));
  }

  return positions;
}

/** GPS Jamming zone hexagonal overlays synced to timeline */
export function useGpsJamming(
  viewer: CesiumViewer | null,
  enabled: boolean,
  currentDate?: string,
) {
  const [count, setCount] = useState(0);
  const entitiesRef = useRef<Entity[]>([]);

  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;

    // Cleanup
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

    for (const zone of GPS_JAMMING_ZONES) {
      if (dateStr < zone.startDate) continue;
      if (zone.endDate && dateStr > zone.endDate) continue;

      active++;
      const cssColor = SEVERITY_COLORS[zone.severity] || '#ff4444';
      const color = Color.fromCssColorString(cssColor);
      const fillAlpha = SEVERITY_ALPHA[zone.severity] || 0.12;

      // Hexagonal polygon
      const hexPos = hexagonPositions(zone.center[0], zone.center[1], zone.radiusKm);
      const polyEntity = viewer.entities.add({
        name: `GPS Jamming: ${zone.label.replace('\n', ' ')}`,
        polygon: {
          hierarchy: hexPos as any,
          material: color.withAlpha(fillAlpha),
          outline: true,
          outlineColor: color.withAlpha(0.5),
          outlineWidth: 2,
          height: 800,
        },
      });
      entitiesRef.current.push(polyEntity);

      // Pulsing inner hexagon (smaller, more opaque)
      const innerHex = hexagonPositions(zone.center[0], zone.center[1], zone.radiusKm * 0.6);
      const innerEntity = viewer.entities.add({
        polygon: {
          hierarchy: innerHex as any,
          material: color.withAlpha(fillAlpha * 1.5),
          outline: false,
          height: 900,
        },
      });
      entitiesRef.current.push(innerEntity);

      // Hex border line
      const borderEntity = viewer.entities.add({
        polyline: {
          positions: [...hexPos, hexPos[0]],
          width: 2,
          material: color.withAlpha(0.6),
          clampToGround: false,
        },
      });
      entitiesRef.current.push(borderEntity);

      // Label
      const labelEntity = viewer.entities.add({
        position: Cartesian3.fromDegrees(zone.center[0], zone.center[1], 1200),
        label: {
          text: zone.label,
          font: "bold 10px 'JetBrains Mono', monospace",
          fillColor: color.withAlpha(0.9),
          outlineColor: Color.BLACK,
          outlineWidth: 3,
          style: LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: VerticalOrigin.CENTER,
          horizontalOrigin: HorizontalOrigin.CENTER,
          scaleByDistance: new NearFarScalar(1e5, 1.0, 4e6, 0.25),
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
