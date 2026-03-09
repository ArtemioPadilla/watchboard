import { useEffect, useRef } from 'react';
import {
  Cartesian3,
  CallbackProperty,
  Color,
  HeightReference,
  NearFarScalar,
  DistanceDisplayCondition,
  VerticalOrigin,
  HorizontalOrigin,
  LabelStyle,
  ScreenSpaceEventType,
  ScreenSpaceEventHandler,
  defined,
  type Viewer as CesiumViewer,
  type Entity,
} from 'cesium';
import type { MapPoint, MapLine } from '../../../lib/schemas';
import {
  catToCesiumColor,
  frontZoneRadius,
  billboardSize,
  arc3D,
  lineWidth,
  arcMaterial,
} from './cesium-helpers';
import { getIconDataUri } from './cesium-icons';
import type { IconType } from './cesium-icons';

// ── Point helpers ──

function isNavalVessel(pt: MapPoint): boolean {
  if (pt.cat !== 'asset') return false;
  const l = pt.label.toLowerCase();
  return l.includes('uss ') || l.includes('cvn') || l.includes('ddg') || l.includes('navy');
}

function isAirBase(pt: MapPoint): boolean {
  if (pt.cat !== 'asset') return false;
  return !!pt.base;
}

function navalZoneRadius(pt: MapPoint): number {
  const l = pt.label.toLowerCase();
  if (l.includes('lincoln') || l.includes('ford')) return 80_000;
  return 40_000;
}

// ── Hook ──

