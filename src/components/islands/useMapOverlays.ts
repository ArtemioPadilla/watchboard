import { useState, useEffect, useMemo, useRef } from 'react';
import {
  NO_FLY_ZONES,
  GPS_JAMMING_ZONES,
  INTERNET_BLACKOUTS,
  WEATHER_GRID,
  GPS_SEVERITY_COLORS,
  GPS_SEVERITY_ALPHA,
  BLACKOUT_STYLES,
  hexagonLatLngs,
  windDirLabel,
  WIND_ARROWS,
} from './MapOverlayData';

// ────────────────────────────────────────────
//  Types
// ────────────────────────────────────────────

export interface LayerState {
  noFlyZones: boolean;
  gpsJamming: boolean;
  internetBlackout: boolean;
  earthquakes: boolean;
  weather: boolean;
  flights: boolean;
  terminator: boolean;
}

export interface NoFlyOverlay {
  id: string;
  label: string;
  polygon: [number, number][];
  center: [number, number];
  color: string;
}

export interface GpsJammingOverlay {
  id: string;
  label: string;
  hexLatLngs: [number, number][];
  center: [number, number];
  color: string;
  fillAlpha: number;
}

export interface InternetBlackoutOverlay {
  id: string;
  label: string;
  polygon: [number, number][];
  center: [number, number];
  color: string;
  fillAlpha: number;
  outlineAlpha: number;
}

export interface EarthquakeOverlay {
  id: string;
  label: string;
  lat: number;
  lon: number;
  mag: number;
  depth: number;
}

export interface WeatherOverlay {
  label: string;
  lat: number;
  lon: number;
  cloudCover: number;
  windText: string;
}

export interface OverlayData {
  noFlyZones: NoFlyOverlay[];
  gpsJamming: GpsJammingOverlay[];
  internetBlackout: InternetBlackoutOverlay[];
  earthquakes: EarthquakeOverlay[];
  weather: WeatherOverlay[];
}

// ────────────────────────────────────────────
//  Helpers
// ────────────────────────────────────────────

function nextDay(d: string): string {
  const dt = new Date(d + 'T00:00:00Z');
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().split('T')[0];
}

// ────────────────────────────────────────────
//  Hook
// ────────────────────────────────────────────

