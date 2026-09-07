import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Cartesian3,
  Color,
  VerticalOrigin,
  HorizontalOrigin,
  LabelStyle,
  NearFarScalar,
  DistanceDisplayCondition,
  type Viewer as CesiumViewer,
  type Entity,
} from 'cesium';
import { useLiveSource } from '../../../lib/use-live-source';
import {
  openMeteoUrl, parseOpenMeteo, weatherGridFromBounds, windDirLabel, WIND_ARROWS,
  type WeatherGridPoint, type WeatherReading,
} from '../../../lib/geo-sources';
import type { Bbox } from '../../../lib/flights-source';

const WEATHER_TTL_MS = 60 * 60_000;

/**
 * Historical weather (Open-Meteo archive) on a grid derived from the
 * tracker's bounds, or on the points the tracker declares in
 * `globe.weatherPoints`. Nothing is hard-coded to one theatre any more.
 */
export function useWeather(
  viewer: CesiumViewer | null,
  enabled: boolean,
  currentDate?: string,
  bbox?: Bbox | null,
  points?: WeatherGridPoint[] | null,
) {
  const [count, setCount] = useState(0);
  const entitiesRef = useRef<Entity[]>([]);

  const grid = useMemo<WeatherGridPoint[]>(() => {
    if (points && points.length > 0) return points;
    if (bbox) return weatherGridFromBounds(bbox);
    return [];
  }, [points, bbox]);

  const dateStr = currentDate || new Date().toISOString().split('T')[0];
  const gridKey = grid.map(p => `${p.lat},${p.lon}`).join(';');
  const spec = grid.length > 0
    ? {
        key: `weather:${dateStr}:${gridKey}`,
        url: openMeteoUrl(grid, dateStr),
        ttlMs: WEATHER_TTL_MS,
        parse: async (res: Response) => parseOpenMeteo(await res.json(), grid),
      }
    : null;
  const { data, status, updatedAt, error } = useLiveSource<WeatherReading[]>(spec, { enabled: enabled && !!viewer });

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
    for (const wp of data) {
      if (wp.cloudCover > 15) {
        const opacity = Math.min(wp.cloudCover / 100, 0.5) * 0.4;
        entitiesRef.current.push(viewer.entities.add({
          position: Cartesian3.fromDegrees(wp.lon, wp.lat, 5000),
          ellipse: {
            semiMajorAxis: 80_000 + wp.cloudCover * 400,
            semiMinorAxis: 60_000 + wp.cloudCover * 300,
            material: Color.WHITE.withAlpha(opacity),
            height: 5000,
            outline: false,
          },
        }));
      }
      const arrow = WIND_ARROWS[windDirLabel(wp.windDir)] || '';
      entitiesRef.current.push(viewer.entities.add({
        position: Cartesian3.fromDegrees(wp.lon, wp.lat, 8000),
        label: {
          text: `${arrow} ${Math.round(wp.windSpeed)} km/h`,
          font: "9px 'JetBrains Mono', monospace",
          fillColor: Color.fromCssColorString('#88ccff').withAlpha(0.7),
          outlineColor: Color.BLACK,
          outlineWidth: 2,
          style: LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: VerticalOrigin.CENTER,
          horizontalOrigin: HorizontalOrigin.CENTER,
          scaleByDistance: new NearFarScalar(5e4, 0.8, 3e6, 0.3),
          distanceDisplayCondition: new DistanceDisplayCondition(0, 3e6),
        },
      }));
    }
    setCount(data.length);
    return clear;
  }, [viewer, enabled, data]);

  return { count, status: enabled ? status : 'idle' as const, updatedAt, error };
}
