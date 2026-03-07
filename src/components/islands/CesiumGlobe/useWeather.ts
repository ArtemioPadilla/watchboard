import { useState, useEffect, useRef } from 'react';
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

interface WeatherPoint {
  lat: number;
  lon: number;
  label: string;
  cloudCover: number;   // 0-100
  windSpeed: number;    // km/h
  windDir: number;      // degrees
}

// Key theater locations for weather grid
const WEATHER_GRID = [
  { lat: 35.69, lon: 51.39, label: 'Tehran' },
  { lat: 32.65, lon: 51.68, label: 'Isfahan' },
  { lat: 30.28, lon: 57.07, label: 'Kerman' },
  { lat: 33.51, lon: 51.73, label: 'Natanz' },
  { lat: 33.32, lon: 44.37, label: 'Baghdad' },
  { lat: 29.38, lon: 47.99, label: 'Kuwait City' },
  { lat: 26.07, lon: 50.56, label: 'Bahrain' },
  { lat: 25.29, lon: 51.53, label: 'Doha' },
  { lat: 25.20, lon: 55.27, label: 'Dubai' },
  { lat: 24.47, lon: 54.37, label: 'Abu Dhabi' },
  { lat: 26.50, lon: 56.50, label: 'Hormuz' },
  { lat: 38.07, lon: 46.30, label: 'Tabriz' },
  { lat: 29.62, lon: 52.53, label: 'Shiraz' },
  { lat: 36.30, lon: 59.60, label: 'Mashhad' },
];

const WIND_ARROWS: Record<string, string> = {
  N: '\u2191', NE: '\u2197', E: '\u2192', SE: '\u2198',
  S: '\u2193', SW: '\u2199', W: '\u2190', NW: '\u2196',
};

function windDirLabel(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(deg / 45) % 8];
}

/** Fetch historical weather from Open-Meteo archive API */
export function useWeather(
  viewer: CesiumViewer | null,
  enabled: boolean,
  currentDate?: string,
) {
  const [count, setCount] = useState(0);
  const entitiesRef = useRef<Entity[]>([]);
  const lastFetchedDate = useRef<string>('');

  useEffect(() => {
    if (!enabled || !viewer) return;

    const dateStr = currentDate || new Date().toISOString().split('T')[0];
    if (dateStr === lastFetchedDate.current && entitiesRef.current.length > 0) return;

    const fetchWeather = async () => {
      try {
        if (viewer.isDestroyed()) return;

        const lats = WEATHER_GRID.map(p => p.lat).join(',');
        const lons = WEATHER_GRID.map(p => p.lon).join(',');

        const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lats}&longitude=${lons}&start_date=${dateStr}&end_date=${dateStr}&hourly=cloudcover,windspeed_10m,winddirection_10m&timezone=UTC`;

        const res = await fetch(url);
        if (!res.ok || viewer.isDestroyed()) return;

        const data = await res.json();
        if (viewer.isDestroyed()) return;

        // Clean old entities
        entitiesRef.current.forEach(e => {
          try { viewer.entities.remove(e); } catch { /* ok */ }
        });
        entitiesRef.current = [];

        // Open-Meteo returns array of results for multi-location queries
        const results = Array.isArray(data) ? data : [data];

        const weatherPoints: WeatherPoint[] = [];

        for (let i = 0; i < Math.min(results.length, WEATHER_GRID.length); i++) {
          const r = results[i];
          const grid = WEATHER_GRID[i];
          if (!r?.hourly) continue;

          // Use noon (12:00) values
          const hourIdx = 12;
          const cloudCover = r.hourly.cloudcover?.[hourIdx] ?? 0;
          const windSpeed = r.hourly.windspeed_10m?.[hourIdx] ?? 0;
          const windDir = r.hourly.winddirection_10m?.[hourIdx] ?? 0;

          weatherPoints.push({
            lat: grid.lat,
            lon: grid.lon,
            label: grid.label,
            cloudCover,
            windSpeed,
            windDir,
          });
        }

        // Render weather entities
        for (const wp of weatherPoints) {
          // Cloud cover ellipse
          if (wp.cloudCover > 15) {
            const opacity = Math.min(wp.cloudCover / 100, 0.5) * 0.4;
            const cloudEntity = viewer.entities.add({
              position: Cartesian3.fromDegrees(wp.lon, wp.lat, 5000),
              ellipse: {
                semiMajorAxis: 80_000 + wp.cloudCover * 400,
                semiMinorAxis: 60_000 + wp.cloudCover * 300,
                material: Color.WHITE.withAlpha(opacity),
                height: 5000,
                outline: false,
              },
            });
            entitiesRef.current.push(cloudEntity);
          }

          // Wind + weather label
          const dir = windDirLabel(wp.windDir);
          const arrow = WIND_ARROWS[dir] || '';
          const windLabel = viewer.entities.add({
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
          });
          entitiesRef.current.push(windLabel);
        }

        lastFetchedDate.current = dateStr;
        setCount(weatherPoints.length);
      } catch (err) {
        console.warn('Failed to fetch weather data:', err);
      }
    };

    fetchWeather();

    return () => {
      if (!viewer.isDestroyed()) {
        entitiesRef.current.forEach(e => {
          try { viewer.entities.remove(e); } catch { /* ok */ }
        });
      }
      entitiesRef.current = [];
      setCount(0);
    };
  }, [enabled, viewer, currentDate]);

  return { count };
}
