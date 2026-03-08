import { useState, useEffect, useRef } from 'react';
import {
  Cartesian3,
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

// ── FOV Configuration ──
// Half-angle in radians for sensor field-of-view
const FOV_HALF_ANGLE: Partial<Record<SatGroup, number>> = {
  recon: (1.5 * Math.PI) / 180,    // 1.5 deg — narrow high-res imaging
  military: (3.0 * Math.PI) / 180, // 3.0 deg — wider surveillance
  geo: (8.7 * Math.PI) / 180,      // 8.7 deg — typical GEO comms beam
};

const FOV_FILL_ALPHA: Partial<Record<SatGroup, number>> = {
  recon: 0.08,
  military: 0.08,
  geo: 0.05,
};

const FOV_OUTLINE_ALPHA: Partial<Record<SatGroup, number>> = {
  recon: 0.30,
  military: 0.30,
  geo: 0.20,
};

// Max LEO footprints (recon + military combined) for performance
const FOV_LEO_CAP = 20;
// Throttle interval for FOV position updates (ms)
const FOV_UPDATE_INTERVAL_MS = 2000;

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

/** Compute ground footprint radius in meters from altitude (km) and FOV half-angle (rad) */
function computeFootprintRadius(altitudeKm: number, halfAngleRad: number): number {
  return altitudeKm * 1000 * Math.tan(halfAngleRad);
}

/** Fetch military-relevant satellite TLEs and propagate orbits */
export function useSatellites(
  viewer: CesiumViewer | null,
  enabled: boolean,
  simTimeRef?: React.RefObject<number>,
  showFov: boolean = false,
) {
  const [count, setCount] = useState(0);
  const [groupCounts, setGroupCounts] = useState<SatGroupCounts>({ ...EMPTY_COUNTS });
  const [fovCount, setFovCount] = useState(0);
  const satsRef = useRef<SatRecord[]>([]);
  const entitiesRef = useRef<Entity[]>([]);
  const fovEntitiesRef = useRef<Entity[]>([]);
  const geoFovEntitiesRef = useRef<Entity[]>([]);
  const geoFovCreatedRef = useRef(false);
  const animRef = useRef<number>(0);
  const fetchedRef = useRef(false);
  const lastFovUpdateRef = useRef<number>(0);

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

  // ── FOV Footprint Management ──
  // Separate effect for FOV so toggling FOV doesn't recreate satellite entities
  useEffect(() => {
    if (!viewer || viewer.isDestroyed() || !enabled || satsRef.current.length === 0) {
      return;
    }

    // Clean up existing FOV entities when toggling off or re-running
    const cleanupFov = () => {
      if (!viewer.isDestroyed()) {
        fovEntitiesRef.current.forEach(e => {
          try { viewer.entities.remove(e); } catch { /* ok */ }
        });
        geoFovEntitiesRef.current.forEach(e => {
          try { viewer.entities.remove(e); } catch { /* ok */ }
        });
      }
      fovEntitiesRef.current = [];
      geoFovEntitiesRef.current = [];
      geoFovCreatedRef.current = false;
      setFovCount(0);
    };

    if (!showFov) {
      cleanupFov();
      return;
    }

    // Create GEO FOV footprints (static — computed once)
    const createGeoFootprints = () => {
      if (geoFovCreatedRef.current) return;
      const now = simTimeRef ? new Date(simTimeRef.current) : new Date();
      const gmst = satellite.gstime(now);
      const halfAngle = FOV_HALF_ANGLE.geo;
      if (!halfAngle) return;

      const geoSats = satsRef.current.filter(s => s.group === 'geo');
      let geoFovAdded = 0;

      for (const sat of geoSats) {
        try {
          const posVel = satellite.propagate(sat.satrec, now);
          if (!posVel || typeof posVel.position === 'boolean' || !posVel.position) continue;

          const geodetic = satellite.eciToGeodetic(posVel.position as satellite.EciVec3<number>, gmst);
          const lon = satellite.degreesLong(geodetic.longitude);
          const lat = satellite.degreesLat(geodetic.latitude);
          const altKm = geodetic.height;

          // Only show GEO footprints for sats positioned over the theater longitude range
          if (lon < THEATER_LON_MIN || lon > THEATER_LON_MAX) continue;

          const radiusM = computeFootprintRadius(altKm, halfAngle);
          const color = Color.fromCssColorString('#ff44ff');

          const entity = viewer.entities.add({
            name: `FOV: ${sat.name}`,
            position: Cartesian3.fromDegrees(lon, lat, 0) as any,
            ellipse: {
              semiMajorAxis: radiusM,
              semiMinorAxis: radiusM,
              material: color.withAlpha(FOV_FILL_ALPHA.geo ?? 0.05),
              outline: true,
              outlineColor: color.withAlpha(FOV_OUTLINE_ALPHA.geo ?? 0.20),
              outlineWidth: 1,
              height: 0,
            },
          });
          geoFovEntitiesRef.current.push(entity);
          geoFovAdded++;
        } catch {
          // Propagation failed
        }
      }

      geoFovCreatedRef.current = true;
      return geoFovAdded;
    };

    // Create/update LEO FOV footprints (recon + military) with throttle
    let leoFovAnimRef = 0;

    const updateLeoFootprints = () => {
      if (viewer.isDestroyed()) return;

      const now = Date.now();
      if (now - lastFovUpdateRef.current < FOV_UPDATE_INTERVAL_MS) {
        leoFovAnimRef = requestAnimationFrame(updateLeoFootprints);
        return;
      }
      lastFovUpdateRef.current = now;

      const simNow = simTimeRef ? new Date(simTimeRef.current) : new Date();
      const gmst = satellite.gstime(simNow);

      // Collect LEO sats (recon + military) currently over theater
      interface FovCandidate {
        sat: SatRecord;
        lon: number;
        lat: number;
        altKm: number;
      }
      const candidates: FovCandidate[] = [];

      for (const sat of satsRef.current) {
        if (sat.group !== 'recon' && sat.group !== 'military') continue;

        try {
          const posVel = satellite.propagate(sat.satrec, simNow);
          if (!posVel || typeof posVel.position === 'boolean' || !posVel.position) continue;

          const geodetic = satellite.eciToGeodetic(posVel.position as satellite.EciVec3<number>, gmst);
          const lon = satellite.degreesLong(geodetic.longitude);
          const lat = satellite.degreesLat(geodetic.latitude);
          const altKm = geodetic.height;

          if (isInTheater(lat, lon)) {
            candidates.push({ sat, lon, lat, altKm });
            if (candidates.length >= FOV_LEO_CAP) break;
          }
        } catch {
          // Skip
        }
      }

      // Remove old LEO FOV entities
      fovEntitiesRef.current.forEach(e => {
        try { viewer.entities.remove(e); } catch { /* ok */ }
      });
      fovEntitiesRef.current = [];

      // Create new LEO FOV entities
      for (const c of candidates) {
        const halfAngle = FOV_HALF_ANGLE[c.sat.group];
        if (!halfAngle) continue;

        const radiusM = computeFootprintRadius(c.altKm, halfAngle);
        const cssColor = c.sat.group === 'recon' ? '#ff8844' : '#ffcc00';
        const color = Color.fromCssColorString(cssColor);
        const fillAlpha = FOV_FILL_ALPHA[c.sat.group] ?? 0.08;
        const outlineAlpha = FOV_OUTLINE_ALPHA[c.sat.group] ?? 0.30;

        const entity = viewer.entities.add({
          name: `FOV: ${c.sat.name}`,
          position: Cartesian3.fromDegrees(c.lon, c.lat, 0) as any,
          ellipse: {
            semiMajorAxis: radiusM,
            semiMinorAxis: radiusM,
            material: color.withAlpha(fillAlpha),
            outline: true,
            outlineColor: color.withAlpha(outlineAlpha),
            outlineWidth: 1,
            height: 0,
          },
        });
        fovEntitiesRef.current.push(entity);
      }

      // Update total FOV count (LEO + GEO)
      setFovCount(fovEntitiesRef.current.length + geoFovEntitiesRef.current.length);

      if (!viewer.isDestroyed()) {
        leoFovAnimRef = requestAnimationFrame(updateLeoFootprints);
      }
    };

    // Initialize: create GEO footprints (static) and start LEO update loop
    const geoAdded = createGeoFootprints() ?? 0;
    setFovCount(geoAdded);
    leoFovAnimRef = requestAnimationFrame(updateLeoFootprints);

    return () => {
      cancelAnimationFrame(leoFovAnimRef);
      cleanupFov();
    };
  }, [showFov, enabled, viewer, count]);

  return { count, groupCounts, fovCount };
}
