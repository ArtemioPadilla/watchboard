import { useState, useEffect, useRef } from 'react';
import {
  Cartesian3,
  Color,
  NearFarScalar,
  DistanceDisplayCondition,
  VerticalOrigin,
  LabelStyle,
  type Viewer as CesiumViewer,
  type Entity,
} from 'cesium';
import * as satellite from 'satellite.js';

interface SatRecord {
  name: string;
  satrec: satellite.SatRec;
  group: SatGroup;
}

type SatGroup = 'gps' | 'military' | 'recon' | 'comms';

const SAT_GROUPS: { group: SatGroup; url: string; color: string; label: string }[] = [
  {
    group: 'gps',
    url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=gps-ops&FORMAT=tle',
    color: '#00ffcc',
    label: 'GPS/NAVSTAR',
  },
  {
    group: 'military',
    url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=military&FORMAT=tle',
    color: '#ffcc00',
    label: 'Military',
  },
  {
    group: 'recon',
    url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=resource&FORMAT=tle',
    color: '#ff8844',
    label: 'Recon/EO',
  },
];

const GROUP_COLORS: Record<SatGroup, Color> = {
  gps: Color.fromCssColorString('#00ffcc').withAlpha(0.9),
  military: Color.fromCssColorString('#ffcc00').withAlpha(0.9),
  recon: Color.fromCssColorString('#ff8844').withAlpha(0.8),
  comms: Color.fromCssColorString('#00ff88').withAlpha(0.7),
};

function parseTLE(text: string, group: SatGroup): SatRecord[] {
  const lines = text.trim().split('\n');
  const records: SatRecord[] = [];
  for (let i = 0; i < lines.length - 2; i += 3) {
    const name = lines[i].trim();
    const tleLine1 = lines[i + 1].trim();
    const tleLine2 = lines[i + 2].trim();
    if (!tleLine1.startsWith('1') || !tleLine2.startsWith('2')) continue;
    try {
      const satrec = satellite.twoline2satrec(tleLine1, tleLine2);
      records.push({ name, satrec, group });
    } catch {
      // Skip malformed TLE
    }
  }
  return records;
}

/** Fetch military-relevant satellite TLEs and propagate orbits */
export function useSatellites(
  viewer: CesiumViewer | null,
  enabled: boolean,
  simTimeRef?: React.RefObject<number>,
) {
  const [count, setCount] = useState(0);
  const satsRef = useRef<SatRecord[]>([]);
  const entitiesRef = useRef<Entity[]>([]);
  const animRef = useRef<number>(0);
  const fetchedRef = useRef(false);

  // Fetch TLE data from multiple military-relevant groups
  useEffect(() => {
    if (!enabled) {
      fetchedRef.current = false;
      return;
    }
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    const fetchAllGroups = async () => {
      try {
        const results = await Promise.allSettled(
          SAT_GROUPS.map(async g => {
            const res = await fetch(g.url);
            if (!res.ok) return [];
            const text = await res.text();
            return parseTLE(text, g.group);
          }),
        );

        const allSats: SatRecord[] = [];
        for (const r of results) {
          if (r.status === 'fulfilled') allSats.push(...r.value);
        }

        // GPS: keep all (~31 operational). Military + Recon: cap at 50 each for performance.
        const gps = allSats.filter(s => s.group === 'gps');
        const mil = allSats.filter(s => s.group === 'military').slice(0, 50);
        const recon = allSats.filter(s => s.group === 'recon').slice(0, 50);

        satsRef.current = [...gps, ...mil, ...recon];
        setCount(satsRef.current.length);
      } catch (err) {
        console.warn('Failed to fetch TLE data:', err);
      }
    };

    fetchAllGroups();
  }, [enabled]);

  // Propagate positions in animation loop
  useEffect(() => {
    if (!enabled || !viewer || satsRef.current.length === 0) return;

    // Clean up previous entities
    if (!viewer.isDestroyed()) {
      entitiesRef.current.forEach(e => {
        try { viewer.entities.remove(e); } catch { /* already removed */ }
      });
    }
    entitiesRef.current = [];

    if (viewer.isDestroyed()) return;

    // Create entities for each satellite
    satsRef.current.forEach(sat => {
      const color = GROUP_COLORS[sat.group];
      const isGPS = sat.group === 'gps';

      const entity = viewer.entities.add({
        name: `${sat.name} [${sat.group.toUpperCase()}]`,
        point: {
          pixelSize: isGPS ? 5 : sat.group === 'military' ? 4 : 3,
          color,
          outlineColor: color.withAlpha(0.3),
          outlineWidth: isGPS ? 2 : 1,
          scaleByDistance: new NearFarScalar(1e5, 1.2, 5e7, 0.4),
        },
        label: {
          text: isGPS ? sat.name.replace('NAVSTAR ', 'GPS ') : '',
          show: isGPS,
          font: "9px 'JetBrains Mono', monospace",
          fillColor: color,
          outlineColor: Color.BLACK,
          outlineWidth: 2,
          style: LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: VerticalOrigin.BOTTOM,
          pixelOffset: new Cartesian3(0, -8, 0) as any,
          scaleByDistance: new NearFarScalar(1e5, 0.8, 5e7, 0.2),
          distanceDisplayCondition: new DistanceDisplayCondition(0, 2e7),
        },
      });
      entitiesRef.current.push(entity);
    });

    const updatePositions = () => {
      const now = simTimeRef ? new Date(simTimeRef.current) : new Date();
      const gmst = satellite.gstime(now);

      satsRef.current.forEach((sat, i) => {
        const entity = entitiesRef.current[i];
        if (!entity) return;

        try {
          const posVel = satellite.propagate(sat.satrec, now);
          if (!posVel || typeof posVel.position === 'boolean' || !posVel.position) return;

          const geodetic = satellite.eciToGeodetic(posVel.position as satellite.EciVec3<number>, gmst);
          const lon = satellite.degreesLong(geodetic.longitude);
          const lat = satellite.degreesLat(geodetic.latitude);
          const alt = geodetic.height * 1000; // km to m

          entity.position = Cartesian3.fromDegrees(lon, lat, alt) as any;
        } catch {
          // Propagation failed for this satellite
        }
      });

      if (!viewer.isDestroyed()) {
        animRef.current = requestAnimationFrame(updatePositions);
      }
    };

    animRef.current = requestAnimationFrame(updatePositions);

    return () => {
      cancelAnimationFrame(animRef.current);
      if (!viewer.isDestroyed()) {
        entitiesRef.current.forEach(e => {
          try { viewer.entities.remove(e); } catch { /* already removed */ }
        });
      }
      entitiesRef.current = [];
    };
  }, [enabled, viewer, count]);

  return { count };
}
