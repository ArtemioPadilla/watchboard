import { useState, useEffect, useRef } from 'react';
import {
  Cartesian3,
  Color,
  type Viewer as CesiumViewer,
  type Entity,
} from 'cesium';

interface Earthquake {
  id: string;
  mag: number;
  place: string;
  time: number;
  lon: number;
  lat: number;
  depth: number;
}

function nextDay(date: string): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().split('T')[0];
}

/** Fetch seismic data — synced to timeline date via USGS FDSNWS */
export function useEarthquakes(
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

    // Don't re-fetch if same date
    if (dateStr === lastFetchedDate.current && entitiesRef.current.length > 0) return;

    const fetchQuakes = async () => {
      try {
        if (viewer.isDestroyed()) return;

        // Use FDSNWS historical query when we have a date, otherwise use live feed
        const url = currentDate
          ? `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=${dateStr}&endtime=${nextDay(dateStr)}&minmagnitude=2.5&minlatitude=12&maxlatitude=42&minlongitude=24&maxlongitude=65`
          : 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson';

        const res = await fetch(url);
        if (!res.ok || viewer.isDestroyed()) return;

        const data = await res.json();
        if (viewer.isDestroyed()) return;

        const quakes: Earthquake[] = data.features.map((f: any) => ({
          id: f.id,
          mag: f.properties.mag,
          place: f.properties.place,
          time: f.properties.time,
          lon: f.geometry.coordinates[0],
          lat: f.geometry.coordinates[1],
          depth: f.geometry.coordinates[2],
        }));

        // Remove old entities
        entitiesRef.current.forEach(e => {
          try { viewer.entities.remove(e); } catch { /* ok */ }
        });
        entitiesRef.current = [];

        // Add new entities
        quakes.forEach(q => {
          const size = Math.max(4, q.mag * 3);
          const depthNorm = Math.min(q.depth / 300, 1);
          const color = Color.fromHsl(0.08 * depthNorm, 0.9, 0.5, 0.8);

          const entity = viewer.entities.add({
            name: `M${q.mag.toFixed(1)} - ${q.place}`,
            position: Cartesian3.fromDegrees(q.lon, q.lat, 0),
            point: {
              pixelSize: size,
              color,
              outlineColor: color.withAlpha(0.3),
              outlineWidth: 2,
            },
          });
          entitiesRef.current.push(entity);
        });

        lastFetchedDate.current = dateStr;
        setCount(quakes.length);
      } catch (err) {
        console.warn('Failed to fetch earthquake data:', err);
      }
    };

    fetchQuakes();

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
