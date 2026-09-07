import { useState, useEffect, useRef } from 'react';
import {
  Cartesian3,
  Color,
  VerticalOrigin,
  HorizontalOrigin,
  type Viewer as CesiumViewer,
  type Entity,
} from 'cesium';
import { getIconDataUri } from './cesium-icons';
import { useLiveSource } from '../../../lib/use-live-source';
import { usgsUrl, parseUsgs, type Earthquake } from '../../../lib/geo-sources';
import type { Bbox } from '../../../lib/flights-source';

const QUAKES_TTL_MS = 5 * 60_000;

/**
 * Seismic events for the timeline date, inside the tracker's bounds.
 * On upstream failure the previous day's entities stay on screen and the
 * layer reports `stale`/`error`; it never silently empties.
 */
export function useEarthquakes(
  viewer: CesiumViewer | null,
  enabled: boolean,
  currentDate?: string,
  bbox?: Bbox | null,
) {
  const [count, setCount] = useState(0);
  const entitiesRef = useRef<Entity[]>([]);

  const dateStr = currentDate || new Date().toISOString().split('T')[0];
  const spec = {
    key: `quakes:${dateStr}:${bbox ? `${bbox.latMin},${bbox.latMax},${bbox.lonMin},${bbox.lonMax}` : 'world'}`,
    url: usgsUrl(dateStr, bbox ?? null),
    ttlMs: QUAKES_TTL_MS,
    parse: async (res: Response) => parseUsgs(await res.json()),
    // An empty day is a legitimate answer, not an outage.
    isEmpty: () => false,
  };
  const { data, status, updatedAt, error } = useLiveSource<Earthquake[]>(spec, { enabled: enabled && !!viewer });

  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;
    const clear = () => {
      entitiesRef.current.forEach(e => { try { viewer.entities.remove(e); } catch { /* ok */ } });
      entitiesRef.current = [];
    };
    if (!enabled || !data) {
      clear();
      setCount(0);
      return;
    }
    clear();
    for (const q of data) {
      const bbSize = Math.max(12, q.mag * 6);
      const depthNorm = Math.min(q.depth / 300, 1);
      const color = Color.fromHsl(0.08 * depthNorm, 0.9, 0.5, 0.8);
      const entity = viewer.entities.add({
        name: `M${q.mag.toFixed(1)} - ${q.place}`,
        position: Cartesian3.fromDegrees(q.lon, q.lat, 0),
        billboard: {
          image: getIconDataUri('earthquake'),
          width: bbSize,
          height: bbSize,
          color,
          verticalOrigin: VerticalOrigin.CENTER,
          horizontalOrigin: HorizontalOrigin.CENTER,
        },
      });
      entitiesRef.current.push(entity);
    }
    setCount(data.length);
    return clear;
  }, [viewer, enabled, data]);

  return { count, status: enabled ? status : 'idle' as const, updatedAt, error };
}
