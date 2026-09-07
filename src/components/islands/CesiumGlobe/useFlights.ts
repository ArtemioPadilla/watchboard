import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Cartesian2,
  Cartesian3,
  Color,
  Math as CesiumMath,
  NearFarScalar,
  VerticalOrigin,
  HorizontalOrigin,
  LabelStyle,
  DistanceDisplayCondition,
  type Viewer as CesiumViewer,
  type Entity,
} from 'cesium';
import { useLiveSource } from '../../../lib/use-live-source';
import type { LiveStatus } from '../../../lib/live-source';
import {
  parseOpenSky, openSkyUrl, quantizeBbox, padBbox, bboxAround, bboxKey,
  pollIntervalForBbox, FLIGHTS_TTL_MS,
  type Bbox, type FlightRecord,
} from '../../../lib/flights-source';
import { getIconDataUri } from './cesium-icons';

/**
 * Poll cadence. OpenSky's anonymous quota is 400 credits/day and a request
 * costs 1-4 credits by area (≤25 / ≤100 / ≤400 / >400 sq deg). The default
 * theatre camera sees ~900 sq deg (4 credits), so the interval scales with
 * the tier (pollIntervalForBbox: 30 s → 2 min) and the tab-hidden pause in
 * useLiveSource stops the meter when nobody is looking. Rate limiting still
 * degrades to a visible 'rate-limited' status rather than a blank layer.
 */
export { FLIGHTS_POLL_MS } from '../../../lib/flights-source';

export type FlightStatus = LiveStatus;

/** Bbox of what the camera sees, quantised; null when looking at space. */
function viewBbox(viewer: CesiumViewer): Bbox | null {
  const rect = viewer.camera.computeViewRectangle(viewer.scene.globe.ellipsoid);
  if (!rect) return null;
  const b = {
    latMin: CesiumMath.toDegrees(rect.south), latMax: CesiumMath.toDegrees(rect.north),
    lonMin: CesiumMath.toDegrees(rect.west), lonMax: CesiumMath.toDegrees(rect.east),
  };
  // A view spanning more than a hemisphere is "the whole planet"; OpenSky
  // charges 4 credits for that and returns ~10k rows, so cap the request.
  if (b.latMax - b.latMin > 60 || b.lonMax - b.lonMin > 90) return null;
  return quantizeBbox(padBbox(b, 0.1));
}

/**
 * Live flights from OpenSky, drawn where the camera is looking.
 * `fallbackCenter` (the tracker's map centre) is used when the camera view
 * does not intersect the globe or is too wide to be useful.
 */
