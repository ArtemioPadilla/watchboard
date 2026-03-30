import { useState, useEffect, useRef } from 'react';
import {
  Cartesian3,
  CallbackProperty,
  Color,
  NearFarScalar,
  DistanceDisplayCondition,
  VerticalOrigin,
  HorizontalOrigin,
  LabelStyle,
  type Viewer as CesiumViewer,
  type Entity,
} from 'cesium';
import { getIconDataUri } from './cesium-icons';
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

// ── FOV Configuration (LEO recon + military only) ──
const FOV_HALF_ANGLE: Partial<Record<SatGroup, number>> = {
  recon: (8.0 * Math.PI) / 180,     // 8 deg — ~70 km radius at 500 km alt
  military: (10.0 * Math.PI) / 180, // 10 deg — ~123 km radius at 700 km alt
};

const FOV_FILL_ALPHA: Partial<Record<SatGroup, number>> = {
  recon: 0.07,
  military: 0.07,
};

const FOV_OUTLINE_ALPHA: Partial<Record<SatGroup, number>> = {
  recon: 0.35,
  military: 0.35,
};

const FOV_CONE_ALPHA: Partial<Record<SatGroup, number>> = {
  recon: 0.20,
  military: 0.20,
};

// Max LEO footprints (recon + military combined) for performance
const FOV_LEO_CAP = 12;
// Number of cone ray lines per satellite
const FOV_CONE_RAYS = 10;

/** Check if a lat/lon is within the theater bounding box */
function isInTheater(lat: number, lon: number): boolean {
  return (
    lat >= THEATER_LAT_MIN &&
    lat <= THEATER_LAT_MAX &&
    lon >= THEATER_LON_MIN &&
    lon <= THEATER_LON_MAX
  );
}

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

      if (isInTheater(lat, lon)) {
        inTheater.push(sat);
        if (inTheater.length >= STARLINK_CAP) break;
      }
    } catch {
      // Propagation failed, skip
    }
  }

  return inTheater;
}

function billboardSizeForGroup(group: SatGroup): number {
  switch (group) {
    case 'gps': return 15;
    case 'military': return 12;
    case 'recon': return 12;
    case 'starlink': return 8;
    case 'geo': return 15;
    case 'gnss': return 12;
  }
}

function showLabelForGroup(group: SatGroup): boolean {
  // Show labels for all groups except starlink (too many)
  return group !== 'starlink';
}

/** Known military/intel satellite designations for display */
const KNOWN_SAT_NAMES: Record<string, string> = {
  'USA 224': 'USA-224 (KH-11)',
  'USA 245': 'USA-245 (KH-11)',
  'USA 256': 'USA-256 (TOPAZ)',
  'USA 290': 'USA-290 (KH-11)',
  'USA 314': 'USA-314 (MISTY)',
  'LACROSSE 5': 'LACROSSE-5 (SAR)',
  'NROL-82': 'NROL-82',
  'NROL-85': 'NROL-85',
};

