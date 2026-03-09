import { useState, useEffect, useRef, useCallback } from 'react';

// ────────────────────────────────────────────
//  Types
// ────────────────────────────────────────────

export interface FlightData {
  icao24: string;
  callsign: string;
  country: string;
  lat: number;
  lon: number;
  altitude: number;
  velocity: number;
  heading: number;
  isMilitary: boolean;
}

// ────────────────────────────────────────────
//  Military callsign patterns
// ────────────────────────────────────────────

const MILITARY_PATTERNS: RegExp[] = [
  /^RCH/i, /^DUKE/i, /^ETHYL/i, /^TOPCAT/i, /^NAVY/i, /^EVAC/i,
  /^RRR/i, /^JAKE/i, /^DOOM/i, /^DEATH/i, /^FORTE/i, /^HOMER/i,
  /^LAGR/i, /^IAF/i, /^ISR/i,
];

function isMilitaryCallsign(callsign: string): boolean {
  const trimmed = callsign.trim();
  return MILITARY_PATTERNS.some(p => p.test(trimmed));
}

// ────────────────────────────────────────────
//  Constants
// ────────────────────────────────────────────

const OPENSKY_URL =
  'https://opensky-network.org/api/states/all?lamin=12&lamax=42&lomin=24&lomax=65';
const POLL_INTERVAL_MS = 15_000;
const MAX_BACKOFF_MS = 120_000;
const METERS_TO_FEET = 3.28084;
const MPS_TO_KNOTS = 1.94384;

// ────────────────────────────────────────────
//  Hook
// ────────────────────────────────────────────

/**
 * Polls the OpenSky Network API for live flights in the theater.
 * Only active when `enabled` is true AND we are at the latest date.
 */
export function useMapFlights(enabled: boolean, isLatestDate: boolean) {
  const [flights, setFlights] = useState<FlightData[]>([]);
  const backoffRef = useRef(POLL_INTERVAL_MS);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const fetchFlights = useCallback(async () => {
    if (!mountedRef.current) return;

    try {
      const response = await fetch(OPENSKY_URL);

      if (response.status === 429) {
        // Rate limited -- exponential backoff
        backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);
        return;
      }

      if (!response.ok) return;

      const data = await response.json();
      if (!data?.states) {
        setFlights([]);
        return;
      }

      const parsed: FlightData[] = [];
      for (const state of data.states) {
        const lon = state[5] as number | null;
        const lat = state[6] as number | null;
        const onGround = state[8] as boolean;
        const callsign = ((state[1] as string) || '').trim();

        if (onGround || lon == null || lat == null) continue;

        parsed.push({
          icao24: state[0] as string,
          callsign,
          country: (state[2] as string) || '',
          lat,
          lon,
          altitude: Math.round(((state[7] as number) || 0) * METERS_TO_FEET),
          velocity: Math.round(((state[9] as number) || 0) * MPS_TO_KNOTS),
          heading: (state[10] as number) || 0,
          isMilitary: isMilitaryCallsign(callsign),
        });
      }

      if (mountedRef.current) {
        setFlights(parsed);
        // Reset backoff on success
        backoffRef.current = POLL_INTERVAL_MS;
      }
    } catch {
      // Network error -- increase backoff
      backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    if (!enabled || !isLatestDate) {
      setFlights([]);
      return;
    }

    // Initial fetch
    fetchFlights();

    // Set up polling with dynamic backoff
    function scheduleNext() {
      timerRef.current = setTimeout(async () => {
        await fetchFlights();
        if (mountedRef.current && enabled && isLatestDate) {
          scheduleNext();
        }
      }, backoffRef.current);
    }

    scheduleNext();

    return () => {
      mountedRef.current = false;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [enabled, isLatestDate, fetchFlights]);

  return { flights, flightCount: flights.length };
}