export function useFlights(
  viewer: CesiumViewer | null,
  enabled: boolean,
  fallbackCenter?: { lat: number; lon: number },
) {
  const [count, setCount] = useState(0);
  const entitiesRef = useRef<Map<string, Entity>>(new Map());
  const trailEntitiesRef = useRef<Map<string, Entity>>(new Map());

  // Bbox follows the camera, debounced, keyed so the cache dedupes.
  const [bbox, setBbox] = useState<Bbox | null>(null);
  const recompute = useCallback(() => {
    if (!viewer || viewer.isDestroyed()) return;
    const next = viewBbox(viewer) ?? (fallbackCenter ? bboxAround(fallbackCenter) : null);
    setBbox(prev => (prev && next && bboxKey(prev) === bboxKey(next) ? prev : next));
  }, [viewer, fallbackCenter]);

  useEffect(() => {
    if (!viewer || !enabled) return;
    recompute();
    let t: ReturnType<typeof setTimeout> | null = null;
    const onMoveEnd = () => { if (t) clearTimeout(t); t = setTimeout(recompute, 400); };
    viewer.camera.moveEnd.addEventListener(onMoveEnd);
    return () => {
      viewer.camera.moveEnd.removeEventListener(onMoveEnd);
      if (t) clearTimeout(t);
    };
  }, [viewer, enabled, recompute]);

  const spec = bbox
    ? {
        key: `flights:${bboxKey(bbox)}`,
        url: openSkyUrl(bbox),
        ttlMs: FLIGHTS_TTL_MS,
        parse: async (res: Response) => parseOpenSky(await res.json()),
        // An empty sky over a bbox is real data (the ocean at night), not a
        // failed refresh: never freeze stale aircraft in its place.
        isEmpty: () => false,
      }
    : null;
  const { data, status, updatedAt, error } = useLiveSource<FlightRecord[]>(spec, {
    enabled: enabled && !!viewer,
    intervalMs: pollIntervalForBbox(bbox),
  });

  // Render whatever the cache holds; stale data stays on screen (marked
  // stale in the HUD) rather than vanishing.
  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;
    if (!enabled || !data) {
      clearEntities();
      return;
    }
    draw(data);
    return undefined;

    function clearEntities() {
      if (!viewer || viewer.isDestroyed()) return;
      entitiesRef.current.forEach(e => { try { viewer.entities.remove(e); } catch { /* ok */ } });
      trailEntitiesRef.current.forEach(e => { try { viewer.entities.remove(e); } catch { /* ok */ } });
      entitiesRef.current.clear();
      trailEntitiesRef.current.clear();
      setCount(0);
    }

    function draw(flights: FlightRecord[]) {
      if (!viewer || viewer.isDestroyed()) return;
      const seenIds = new Set<string>();
      trailEntitiesRef.current.forEach(e => { try { viewer.entities.remove(e); } catch { /* ok */ } });
      trailEntitiesRef.current.clear();

      for (const f of flights) {
        seenIds.add(f.icao24);
        const alt = f.altitude || 10000;
        const pos = Cartesian3.fromDegrees(f.lon, f.lat, alt);
        const isMil = f.isMilitary;
        const cs = f.callsign;
        const rotation = CesiumMath.toRadians(f.heading);
        const alignedAxis = Cartesian3.normalize(pos, new Cartesian3());

        const existing = entitiesRef.current.get(f.icao24);
        if (existing) {
          existing.position = pos as any;
          if (existing.billboard) {
            (existing.billboard.rotation as any) = rotation;
            (existing.billboard.alignedAxis as any) = alignedAxis;
          }
        } else {
          const iconUri = getIconDataUri(isMil ? 'aircraft_mil' : 'aircraft_civ');
          const entity = viewer.entities.add({
            name: `${cs || f.icao24} (${f.country})${isMil ? ' [MIL]' : ''}`,
            description: `Callsign: ${cs || 'N/A'}\nOrigin: ${f.country}\nAltitude: ${Math.round(f.altitude)}m\nSpeed: ${Math.round(f.velocity)} m/s\nHeading: ${Math.round(f.heading)}\u00b0${isMil ? '\nType: MILITARY' : ''}`,
            position: pos,
            billboard: {
              image: iconUri,
              width: isMil ? 26 : 18,
              height: isMil ? 26 : 18,
              rotation,
              alignedAxis,
              scaleByDistance: new NearFarScalar(1e4, 2.0, 5e6, 0.7),
              verticalOrigin: VerticalOrigin.CENTER,
              horizontalOrigin: HorizontalOrigin.CENTER,
            },
            label: isMil && cs ? {
              text: cs,
              font: "10px 'JetBrains Mono', monospace",
              fillColor: Color.fromCssColorString('#ffdd00'),
              outlineColor: Color.BLACK,
              outlineWidth: 2,
              style: LabelStyle.FILL_AND_OUTLINE,
              verticalOrigin: VerticalOrigin.TOP,
              pixelOffset: new Cartesian2(0, 16),
              scaleByDistance: new NearFarScalar(1e4, 1.0, 3e6, 0.3),
              distanceDisplayCondition: new DistanceDisplayCondition(0, 1e7),
            } : undefined,
          });
          entitiesRef.current.set(f.icao24, entity);
        }

        // Heading trail
        const headingRad = CesiumMath.toRadians(f.heading);
        const trailM = isMil ? 40000 : 20000;
        const behindLat = f.lat - (trailM / 111000) * Math.cos(headingRad);
        const behindLon = f.lon - (trailM / (111000 * Math.cos(f.lat * Math.PI / 180))) * Math.sin(headingRad);
        const trailStart = Cartesian3.fromDegrees(behindLon, behindLat, alt);
        const trailColor = isMil
          ? Color.fromCssColorString('#ffdd00').withAlpha(0.35)
          : Color.fromCssColorString('#00aaff').withAlpha(0.18);
        const trailEntity = viewer.entities.add({
          polyline: { positions: [trailStart, pos], width: isMil ? 1.5 : 1.0, material: trailColor },
        });
        trailEntitiesRef.current.set(f.icao24, trailEntity);
      }

      for (const [id, entity] of entitiesRef.current) {
        if (!seenIds.has(id)) {
          viewer.entities.remove(entity);
          entitiesRef.current.delete(id);
        }
      }
      setCount(flights.length);
    }
  }, [viewer, enabled, data]);

  // Cleanup on unmount / viewer change.
  useEffect(() => () => {
    if (viewer && !viewer.isDestroyed()) {
      entitiesRef.current.forEach(e => { try { viewer.entities.remove(e); } catch { /* ok */ } });
      trailEntitiesRef.current.forEach(e => { try { viewer.entities.remove(e); } catch { /* ok */ } });
    }
    entitiesRef.current.clear();
    trailEntitiesRef.current.clear();
  }, [viewer]);

  return { count, status: enabled ? status : ('idle' as LiveStatus), updatedAt, error, bbox };
}
