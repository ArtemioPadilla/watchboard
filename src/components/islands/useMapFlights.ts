import { useMemo } from 'react';
import { useLiveSource } from '../../lib/use-live-source';
import type { LiveStatus } from '../../lib/live-source';
import {
  parseOpenSky, openSkyUrl, quantizeBbox, padBbox, bboxAround, bboxKey, FLIGHTS_TTL_MS, pollIntervalForBbox, type Bbox,
} from '../../lib/flights-source';

// ────────────────────────────────────────────
//  Types
// ────────────────────────────────────────────

export interface FlightData {
  icao24: string;
  callsign: string;
  country: string;
  lat: number;
  lon: number;
  /** Feet. */
  altitude: number;
  /** Knots. */
  velocity: number;
  heading: number;
  isMilitary: boolean;
}

const METERS_TO_FEET = 3.28084;
const MPS_TO_KNOTS = 1.94384;

/**
 * Live flights for the 2D map, within the current Leaflet viewport when the
 * map reports it, else the tracker's bounds (or a 10° box around its centre). Shares the cache, parser and quota discipline with
 * the globe's useFlights via live-source.ts; only active at the latest date.
 */
export function useMapFlights(
  enabled: boolean,
  isLatestDate: boolean,
  bounds?: { lonMin: number; lonMax: number; latMin: number; latMax: number } | null,
  center?: { lon: number; lat: number } | null,
) {
  const bbox: Bbox | null = useMemo(() => {
    if (bounds) return quantizeBbox(padBbox(bounds, 0.1));
    if (center) return bboxAround({ lat: center.lat, lon: center.lon });
    return null;
  }, [bounds, center]);

  const spec = bbox
    ? {
        key: `flights:${bboxKey(bbox)}`,
        url: openSkyUrl(bbox),
        ttlMs: FLIGHTS_TTL_MS,
        parse: async (res: Response) => parseOpenSky(await res.json()),
        isEmpty: () => false,
      }
    : null;
  const active = enabled && isLatestDate;
  const { data, status, updatedAt, error } = useLiveSource(spec, { enabled: active, intervalMs: pollIntervalForBbox(bbox) });

  const flights: FlightData[] = useMemo(() => {
    if (!active || !data) return [];
    return data.map(f => ({
      icao24: f.icao24,
      callsign: f.callsign,
      country: f.country,
      lat: f.lat,
      lon: f.lon,
      altitude: Math.round(f.altitude * METERS_TO_FEET),
      velocity: Math.round(f.velocity * MPS_TO_KNOTS),
      heading: f.heading,
      isMilitary: f.isMilitary,
    }));
  }, [active, data]);

  return { flights, flightCount: flights.length, status: (active ? status : 'idle') as LiveStatus, updatedAt, error };
}
