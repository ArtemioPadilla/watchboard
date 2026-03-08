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

export type SatGroup = 'gps' | 'military' | 'recon' | 'starlink' | 'geo' | 'gnss';

export interface SatGroupInfo {
  group: SatGroup;
  url: string;
  color: string;
  label: string;
}

export const SAT_GROUPS: SatGroupInfo[] = [
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
  {
    group: 'starlink',
    url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=tle',
    color: '#ffffff',
    label: 'Starlink',
  },
  {
    group: 'geo',
    url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=geo&FORMAT=tle',
    color: '#ff44ff',
    label: 'GEO/Defense',
  },
  {
    group: 'gnss',
    url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=gnss&FORMAT=tle',
    color: '#44ff44',
    label: 'GNSS',
  },
];

export const GROUP_COLORS: Record<SatGroup, Color> = {
  gps: Color.fromCssColorString('#00ffcc').withAlpha(0.9),
  military: Color.fromCssColorString('#ffcc00').withAlpha(0.9),
  recon: Color.fromCssColorString('#ff8844').withAlpha(0.8),
  starlink: Color.fromCssColorString('#ffffff').withAlpha(0.5),
  geo: Color.fromCssColorString('#ff44ff').withAlpha(0.85),
  gnss: Color.fromCssColorString('#44ff44').withAlpha(0.8),
};

export type SatGroupCounts = Record<SatGroup, number>;

// Theater bounding box for Starlink filtering (lat 12-42N, lon 24-65E)
const THEATER_LAT_MIN = 12;
const THEATER_LAT_MAX = 42;
const THEATER_LON_MIN = 24;
const THEATER_LON_MAX = 65;
const STARLINK_CAP = 200;

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

/** Filter Starlink satellites to those currently over the theater bounding box */
function filterToTheater(sats: SatRecord[]): SatRecord[] {
  const now = new Date();
  const gmst = satellite.gstime(now);
  const inTheater: SatRecord[] = [];

  for (const sat of sats) {
    try {
      const posVel = satellite.propagate(sat.satrec, now);
      if (!posVel || typeof posVel.position === 'boolean' || !posVel.position) continue;

      const geodetic = satellite.eciToGeodetic(posVel.position as satellite.EciVec3<number>, gmst);
      const lon = satellite.degreesLong(geodetic.longitude);
      const lat = satellite.degreesLat(geodetic.latitude);

      if (
        lat >= THEATER_LAT_MIN &&
        lat <= THEATER_LAT_MAX &&
        lon >= THEATER_LON_MIN &&
        lon <= THEATER_LON_MAX
      ) {
        inTheater.push(sat);
        if (inTheater.length >= STARLINK_CAP) break;
      }
    } catch {
      // Propagation failed, skip
    }
  }

  return inTheater;
}

function pixelSizeForGroup(group: SatGroup): number {
  switch (group) {
    case 'gps': return 5;
    case 'military': return 4;
    case 'recon': return 3;
    case 'starlink': return 2;
    case 'geo': return 5;
    case 'gnss': return 4;
  }
}

function showLabelForGroup(group: SatGroup): boolean {
  return group === 'gps' || group === 'geo';
}

function formatLabelText(sat: SatRecord): string {
  if (sat.group === 'gps') return sat.name.replace('NAVSTAR ', 'GPS ');
  if (sat.group === 'geo') return sat.name.substring(0, 20);
  return '';
}

const EMPTY_COUNTS: SatGroupCounts = {
  gps: 0,
  military: 0,
  recon: 0,
  starlink: 0,
  geo: 0,
  gnss: 0,
};

/** Fetch military-relevant satellite TLEs and propagate orbits */
export function useSatellites(
  viewer: CesiumViewer | null,
  enabled: boolean,
  simTimeRef?: React.RefObject<number>,
) {
  const [count, setCount] = useState(0);
  const [groupCounts, setGroupCounts] = useState<SatGroupCounts>({ ...EMPTY_COUNTS });
  const satsRef = useRef<SatRecord[]>([]);
  const entitiesRef = useRef<Entity[]>([]);
  const animRef = useRef<number>(0);
  const fetchedRef = useRef(false);

  // Fetch TLE data from all satellite groups
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

        // GPS: keep all (~31 operational)
        const gps = allSats.filter(s => s.group === 'gps');
        // Military: keep all (no cap)
        const mil = allSats.filter(s => s.group === 'military');
        // Recon/EO: keep all (no cap)
        const recon = allSats.filter(s => s.group === 'recon');
        // Starlink: filter to theater bbox, cap at 200
        const starlinkAll = allSats.filter(s => s.group === 'starlink');
        const starlinkFiltered = filterToTheater(starlinkAll);
        // GEO: keep all (~400 total, many defense-relevant)
        const geo = allSats.filter(s => s.group === 'geo');
        // GNSS: keep all (GPS + GLONASS + Galileo + BeiDou)
        const gnss = allSats.filter(s => s.group === 'gnss');

        const combined = [...gps, ...mil, ...recon, ...starlinkFiltered, ...geo, ...gnss];
        satsRef.current = combined;
        setCount(combined.length);

        const counts: SatGroupCounts = {
          gps: gps.length,
          military: mil.length,
          recon: recon.length,
          starlink: starlinkFiltered.length,
          geo: geo.length,
          gnss: gnss.length,
        };
        setGroupCounts(counts);
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
      const showLabel = showLabelForGroup(sat.group);

      const entity = viewer.entities.add({
        name: `${sat.name} [${sat.group.toUpperCase()}]`,
        point: {
          pixelSize: pixelSizeForGroup(sat.group),
          color,
          outlineColor: color.withAlpha(0.3),
          outlineWidth: sat.group === 'gps' || sat.group === 'geo' ? 2 : 1,
          scaleByDistance: new NearFarScalar(1e5, 1.2, 5e7, 0.4),
        },
        label: {
          text: showLabel ? formatLabelText(sat) : '',
          show: showLabel,
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

  return { count, groupCounts };
}