export function useMapOverlays(layers: LayerState, currentDate: string) {
  const [earthquakes, setEarthquakes] = useState<EarthquakeOverlay[]>([]);
  const lastQuakeDate = useRef('');

  const [weather, setWeather] = useState<WeatherOverlay[]>([]);
  const lastWeatherDate = useRef('');

  // ── No-fly zones (filter by date, flip coords) ──
  const noFlyZones = useMemo<NoFlyOverlay[]>(() => {
    if (!layers.noFlyZones) return [];
    return NO_FLY_ZONES
      .filter(z => currentDate >= z.startDate && (!z.endDate || currentDate <= z.endDate))
      .map(z => ({
        id: z.id,
        label: z.label,
        polygon: z.polygon.map(([lon, lat]) => [lat, lon] as [number, number]),
        center: [z.center[1], z.center[0]] as [number, number],
        color: z.color,
      }));
  }, [layers.noFlyZones, currentDate]);

  // ── GPS jamming (filter by date, compute hexagons) ──
  const gpsJamming = useMemo<GpsJammingOverlay[]>(() => {
    if (!layers.gpsJamming) return [];
    return GPS_JAMMING_ZONES
      .filter(z => currentDate >= z.startDate && (!z.endDate || currentDate <= z.endDate))
      .map(z => ({
        id: z.id,
        label: `${z.label}${z.source ? ` (${z.source})` : ''}`,
        hexLatLngs: hexagonLatLngs(z.center[0], z.center[1], z.radiusKm),
        center: [z.center[1], z.center[0]] as [number, number],
        color: GPS_SEVERITY_COLORS[z.severity] || '#ff4444',
        fillAlpha: GPS_SEVERITY_ALPHA[z.severity] || 0.12,
      }));
  }, [layers.gpsJamming, currentDate]);

  // ── Internet blackout (filter by date, flip coords) ──
  const internetBlackout = useMemo<InternetBlackoutOverlay[]>(() => {
    if (!layers.internetBlackout) return [];
    return INTERNET_BLACKOUTS
      .filter(z => currentDate >= z.startDate && (!z.endDate || currentDate <= z.endDate))
      .map(z => {
        const style = BLACKOUT_STYLES[z.severity] || BLACKOUT_STYLES.partial;
        return {
          id: z.id,
          label: `${z.label}${z.source ? ` (${z.source})` : ''}`,
          polygon: z.polygon.map(([lon, lat]) => [lat, lon] as [number, number]),
          center: [z.center[1], z.center[0]] as [number, number],
          color: style.color,
          fillAlpha: style.fillAlpha,
          outlineAlpha: style.outlineAlpha,
        };
      });
  }, [layers.internetBlackout, currentDate]);

  // ── Earthquake fetching (USGS FDSNWS) ──
  useEffect(() => {
    if (!layers.earthquakes) {
      setEarthquakes([]);
      return;
    }
    if (currentDate === lastQuakeDate.current && earthquakes.length > 0) return;

    const url =
      `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson` +
      `&starttime=${currentDate}&endtime=${nextDay(currentDate)}` +
      `&minmagnitude=2.5&minlatitude=12&maxlatitude=42&minlongitude=24&maxlongitude=65`;

    fetch(url)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (!data?.features) return;
        const quakes: EarthquakeOverlay[] = data.features.map((f: any) => ({
          id: f.id as string,
          label: `M${(f.properties.mag as number)?.toFixed(1)} - ${f.properties.place as string}`,
          lat: f.geometry.coordinates[1] as number,
          lon: f.geometry.coordinates[0] as number,
          mag: (f.properties.mag as number) || 0,
          depth: (f.geometry.coordinates[2] as number) || 0,
        }));
        setEarthquakes(quakes);
        lastQuakeDate.current = currentDate;
      })
      .catch(() => {
        /* network errors are non-fatal */
      });
  }, [layers.earthquakes, currentDate]);

  // ── Weather fetching (Open-Meteo archive API) ──
  useEffect(() => {
    if (!layers.weather) {
      setWeather([]);
      return;
    }
    if (currentDate === lastWeatherDate.current && weather.length > 0) return;

    const lats = WEATHER_GRID.map(p => p.lat).join(',');
    const lons = WEATHER_GRID.map(p => p.lon).join(',');
    const url =
      `https://archive-api.open-meteo.com/v1/archive` +
      `?latitude=${lats}&longitude=${lons}` +
      `&start_date=${currentDate}&end_date=${currentDate}` +
      `&hourly=cloudcover,windspeed_10m,winddirection_10m&timezone=UTC`;

    fetch(url)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (!data) return;
        // Open-Meteo returns an array for multi-location queries, or a single object for one
        const results: any[] = Array.isArray(data) ? data : [data];
        const points: WeatherOverlay[] = [];
        for (let i = 0; i < Math.min(results.length, WEATHER_GRID.length); i++) {
          const r = results[i];
          const grid = WEATHER_GRID[i];
          if (!r?.hourly) continue;
          const hourIdx = 12; // noon UTC
          const cloudCover = (r.hourly.cloudcover?.[hourIdx] as number) ?? 0;
          const windSpeed = (r.hourly.windspeed_10m?.[hourIdx] as number) ?? 0;
          const windDir = (r.hourly.winddirection_10m?.[hourIdx] as number) ?? 0;
          const dir = windDirLabel(windDir);
          const arrow = WIND_ARROWS[dir] || '';
          points.push({
            label: grid.label,
            lat: grid.lat,
            lon: grid.lon,
            cloudCover,
            windText: `${arrow} ${Math.round(windSpeed)} km/h`,
          });
        }
        setWeather(points);
        lastWeatherDate.current = currentDate;
      })
      .catch(() => {
        /* network errors are non-fatal */
      });
  }, [layers.weather, currentDate]);

  // ── Counts for layer toggles ──
  // Flights and terminator counts are managed externally (useMapFlights / useTerminator)
  // so we pass 0 here; IntelMap overrides them before passing to MapLayerToggles.
  const counts: Record<keyof LayerState, number> = {
    noFlyZones: noFlyZones.length,
    gpsJamming: gpsJamming.length,
    internetBlackout: internetBlackout.length,
    earthquakes: earthquakes.length,
    weather: weather.length,
    flights: 0,
    terminator: 0,
  };

  return {
    overlays: { noFlyZones, gpsJamming, internetBlackout, earthquakes, weather } as OverlayData,
    counts,
  };
}
