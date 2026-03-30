import { useState, useEffect, useRef } from 'react';
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

export type FlightStatus = 'idle' | 'loading' | 'ok' | 'rate-limited' | 'error';

/** Fetch live flight data from OpenSky Network (free tier) with backoff */
export function useFlights(viewer: CesiumViewer | null, enabled: boolean) {
  const [count, setCount] = useState(0);
  const [status, setStatus] = useState<FlightStatus>('idle');
  const entitiesRef = useRef<Map<string, Entity>>(new Map());
  const trailEntitiesRef = useRef<Map<string, Entity>>(new Map());
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const backoffRef = useRef(15_000);
  const consecutiveFailsRef = useRef(0);

  useEffect(() => {
    if (!enabled || !viewer) {
      setStatus('idle');
      return;
    }
    let disposed = false;

    const scheduleNext = () => {
      if (disposed) return;
      timerRef.current = setTimeout(fetchFlights, backoffRef.current);
    };

    const fetchFlights = async () => {
      if (disposed || viewer.isDestroyed()) return;
      setStatus('loading');

      try {
        // Middle East bounding box
        const url =
          'https://opensky-network.org/api/states/all?lamin=12&lamax=42&lomin=24&lomax=65';
        const res = await fetch(url);
        if (disposed || viewer.isDestroyed()) return;

        if (res.status === 429) {
          consecutiveFailsRef.current++;
          backoffRef.current = Math.min(
            15_000 * Math.pow(2, consecutiveFailsRef.current),
            120_000,
          );
          console.warn(`OpenSky 429 — retry in ${Math.round(backoffRef.current / 1000)}s`);
          setStatus('rate-limited');
          scheduleNext();
          return;
        }

        if (!res.ok) {
          consecutiveFailsRef.current++;
          backoffRef.current = Math.min(30_000 * consecutiveFailsRef.current, 120_000);
          setStatus('error');
          scheduleNext();
          return;
        }

        const data = await res.json();
        if (!data.states || disposed || viewer.isDestroyed()) {
          scheduleNext();
          return;
        }

        // Reset backoff on success
        consecutiveFailsRef.current = 0;
        backoffRef.current = 15_000;

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

        // Remove old trail entities (recreated each cycle)
        trailEntitiesRef.current.forEach(e => {
          try { viewer.entities.remove(e); } catch { /* ok */ }
        });
        trailEntitiesRef.current.clear();

        airborne.forEach(f => {
          seenIds.add(f.icao24);
          const alt = (f.baro_altitude || 10000) * 1; // meters
          const pos = Cartesian3.fromDegrees(f.longitude!, f.latitude!, alt);
          const isMil = isMilitaryFlight(f);
          const cs = f.callsign?.trim() || '';

          const rotation = f.true_track != null
            ? CesiumMath.toRadians(-(f.true_track)) : 0;
          // Compute aligned axis from position for geographic heading
          const alignedAxis = Cartesian3.normalize(pos, new Cartesian3());

          const existing = entitiesRef.current.get(f.icao24);
          if (existing) {
            existing.position = pos as any;
            if (existing.billboard) {
              if (f.true_track != null) {
                (existing.billboard.rotation as any) = rotation;
              }
              (existing.billboard.alignedAxis as any) = alignedAxis;
            }
          } else {
            const iconUri = getIconDataUri(isMil ? 'aircraft_mil' : 'aircraft_civ');

            const entity = viewer.entities.add({
              name: `${cs || f.icao24} (${f.origin_country})${isMil ? ' [MIL]' : ''}`,
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

          // Heading trail line for all flights
          if (f.true_track != null) {
            const headingRad = CesiumMath.toRadians(f.true_track);
            const trailM = isMil ? 40000 : 20000;
            const behindLat = f.latitude! - (trailM / 111000) * Math.cos(headingRad);
            const behindLon = f.longitude! - (trailM / (111000 * Math.cos(f.latitude! * Math.PI / 180))) * Math.sin(headingRad);
            const trailStart = Cartesian3.fromDegrees(behindLon, behindLat, alt);

            const trailColor = isMil
              ? Color.fromCssColorString('#ffdd00').withAlpha(0.35)
              : Color.fromCssColorString('#00aaff').withAlpha(0.18);

            const trailEntity = viewer.entities.add({
              polyline: {
                positions: [trailStart, pos],
                width: isMil ? 1.5 : 1.0,
                material: trailColor,
              },
            });
            trailEntitiesRef.current.set(f.icao24, trailEntity);
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
        setStatus('ok');
      } catch (err) {
        console.warn('Failed to fetch flight data:', err);
        consecutiveFailsRef.current++;
        backoffRef.current = Math.min(30_000 * consecutiveFailsRef.current, 120_000);
        setStatus('error');
      }

      scheduleNext();
    };

    fetchFlights();

    return () => {
      disposed = true;
      clearTimeout(timerRef.current);
      if (!viewer.isDestroyed()) {
        entitiesRef.current.forEach((entity) => {
          try { viewer.entities.remove(entity); } catch { /* already removed */ }
        });
        trailEntitiesRef.current.forEach((entity) => {
          try { viewer.entities.remove(entity); } catch { /* ok */ }
        });
      }
      entitiesRef.current.clear();
      trailEntitiesRef.current.clear();
      setCount(0);
    };
  }, [enabled, viewer]);

  return { count, status };
}