function formatLabelText(sat: SatRecord): string {
  // Check for known designation
  const upper = sat.name.toUpperCase();
  for (const [key, val] of Object.entries(KNOWN_SAT_NAMES)) {
    if (upper.includes(key)) return val;
  }
  if (sat.group === 'gps') return sat.name.replace('NAVSTAR ', 'GPS ');
  if (sat.group === 'geo') return sat.name.substring(0, 20);
  if (sat.group === 'military') return sat.name.substring(0, 18);
  if (sat.group === 'recon') return sat.name.substring(0, 18);
  if (sat.group === 'gnss') return sat.name.substring(0, 16);
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

/** Compute ground footprint radius in meters from altitude (km) and FOV half-angle (rad) */
function computeFootprintRadius(altitudeKm: number, halfAngleRad: number): number {
  return altitudeKm * 1000 * Math.tan(halfAngleRad);
}

/** Target positions for satellite targeting lines (strike locations) */
export interface SatTarget {
  lon: number;
  lat: number;
}

/** Fetch military-relevant satellite TLEs and propagate orbits */
export function useSatellites(
  viewer: CesiumViewer | null,
  enabled: boolean,
  simTimeRef?: React.RefObject<number>,
  showFov: boolean = false,
  targets: SatTarget[] = [],
) {
  const [count, setCount] = useState(0);
  const [groupCounts, setGroupCounts] = useState<SatGroupCounts>({ ...EMPTY_COUNTS });
  const [fovCount, setFovCount] = useState(0);
  const satsRef = useRef<SatRecord[]>([]);
  const entitiesRef = useRef<Entity[]>([]);
  const fovEntitiesRef = useRef<Entity[]>([]);
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

    // Create entities for each satellite with billboard icons
    satsRef.current.forEach(sat => {
      const color = GROUP_COLORS[sat.group];
      const showLabel = showLabelForGroup(sat.group);
      const groupInfo = SAT_GROUPS.find(g => g.group === sat.group);
      const iconUri = getIconDataUri('satellite', groupInfo?.color || '#00ffcc');
      const bbSize = billboardSizeForGroup(sat.group);

      const entity = viewer.entities.add({
        name: `${sat.name} [${sat.group.toUpperCase()}]`,
        description: `Name: ${sat.name}\nGroup: ${groupInfo?.label || sat.group.toUpperCase()}\nType: ${sat.group.toUpperCase()}`,
        billboard: {
          image: iconUri,
          width: bbSize,
          height: bbSize,
          scaleByDistance: new NearFarScalar(1e5, 1.2, 5e7, 0.4),
          verticalOrigin: VerticalOrigin.CENTER,
          horizontalOrigin: HorizontalOrigin.CENTER,
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
          pixelOffset: new Cartesian3(0, -(bbSize / 2 + 4), 0) as any,
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

  // ── FOV Cone + Footprint Visualization (smooth CallbackProperty) ──
  useEffect(() => {
    if (!viewer || viewer.isDestroyed() || !enabled || satsRef.current.length === 0) {
      return;
    }

    const cleanupFov = () => {
      if (!viewer.isDestroyed()) {
        fovEntitiesRef.current.forEach(e => {
          try { viewer.entities.remove(e); } catch { /* ok */ }
        });
      }
      fovEntitiesRef.current = [];
      setFovCount(0);
    };

    if (!showFov) {
      cleanupFov();
      return;
    }

    // Per-frame cache: propagate each satellite only once per sim time
    let cacheMs = 0;
    const posCache = new Map<string, { lon: number; lat: number; altKm: number } | null>();

    const propagateCached = (sat: SatRecord) => {
      const ms = simTimeRef ? simTimeRef.current : Date.now();
      // Invalidate entire cache when sim time changes
      if (ms !== cacheMs) {
        posCache.clear();
        cacheMs = ms;
      }
      if (posCache.has(sat.name)) return posCache.get(sat.name) ?? null;

      try {
        const time = new Date(ms);
        const gmst = satellite.gstime(time);
        const posVel = satellite.propagate(sat.satrec, time);
        if (!posVel || typeof posVel.position === 'boolean' || !posVel.position) {
          posCache.set(sat.name, null);
          return null;
        }
        const geodetic = satellite.eciToGeodetic(posVel.position as satellite.EciVec3<number>, gmst);
        const result = {
          lon: satellite.degreesLong(geodetic.longitude),
          lat: satellite.degreesLat(geodetic.latitude),
          altKm: geodetic.height,
        };
        posCache.set(sat.name, result);
        return result;
      } catch {
        posCache.set(sat.name, null);
        return null;
      }
    };

    /** Propagate and return position only if satellite is in the theater bbox */
    const propagateInTheater = (sat: SatRecord) => {
      const pos = propagateCached(sat);
      if (!pos) return null;
      return isInTheater(pos.lat, pos.lon) ? pos : null;
    };

    // Collect ALL recon + military sats (capped at FOV_LEO_CAP)
    // Entities are created for all of them; CallbackProperty hides those outside theater per-frame
    const fovSats = satsRef.current
      .filter(s => s.group === 'recon' || s.group === 'military')
      .slice(0, FOV_LEO_CAP);

    // Build FOV entities for all eligible sats at once
    for (const sat of fovSats) {
      const halfAngle = FOV_HALF_ANGLE[sat.group];
      if (!halfAngle) continue;

      const cssColor = sat.group === 'recon' ? '#ff8844' : '#ffcc00';
      const color = Color.fromCssColorString(cssColor);
      const fillAlpha = FOV_FILL_ALPHA[sat.group] ?? 0.07;
      const outlineAlpha = FOV_OUTLINE_ALPHA[sat.group] ?? 0.35;
      const coneAlpha = FOV_CONE_ALPHA[sat.group] ?? 0.20;

      // Off-screen position returned when satellite is outside theater
      const HIDDEN_POS = Cartesian3.fromDegrees(0, -90, 0);

      // Ground footprint ellipse — position + radius update per frame via CallbackProperty
      const ellipseEntity = viewer.entities.add({
        name: `FOV: ${sat.name}`,
        position: new CallbackProperty(() => {
          const pos = propagateInTheater(sat);
          return pos ? Cartesian3.fromDegrees(pos.lon, pos.lat, 0) : HIDDEN_POS;
        }, false) as any,
        ellipse: {
          semiMajorAxis: new CallbackProperty(() => {
            const pos = propagateInTheater(sat);
            return pos ? computeFootprintRadius(pos.altKm, halfAngle) : 1;
          }, false) as any,
          semiMinorAxis: new CallbackProperty(() => {
            const pos = propagateInTheater(sat);
            return pos ? computeFootprintRadius(pos.altKm, halfAngle) : 1;
          }, false) as any,
          material: color.withAlpha(fillAlpha),
          outline: true,
          outlineColor: color.withAlpha(outlineAlpha),
          outlineWidth: 1.5,
          height: 0,
        },
      });
      fovEntitiesRef.current.push(ellipseEntity);

      // Cone ray lines — positions update per frame
      const coneEntity = viewer.entities.add({
        polyline: {
          positions: new CallbackProperty(() => {
            const pos = propagateInTheater(sat);
            if (!pos) return [];
            const radiusKm = computeFootprintRadius(pos.altKm, halfAngle) / 1000;
            const satCartesian = Cartesian3.fromDegrees(pos.lon, pos.lat, pos.altKm * 1000);
            const dLat = radiusKm / 111;
            const dLon = radiusKm / (111 * Math.cos(pos.lat * Math.PI / 180));
            const pts: Cartesian3[] = [];
            for (let i = 0; i < FOV_CONE_RAYS; i++) {
              const angle = (2 * Math.PI * i) / FOV_CONE_RAYS;
              const edgeLat = pos.lat + dLat * Math.cos(angle);
              const edgeLon = pos.lon + dLon * Math.sin(angle);
              pts.push(satCartesian, Cartesian3.fromDegrees(edgeLon, edgeLat, 0));
            }
            return pts;
          }, false) as any,
          width: 1,
          material: color.withAlpha(coneAlpha),
        },
      });
      fovEntitiesRef.current.push(coneEntity);

      // Targeting lines — one per target, each with CallbackProperty
      for (const target of targets) {
        const targetLineEntity = viewer.entities.add({
          polyline: {
            positions: new CallbackProperty(() => {
              const pos = propagateInTheater(sat);
              if (!pos) return [];
              const radiusKm = computeFootprintRadius(pos.altKm, halfAngle) / 1000;
              const footprintDeg = radiusKm / 111;
              if (Math.abs(target.lat - pos.lat) > footprintDeg || Math.abs(target.lon - pos.lon) > footprintDeg) {
                return []; // Target not in footprint
              }
              return [
                Cartesian3.fromDegrees(pos.lon, pos.lat, pos.altKm * 1000),
                Cartesian3.fromDegrees(target.lon, target.lat, 0),
              ];
            }, false) as any,
            width: 1.5,
            material: Color.fromCssColorString('#ff2244').withAlpha(0.35),
          },
        });
        fovEntitiesRef.current.push(targetLineEntity);
      }
    }

    setFovCount(fovSats.length);

    return () => {
      cleanupFov();
    };
  }, [showFov, enabled, viewer, count, targets]);

  return { count, groupCounts, fovCount };
}
