import { useState, useEffect, useRef } from 'react';
import {
  Cartesian3,
  Color,
  Math as CesiumMath,
  NearFarScalar,
  VerticalOrigin,
  HorizontalOrigin,
  type Viewer as CesiumViewer,
  type Entity,
} from 'cesium';
import { getIconDataUri } from './cesium-icons';

interface FlightState {
  icao24: string;
  callsign: string | null;
  origin_country: string;
  longitude: number | null;
  latitude: number | null;
  baro_altitude: number | null;
  velocity: number | null;
  true_track: number | null;
  on_ground: boolean;
}

/** Military callsign patterns — US/NATO military aircraft often use these prefixes */
const MIL_CALLSIGN_PATTERNS = [
  /^RCH/i,    // USAF AMC (Reach)
  /^DUKE/i,   // USAF tankers
  /^ETHYL/i,  // USAF EW
  /^TOPCAT/i, // US Navy
  /^NAVY/i,   // US Navy
  /^EVAC/i,   // Medevac
  /^RRR/i,    // USAF air refueling
  /^JAKE/i,   // Marine Corps
  /^DOOM/i,   // B-2
  /^DEATH/i,  // Reaper drones
  /^FORTE/i,  // Global Hawk
  /^HOMER/i,  // P-8 Poseidon
  /^LAGR/i,   // C-17 Globemaster
  /^IAF/i,    // Israeli Air Force
  /^ISR/i,    // Israeli
];

function isMilitaryFlight(f: FlightState): boolean {
  if (!f.callsign) return false;
  const cs = f.callsign.trim();
  return MIL_CALLSIGN_PATTERNS.some(p => p.test(cs));
}

/** Fetch live flight data from OpenSky Network (free tier) */
export function useFlights(viewer: CesiumViewer | null, enabled: boolean) {
  const [count, setCount] = useState(0);
  const entitiesRef = useRef<Map<string, Entity>>(new Map());
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => {
    if (!enabled || !viewer) return;

    const fetchFlights = async () => {
      try {
        if (viewer.isDestroyed()) return;

        // Middle East bounding box
        const url =
          'https://opensky-network.org/api/states/all?lamin=12&lamax=42&lomin=24&lomax=65';
        const res = await fetch(url);
        if (!res.ok || viewer.isDestroyed()) return;

        const data = await res.json();
        if (!data.states || viewer.isDestroyed()) return;

        const flights: FlightState[] = data.states.map((s: any[]) => ({
          icao24: s[0],
          callsign: s[1]?.trim() || null,
          origin_country: s[2],
          longitude: s[5],
          latitude: s[6],
          baro_altitude: s[7],
          velocity: s[9],
          true_track: s[10],
          on_ground: s[8],
        }));

        const airborne = flights.filter(
          f => !f.on_ground && f.longitude != null && f.latitude != null,
        );

        // Track which IDs we've seen this update
        const seenIds = new Set<string>();

        airborne.forEach(f => {
          seenIds.add(f.icao24);
          const alt = (f.baro_altitude || 10000) * 1; // meters
          const pos = Cartesian3.fromDegrees(f.longitude!, f.latitude!, alt);
          const isMil = isMilitaryFlight(f);

          const rotation = f.true_track != null
            ? CesiumMath.toRadians(-(f.true_track)) : 0;
          const existing = entitiesRef.current.get(f.icao24);
          if (existing) {
            existing.position = pos as any;
            if (existing.billboard && f.true_track != null) {
              (existing.billboard.rotation as any) = rotation;
            }
          } else {
            const iconUri = getIconDataUri(isMil ? 'aircraft_mil' : 'aircraft_civ');

            const entity = viewer.entities.add({
              name: `${f.callsign || f.icao24} (${f.origin_country})${isMil ? ' [MIL]' : ''}`,
              position: pos,
              billboard: {
                image: iconUri,
                width: isMil ? 18 : 12,
                height: isMil ? 18 : 12,
                rotation,
                alignedAxis: Cartesian3.UNIT_Z,
                scaleByDistance: new NearFarScalar(1e4, 1.5, 5e6, 0.4),
                verticalOrigin: VerticalOrigin.CENTER,
                horizontalOrigin: HorizontalOrigin.CENTER,
              },
            });
            entitiesRef.current.set(f.icao24, entity);
          }
        });

        // Remove stale entities
        for (const [id, entity] of entitiesRef.current) {
          if (!seenIds.has(id)) {
            viewer.entities.remove(entity);
            entitiesRef.current.delete(id);
          }
        }

        setCount(airborne.length);
      } catch (err) {
        console.warn('Failed to fetch flight data:', err);
      }
    };

    fetchFlights();
    intervalRef.current = setInterval(fetchFlights, 15_000); // Every 15s (rate limit friendly)

    return () => {
      clearInterval(intervalRef.current);
      if (!viewer.isDestroyed()) {
        entitiesRef.current.forEach((entity) => {
          try { viewer.entities.remove(entity); } catch { /* already removed */ }
        });
      }
      entitiesRef.current.clear();
      setCount(0);
    };
  }, [enabled, viewer]);

  return { count };
}
