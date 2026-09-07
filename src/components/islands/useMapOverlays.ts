import { useMemo } from 'react';
import { useLiveSource } from '../../lib/use-live-source';
import type { LiveStatus } from '../../lib/live-source';
import {
  usgsUrl, parseUsgs, openMeteoUrl, parseOpenMeteo, weatherGridFromBounds, trackerBbox,
  type Earthquake, type WeatherReading, type WeatherGridPoint,
} from '../../lib/geo-sources';
import {
  NO_FLY_ZONES,
  GPS_JAMMING_ZONES,
  INTERNET_BLACKOUTS,
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
  factCards: boolean;
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
//  Hook
// ────────────────────────────────────────────

export interface MapOverlayGeo {
  bounds?: { lonMin: number; lonMax: number; latMin: number; latMax: number } | null;
  center?: { lon: number; lat: number } | null;
  weatherPoints?: WeatherGridPoint[] | null;
}

export type OverlayStatuses = Partial<Record<keyof LayerState, { status: LiveStatus; updatedAt: number | null; error?: string }>>;

export function useMapOverlays(layers: LayerState, currentDate: string, geo: MapOverlayGeo = {}) {
  const bbox = useMemo(() => trackerBbox(geo.bounds, geo.center), [geo.bounds, geo.center]);

  // ── No-fly zones (filter by date, flip coords) ──
  const noFlyZones = useMemo<NoFlyOverlay[]>(() => {
    if (!layers.noFlyZones) return [];
    return NO_FLY_ZONES
      .filter(z => currentDate >= z.startDate && (!z.endDate || currentDate <= z.endDate))
      .map(z => ({
        id: z.id,
        label: z.label.replace(/\n/g, ' '),
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
        label: `${z.label.replace(/\n/g, ' ')}${z.source ? ` (${z.source})` : ''}`,
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
          label: `${z.label.replace(/\n/g, ' ')}${z.source ? ` (${z.source})` : ''}`,
          polygon: z.polygon.map(([lon, lat]) => [lat, lon] as [number, number]),
          center: [z.center[1], z.center[0]] as [number, number],
          color: style.color,
          fillAlpha: style.fillAlpha,
          outlineAlpha: style.outlineAlpha,
        };
      });
  }, [layers.internetBlackout, currentDate]);

  // ── Earthquakes (USGS FDSNWS) via the shared live-source cache ──
  const quakeSpec = {
    key: `quakes:${currentDate}:${bbox ? `${bbox.latMin},${bbox.latMax},${bbox.lonMin},${bbox.lonMax}` : 'world'}`,
    url: usgsUrl(currentDate, bbox),
    ttlMs: 5 * 60_000,
    parse: async (res: Response) => parseUsgs(await res.json()),
    isEmpty: () => false, // a quiet day is data, not an outage
  };
  const quakes = useLiveSource<Earthquake[]>(quakeSpec, { enabled: layers.earthquakes });
  const earthquakes = useMemo<EarthquakeOverlay[]>(() => {
    if (!layers.earthquakes || !quakes.data) return [];
    return quakes.data.map(q => ({
      id: q.id,
      label: `M${q.mag.toFixed(1)} - ${q.place}`,
      lat: q.lat,
      lon: q.lon,
      mag: q.mag,
      depth: q.depth,
    }));
  }, [layers.earthquakes, quakes.data]);

  // ── Weather (Open-Meteo archive) on the tracker's grid ──
  const grid = useMemo<WeatherGridPoint[]>(() => {
    if (geo.weatherPoints && geo.weatherPoints.length > 0) return geo.weatherPoints;
    return bbox ? weatherGridFromBounds(bbox) : [];
  }, [geo.weatherPoints, bbox]);
  const gridKey = grid.map(p => `${p.lat},${p.lon}`).join(';');
  const weatherSpec = grid.length > 0
    ? {
        key: `weather:${currentDate}:${gridKey}`,
        url: openMeteoUrl(grid, currentDate),
        ttlMs: 60 * 60_000,
        parse: async (res: Response) => parseOpenMeteo(await res.json(), grid),
      }
    : null;
  const wx = useLiveSource<WeatherReading[]>(weatherSpec, { enabled: layers.weather });
  const weather = useMemo<WeatherOverlay[]>(() => {
    if (!layers.weather || !wx.data) return [];
    return wx.data.map(r => ({
      label: r.label,
      lat: r.lat,
      lon: r.lon,
      cloudCover: r.cloudCover,
      windText: `${WIND_ARROWS[windDirLabel(r.windDir)] || ''} ${Math.round(r.windSpeed)} km/h`,
    }));
  }, [layers.weather, wx.data]);

  const statuses: OverlayStatuses = {
    earthquakes: layers.earthquakes ? { status: quakes.status, updatedAt: quakes.updatedAt, error: quakes.error } : undefined,
    weather: layers.weather ? { status: wx.status, updatedAt: wx.updatedAt, error: wx.error } : undefined,
  };

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
    factCards: 0,
  };

  return {
    overlays: { noFlyZones, gpsJamming, internetBlackout, earthquakes, weather } as OverlayData,
    counts,
    statuses,
  };
}