export function useConflictData(
  viewer: CesiumViewer | null,
  points: MapPoint[],
  lines: MapLine[],
  onSelect: (pt: MapPoint) => void,
): void {
  const pointEntitiesRef = useRef<Entity[]>([]);
  const arcEntitiesRef = useRef<Entity[]>([]);
  const handlerRef = useRef<ScreenSpaceEventHandler | null>(null);
  const pointMapRef = useRef<Map<Entity, MapPoint>>(new Map());
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // ── Points ──
  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;

    // Remove old point entities
    pointEntitiesRef.current.forEach(e => {
      try { viewer.entities.remove(e); } catch { /* already removed */ }
    });
    pointEntitiesRef.current = [];
    pointMapRef.current.clear();

    // Create new point entities with billboard icons
    for (const pt of points) {
      const color = catToCesiumColor(pt.cat);
      const isFront = pt.cat === 'front';
      const isShip = isNavalVessel(pt);
      const isBase = isAirBase(pt);
      const isAsset = pt.cat === 'asset';
      const showLabel = isAsset || isFront || pt.tier === 1;

      let markerColor = color;
      if (isShip) markerColor = Color.fromCssColorString('#00ccff');
      else if (isBase) markerColor = Color.fromCssColorString('#4aa3df');

      // Ships get a small altitude to float above ocean surface with terrain
      const altitude = isShip ? 500 : 0;

      // Determine icon type
      const iconType: IconType = isShip ? 'naval'
        : isBase ? 'airbase'
        : isFront ? 'front'
        : (pt.cat as IconType);
      const iconUri = getIconDataUri(iconType);
      const size = isShip ? { width: 28, height: 28 }
        : isBase ? { width: 22, height: 18 }
        : billboardSize(pt.cat);

      // Pulsing ellipse outline for naval vessels
      const shipEllipseOutline = isShip
        ? new CallbackProperty(() => {
            const t = performance.now() / 1000;
            const pulse = 0.4 + 0.4 * Math.sin(t * 2.5);
            return markerColor.withAlpha(pulse);
          }, false) as any
        : undefined;

      const entity = viewer.entities.add({
        position: Cartesian3.fromDegrees(pt.lon, pt.lat, altitude),
        name: pt.label,
        billboard: {
          image: iconUri,
          width: size.width,
          height: size.height,
          scaleByDistance: new NearFarScalar(1e4, 1.5, 5e6, isShip ? 0.7 : 0.5),
          verticalOrigin: VerticalOrigin.CENTER,
          horizontalOrigin: HorizontalOrigin.CENTER,
          heightReference: isShip ? HeightReference.RELATIVE_TO_GROUND : HeightReference.NONE,
          distanceDisplayCondition: isShip ? new DistanceDisplayCondition(0, 20e6) : undefined,
        },
        label: showLabel ? {
          text: pt.label,
          font: isShip ? "bold 13px 'DM Sans', sans-serif" : "11px 'DM Sans', sans-serif",
          fillColor: isShip ? Color.fromCssColorString('#00eeff') : Color.fromCssColorString('#e8e9ed'),
          outlineColor: Color.fromCssColorString('#0a0b0e'),
          outlineWidth: 2,
          style: LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: VerticalOrigin.BOTTOM,
          horizontalOrigin: HorizontalOrigin.CENTER,
          pixelOffset: new Cartesian3(0, -(size.height / 2 + 4), 0) as any,
          scaleByDistance: new NearFarScalar(1e4, 1.0, 5e6, 0.4),
          distanceDisplayCondition: new DistanceDisplayCondition(0, isShip ? 15e6 : isAsset ? 8e6 : 5e6),
          heightReference: isShip ? HeightReference.RELATIVE_TO_GROUND : HeightReference.NONE,
        } : undefined,
        ellipse: (isFront || isShip || isBase) ? {
          semiMajorAxis: isFront ? frontZoneRadius(pt.id) : isShip ? navalZoneRadius(pt) : 50_000,
          semiMinorAxis: isFront ? frontZoneRadius(pt.id) : isShip ? navalZoneRadius(pt) : 50_000,
          material: (isShip ? markerColor : isFront ? color : markerColor).withAlpha(
            isFront ? 0.08 : isShip ? 0.12 : 0.03,
          ),
          outline: true,
          outlineColor: isShip ? shipEllipseOutline : (isFront ? color : markerColor).withAlpha(
            isFront ? 0.25 : 0.15,
          ),
          outlineWidth: isShip ? 2.5 : 1,
        } : undefined,
      });

      pointEntitiesRef.current.push(entity);
      pointMapRef.current.set(entity, pt);
    }

    return () => {
      if (!viewer.isDestroyed()) {
        pointEntitiesRef.current.forEach(e => {
          try { viewer.entities.remove(e); } catch { /* already removed */ }
        });
      }
      pointEntitiesRef.current = [];
      pointMapRef.current.clear();
    };
  }, [viewer, points]);

  // ── Click handler ──
  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;

    // Clean up previous handler
    if (handlerRef.current) {
      handlerRef.current.destroy();
      handlerRef.current = null;
    }

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    handlerRef.current = handler;

    handler.setInputAction((click: any) => {
      const picked = viewer.scene.pick(click.position);
      if (defined(picked) && picked.id instanceof Object) {
        const pt = pointMapRef.current.get(picked.id as Entity);
        if (pt) onSelectRef.current(pt);
      }
    }, ScreenSpaceEventType.LEFT_CLICK);

    return () => {
      if (handlerRef.current && !handlerRef.current.isDestroyed()) {
        handlerRef.current.destroy();
      }
      handlerRef.current = null;
    };
  }, [viewer]);

  // ── Arcs ──
  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;

    // Remove old arc entities
    arcEntitiesRef.current.forEach(e => {
      try { viewer.entities.remove(e); } catch { /* already removed */ }
    });
    arcEntitiesRef.current = [];

    // Compute lateral offsets so overlapping arcs fan out
    const groups = new Map<string, string[]>();
    for (const line of lines) {
      const key = [
        Math.round(line.from[0] * 2) / 2,
        Math.round(line.from[1] * 2) / 2,
        Math.round(line.to[0] * 2) / 2,
        Math.round(line.to[1] * 2) / 2,
      ].join(',');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(line.id);
    }
    const offsets = new Map<string, number>();
    for (const [, ids] of groups) {
      if (ids.length <= 1) {
        offsets.set(ids[0], 0);
      } else {
        const totalSpread = Math.min(0.3 * ids.length, 1.5);
        for (let i = 0; i < ids.length; i++) {
          offsets.set(ids[i], (i / (ids.length - 1) - 0.5) * totalSpread);
        }
      }
    }

    // Create new arc entities
    for (const line of lines) {
      const offset = offsets.get(line.id) ?? 0;
      const positions = arc3D(line.from, line.to, 60, 150_000, offset);

      const entity = viewer.entities.add({
        name: line.label,
        polyline: {
          positions,
          width: lineWidth(line.cat),
          material: arcMaterial(line.cat),
        },
      });
      arcEntitiesRef.current.push(entity);
    }

    return () => {
      if (!viewer.isDestroyed()) {
        arcEntitiesRef.current.forEach(e => {
          try { viewer.entities.remove(e); } catch { /* already removed */ }
        });
      }
      arcEntitiesRef.current = [];
    };
  }, [viewer, lines]);
}
