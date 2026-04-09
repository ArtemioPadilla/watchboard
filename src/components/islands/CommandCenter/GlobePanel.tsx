import { useEffect, useRef, useState, useMemo, forwardRef, useImperativeHandle } from 'react';
import { t, getPreferredLocale } from '../../../i18n/translations';
import type { TrackerCardData } from '../../../lib/tracker-directory-utils';

interface GlobePoint {
  type: 'hub' | 'event';
  slug: string;
  lat: number;
  lng: number;
  color: string;
  name: string;
}

interface GlobeRing {
  slug: string;
  lat: number;
  lng: number;
  color: string;
  freshness: 'fresh' | 'recent';
}

interface GlobeArc {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  color: string;
  seriesId: string;
}

interface Props {
  trackers: TrackerCardData[];
  activeTracker: string | null;
  hoveredTracker: string | null;
  followedSlugs: string[];
  broadcastMode?: boolean;
  featuredSlug?: string | null;
  cityLights?: boolean;
  onSelectTracker: (slug: string | null) => void;
  onHoverTracker: (slug: string | null) => void;
  // Geographic mode polygon layer
  viewMode?: 'operations' | 'geographic' | 'domain';
  countriesGeoJSON?: any | null;
  countryDensity?: Map<string, number>;
  hoveredCountry?: string | null;
  activeCountry?: string | null;
  onPolygonClick?: (isoA2: string) => void;
  onPolygonHover?: (isoA2: string | null) => void;
}

function hexToRgb(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `${r},${g},${b}`;
}

const base = import.meta.env.BASE_URL || '/watchboard';
const basePath = base.endsWith('/') ? base : `${base}/`;
const EARTH_LIGHTS_URL = `${basePath}textures/earth-dark-blend-4k.webp`;
const EARTH_DARK_URL = `${basePath}textures/earth-dark-threejs.jpg`;
const BUMP_URL = `${basePath}textures/earth-topology.webp`;

function computeFreshnessClass(lastUpdated: string): 'fresh' | 'recent' | 'stale' {
  const ageHrs = (Date.now() - new Date(lastUpdated).getTime()) / 3600000;
  if (ageHrs < 24) return 'fresh';
  if (ageHrs < 48) return 'recent';
  return 'stale';
}

function buildRings(trackers: TrackerCardData[]): GlobeRing[] {
  const rings: GlobeRing[] = [];
  for (const t of trackers) {
    if (!t.mapCenter) continue;
    const freshness = computeFreshnessClass(t.lastUpdated);
    if (freshness === 'stale') continue;
    rings.push({
      slug: t.slug,
      lat: t.mapCenter.lat,
      lng: t.mapCenter.lon,
      color: t.color || '#3498db',
      freshness,
    });
  }
  return rings;
}

function buildArcs(trackers: TrackerCardData[]): GlobeArc[] {
  const arcs: GlobeArc[] = [];
  const seriesMap = new Map<string, TrackerCardData[]>();

  for (const t of trackers) {
    if (!t.seriesId || !t.mapCenter) continue;
    if (!seriesMap.has(t.seriesId)) seriesMap.set(t.seriesId, []);
    seriesMap.get(t.seriesId)!.push(t);
  }

  for (const [seriesId, members] of seriesMap) {
    if (members.length < 2) continue;
    members.sort((a, b) => (a.seriesOrder ?? 0) - (b.seriesOrder ?? 0));
    for (let i = 0; i < members.length - 1; i++) {
      const a = members[i];
      const b = members[i + 1];
      if (!a.mapCenter || !b.mapCenter) continue;
      // Skip arcs between trackers at the same location
      if (Math.abs(a.mapCenter.lat - b.mapCenter.lat) < 1 && Math.abs(a.mapCenter.lon - b.mapCenter.lon) < 1) continue;
      arcs.push({
        startLat: a.mapCenter.lat,
        startLng: a.mapCenter.lon,
        endLat: b.mapCenter.lat,
        endLng: b.mapCenter.lon,
        color: a.color || '#3498db',
        seriesId,
      });
    }
  }
  return arcs;
}

// Offset overlapping hub markers so they don't stack
function offsetOverlappingHubs(points: GlobePoint[]): GlobePoint[] {
  const hubs = points.filter(p => p.type === 'hub');
  const THRESHOLD = 3; // degrees
  for (let i = 0; i < hubs.length; i++) {
    for (let j = i + 1; j < hubs.length; j++) {
      const a = hubs[i];
      const b = hubs[j];
      const dlat = Math.abs(a.lat - b.lat);
      const dlng = Math.abs(a.lng - b.lng);
      if (dlat < THRESHOLD && dlng < THRESHOLD) {
        // Offset both slightly in opposite directions
        const angle = Math.atan2(b.lat - a.lat, b.lng - a.lng) || (j * 0.5);
        const offset = 1.5;
        a.lat -= Math.sin(angle) * offset;
        a.lng -= Math.cos(angle) * offset;
        b.lat += Math.sin(angle) * offset;
        b.lng += Math.cos(angle) * offset;
      }
    }
  }
  return points;
}

function buildHubPoints(trackers: TrackerCardData[]): GlobePoint[] {
  const points: GlobePoint[] = [];
  for (const t of trackers) {
    if (t.mapCenter) {
      points.push({
        type: 'hub',
        slug: t.slug,
        lat: t.mapCenter.lat,
        lng: t.mapCenter.lon,
        color: t.color || '#3498db',
        name: t.shortName,
      });
    }
  }
  return offsetOverlappingHubs(points);
}

function mergeEventPoints(
  hubs: GlobePoint[],
  eventData: Record<string, Array<{ lat: number; lon: number; color: string }>>,
  trackers: TrackerCardData[],
): GlobePoint[] {
  const eventPoints: GlobePoint[] = [];
  for (const t of trackers) {
    const eps = eventData[t.slug];
    if (!eps) continue;
    for (const ep of eps) {
      eventPoints.push({
        type: 'event',
        slug: t.slug,
        lat: ep.lat,
        lng: ep.lon,
        color: ep.color,
        name: t.shortName,
      });
    }
  }
  return [...eventPoints, ...hubs];
}

export interface GlobePanelHandle {
  toggleRotation?: () => void;
  flyTo?: (lat: number, lng: number, altitude: number, durationMs: number) => void;
  setAutoRotate?: (enabled: boolean, speed?: number) => void;
  toggleCityLights?: () => void;
}

const GlobePanel = forwardRef<GlobePanelHandle, Props>(function GlobePanel({
  trackers,
  activeTracker,
  hoveredTracker,
  followedSlugs,
  broadcastMode = false,
  featuredSlug = null,
  cityLights: cityLightsProp = true,
  onSelectTracker,
  onHoverTracker,
  viewMode,
  countriesGeoJSON,
  countryDensity,
  hoveredCountry,
  activeCountry,
  onPolygonClick,
  onPolygonHover,
}, ref) {
  const [loading, setLoading] = useState(true);
  const [cityLights, setCityLights] = useState(cityLightsProp);
  const containerRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<any>(null);
  const activeRef = useRef(activeTracker);
  const hoveredRef = useRef(hoveredTracker);
  const darkTexRef = useRef<any>(null);

  const followedRef = useRef(followedSlugs);
  activeRef.current = activeTracker;
  hoveredRef.current = hoveredTracker;
  followedRef.current = followedSlugs;

  // Refs for polygon color accessors (read current values without re-configuring globe)
  const hoveredCountryRef = useRef(hoveredCountry);
  const activeCountryRef = useRef(activeCountry);
  const countryDensityRef = useRef(countryDensity);
  const onPolygonClickRef = useRef(onPolygonClick);
  const onPolygonHoverRef = useRef(onPolygonHover);
  const pointClickedRef = useRef(false);

  hoveredCountryRef.current = hoveredCountry;
  activeCountryRef.current = activeCountry;
  countryDensityRef.current = countryDensity;
  onPolygonClickRef.current = onPolygonClick;
  onPolygonHoverRef.current = onPolygonHover;

  // Compute maxDensity for polygon opacity formula
  const maxDensity = useMemo(() => {
    if (!countryDensity || countryDensity.size === 0) return 1;
    return Math.max(1, ...countryDensity.values());
  }, [countryDensity]);

  const maxDensityRef = useRef(maxDensity);
  maxDensityRef.current = maxDensity;

  // Build ISO -> region lookup from trackers
  const isoToRegionRef = useRef(new Map<string, string>());
  useMemo(() => {
    const map = new Map<string, string>();
    for (const t of trackers) {
      if (t.geoPath && t.geoPath[0] && t.region) {
        map.set(t.geoPath[0], t.region);
      }
    }
    isoToRegionRef.current = map;
  }, [trackers]);

  function isCountryInRegion(iso: string, hoveredRegion: string): boolean {
    const regionId = hoveredRegion.replace('region:', '');
    return isoToRegionRef.current.get(iso) === regionId;
  }

  function getPolygonCapColor(feature: any): string {
    const iso = feature.properties?.ISO_A2;
    const density = countryDensityRef.current;
    const maxD = maxDensityRef.current;
    const count = density?.get(iso) ?? 0;
    const baseOpacity = 0.04 + 0.22 * (count / maxD);
    const hovered = hoveredCountryRef.current;
    const active = activeCountryRef.current;

    if (iso === hovered || (hovered?.startsWith('region:') && isCountryInRegion(iso, hovered))) {
      return 'rgba(52,152,219,0.35)';
    }
    if (iso === active) {
      return 'rgba(52,152,219,0.28)';
    }
    if (count > 0) {
      return `rgba(52,152,219,${baseOpacity.toFixed(3)})`;
    }
    return 'rgba(52,152,219,0.04)';
  }

  function getPolygonStrokeColor(feature: any): string {
    const iso = feature.properties?.ISO_A2;
    const density = countryDensityRef.current;
    const count = density?.get(iso) ?? 0;
    const hovered = hoveredCountryRef.current;
    const active = activeCountryRef.current;

    if (iso === hovered || iso === active ||
        (hovered?.startsWith('region:') && isCountryInRegion(iso, hovered))) {
      return 'rgba(52,152,219,0.6)';
    }
    if (count > 0) {
      return 'rgba(52,152,219,0.18)';
    }
    return 'rgba(255,255,255,0.06)';
  }

  const hubPoints = buildHubPoints(trackers);
  const pointsRef = useRef<GlobePoint[]>(hubPoints);

  const rings = buildRings(trackers);
  const ringsRef = useRef(rings);
  ringsRef.current = rings;

  const arcs = buildArcs(trackers);
  const arcsRef = useRef(arcs);
  arcsRef.current = arcs;

  const onSelectRef = useRef(onSelectTracker);
  onSelectRef.current = onSelectTracker;
  const onHoverRef = useRef(onHoverTracker);
  onHoverRef.current = onHoverTracker;

  useImperativeHandle(ref, () => ({
    toggleRotation: () => {
      const controls = globeRef.current?.controls();
      if (controls) controls.autoRotate = !controls.autoRotate;
    },
    flyTo: (lat: number, lng: number, altitude: number, durationMs: number) => {
      if (globeRef.current) {
        globeRef.current.pointOfView({ lat, lng, altitude }, durationMs);
      }
    },
    setAutoRotate: (enabled: boolean, speed = 0.3) => {
      if (globeRef.current) {
        const controls = globeRef.current.controls();
        if (controls) {
          controls.autoRotate = enabled;
          controls.autoRotateSpeed = speed;
        }
      }
    },
    toggleCityLights: () => {
      setCityLights(prev => !prev);
    },
  }));

  // Point accessors — handle both hub and event types
  function getPointColor(d: any): string {
    const active = activeRef.current;
    const hovered = hoveredRef.current;
    const followed = followedRef.current;
    if (d.type === 'event') {
      if (active && d.slug !== active) return d.color + '20';
      if (active && d.slug === active) return d.color + 'cc';
      return d.color + '60';
    }
    // Hub markers: followed trackers stay bright even when another is selected
    if (active && d.slug !== active && d.slug !== hovered) {
      if (followed.includes(d.slug)) return d.color + '90';
      return d.color + '40';
    }
    return d.color;
  }

  function getPointRadius(d: any): number {
    const followed = followedRef.current;
    if (d.type === 'event') {
      if (activeRef.current === d.slug) return 0.12;
      return 0.08;
    }
    if (d.slug === activeRef.current) return 0.55;
    if (d.slug === hoveredRef.current) return 0.4;
    if (followed.includes(d.slug)) return 0.35;
    return 0.28;
  }

  function getPointAltitude(d: any): number {
    const followed = followedRef.current;
    if (d.type === 'event') {
      if (activeRef.current === d.slug) return 0.02;
      return 0.005;
    }
    if (d.slug === activeRef.current) return 0.06;
    if (d.slug === hoveredRef.current) return 0.03;
    if (followed.includes(d.slug)) return 0.02;
    return 0.012;
  }

  // Initialize globe
  useEffect(() => {
    if (!containerRef.current) return;
    let destroyed = false;

    // Defer globe init to avoid blocking main thread (TBT improvement)
    const initGlobe = () => import('globe.gl').then(({ default: Globe }) => {
      if (destroyed || !containerRef.current) return;

      // Preload the dark (no-lights) texture for toggle
      const darkImg = new Image();
      darkImg.crossOrigin = 'anonymous';
      darkImg.src = EARTH_DARK_URL;

      const globe = Globe()(containerRef.current)
        .globeImageUrl(EARTH_LIGHTS_URL)
        .bumpImageUrl(BUMP_URL)
        .backgroundColor('rgba(0,0,0,0)')
        .showAtmosphere(true)
        .atmosphereColor('#3498db')
        .atmosphereAltitude(0.18)
        .pointsData(pointsRef.current)
        .pointLat('lat')
        .pointLng('lng')
        .pointColor(getPointColor)
        .pointAltitude(getPointAltitude)
        .pointRadius(getPointRadius)
        .pointsMerge(false)
        .pointLabel((d: any) => {
          if (d.type === 'event') return '';
          return `
            <div style="
              background: rgba(13,17,23,0.95);
              border: 1px solid ${d.color}50;
              border-radius: 6px;
              padding: 6px 10px;
              font-family: 'JetBrains Mono', monospace;
              font-size: 11px;
              color: #e6edf3;
              backdrop-filter: blur(8px);
              pointer-events: none;
            ">
              <div style="font-weight: 600;">${d.name}</div>
            </div>
          `;
        })
        .onPointClick((point: any) => {
          pointClickedRef.current = true;
          setTimeout(() => { pointClickedRef.current = false; }, 50);
          const slug = point.slug;
          onSelectRef.current(activeRef.current === slug ? null : slug);
        })
        .onPointHover((point: any) => {
          if (point?.type === 'hub') {
            onHoverRef.current(point.slug);
            if (containerRef.current) containerRef.current.style.cursor = 'pointer';
          } else if (point?.type === 'event') {
            onHoverRef.current(point.slug);
            if (containerRef.current) containerRef.current.style.cursor = 'pointer';
          } else {
            onHoverRef.current(null);
            if (containerRef.current) containerRef.current.style.cursor = 'grab';
          }
        })
        .onGlobeClick(() => {
          onSelectRef.current(null);
        })
        // Animated rings on fresh/recent tracker hubs
        .ringsData(ringsRef.current)
        .ringLat('lat')
        .ringLng('lng')
        .ringColor((d: any) => {
          const active = activeRef.current;
          if (active && d.slug !== active) return `${d.color}15`;
          return (t: number) => `rgba(${hexToRgb(d.color)}, ${1 - t})`;
        })
        .ringMaxRadius((d: any) => d.freshness === 'fresh' ? 3 : 2)
        .ringPropagationSpeed((d: any) => d.freshness === 'fresh' ? 2 : 1)
        .ringRepeatPeriod((d: any) => d.freshness === 'fresh' ? 1200 : 2400)
        // Connection arcs between series trackers
        .arcsData(arcsRef.current)
        .arcStartLat('startLat')
        .arcStartLng('startLng')
        .arcEndLat('endLat')
        .arcEndLng('endLng')
        .arcColor((d: any) => `${d.color}30`)
        .arcDashLength(0.4)
        .arcDashGap(0.2)
        .arcDashAnimateTime(2000)
        .arcStroke(0.3);

      // Initial camera position
      globe.pointOfView({ lat: 20, lng: 30, altitude: 2.2 });

      // Auto-rotate
      const controls = globe.controls();
      if (controls) {
        controls.autoRotate = true;
        controls.autoRotateSpeed = 0.3;
        controls.enableDamping = true;
        controls.dampingFactor = 0.1;
        controls.minDistance = 120;
        controls.maxDistance = 500;
      }

      globeRef.current = globe;
      setLoading(false);

      // Lazy-load event points from static endpoint
      fetch(`${basePath}api/event-points.json`)
        .then(r => r.ok ? r.json() : {})
        .then((eventData: Record<string, Array<{ lat: number; lon: number; color: string }>>) => {
          if (destroyed) return;
          const allPoints = mergeEventPoints(hubPoints, eventData, trackers);
          pointsRef.current = allPoints;
          globe.pointsData(allPoints);
        })
        .catch(() => { /* keep hub-only points */ });

      // Responsive sizing
      const handleResize = () => {
        if (containerRef.current && globeRef.current) {
          globeRef.current
            .width(containerRef.current.clientWidth)
            .height(containerRef.current.clientHeight);
        }
      };
      window.addEventListener('resize', handleResize);
      handleResize();

      return () => {
        window.removeEventListener('resize', handleResize);
      };
    });

    const idle = typeof requestIdleCallback === 'function'
      ? requestIdleCallback : (cb: () => void) => setTimeout(cb, 100);
    idle(initGlobe);

    return () => {
      destroyed = true;
      if (globeRef.current) {
        globeRef.current._destructor();
        globeRef.current = null;
      }
    };
  }, []);

  // Update hub points when trackers change
  useEffect(() => {
    if (globeRef.current) {
      pointsRef.current = hubPoints;
      globeRef.current.pointsData(hubPoints);
    }
  }, [trackers]);

  // Update visuals when selection/hover/broadcast changes
  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return;

    globe
      .pointColor(getPointColor)
      .pointRadius(getPointRadius)
      .pointAltitude(getPointAltitude)
      .ringColor((d: any) => {
        if (activeTracker && d.slug !== activeTracker) return `${d.color}15`;
        return (t: number) => `rgba(${hexToRgb(d.color)}, ${1 - t})`;
      })
      .ringMaxRadius((d: any) => {
        if (featuredSlug && d.slug === featuredSlug) return 5;
        return d.freshness === 'fresh' ? 3 : 2;
      })
      .ringPropagationSpeed((d: any) => {
        if (featuredSlug && d.slug === featuredSlug) return 4;
        return d.freshness === 'fresh' ? 2 : 1;
      });
  }, [activeTracker, hoveredTracker, followedSlugs, featuredSlug]);

  // Fly-to on selection
  useEffect(() => {
    const globe = globeRef.current;
    if (!globe || !activeTracker) return;

    const hub = hubPoints.find(p => p.slug === activeTracker);
    if (hub) {
      globe.pointOfView({ lat: hub.lat, lng: hub.lng, altitude: 1.8 }, 1000);
      const controls = globe.controls();
      if (controls) controls.autoRotate = false;
    }
  }, [activeTracker]);

  // Resume auto-rotate on deselect (skip during broadcast — hook controls camera)
  useEffect(() => {
    if (!activeTracker && globeRef.current && !broadcastMode) {
      const controls = globeRef.current.controls();
      if (controls) controls.autoRotate = true;
    }
  }, [activeTracker, broadcastMode]);

  // Toggle city lights texture
  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return;
    globe.globeImageUrl(cityLights ? EARTH_LIGHTS_URL : EARTH_DARK_URL);
  }, [cityLights]);

  // Manage polygon layer when countriesGeoJSON changes (Task 6)
  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return;

    if (countriesGeoJSON && countriesGeoJSON.features) {
      globe
        .polygonsData(countriesGeoJSON.features)
        .polygonGeoJsonGeometry((d: any) => d.geometry)
        .polygonCapColor(getPolygonCapColor)
        .polygonSideColor(() => 'rgba(0,0,0,0)')
        .polygonStrokeColor(getPolygonStrokeColor)
        .polygonAltitude(0.001)
        .onPolygonClick((polygon: any) => {
          if (pointClickedRef.current) return; // point click takes priority (Task 10)
          const iso = polygon?.properties?.ISO_A2;
          if (iso) onPolygonClickRef.current?.(iso);
        })
        .onPolygonHover((polygon: any) => {
          const iso = polygon?.properties?.ISO_A2 ?? null;
          onPolygonHoverRef.current?.(iso);
          if (containerRef.current) {
            containerRef.current.style.cursor = polygon ? 'pointer' : 'grab';
          }
        });
    } else {
      // Clear polygon layer when not in geographic mode
      globe.polygonsData([]);
    }
  }, [countriesGeoJSON]);

  // Refresh polygon colors when hover/active state changes (Task 9)
  useEffect(() => {
    const globe = globeRef.current;
    if (!globe || !countriesGeoJSON) return;

    globe
      .polygonCapColor(getPolygonCapColor)
      .polygonStrokeColor(getPolygonStrokeColor);
  }, [hoveredCountry, activeCountry, countryDensity]);

  return (
    <div style={styles.container}>
      {loading && (
        <div style={styles.loadingOverlay}>
          <div style={styles.loadingGlobe}>
            <div style={styles.loadingRing} />
          </div>
          <div style={styles.loadingText}>{t('cc.initGlobe', getPreferredLocale())}</div>
        </div>
      )}
      <div ref={containerRef} style={styles.globeWrap} />
      {!broadcastMode && (
        <div style={styles.statusBar}>
          <span>{t('cc.globeHint', getPreferredLocale())}</span>
        </div>
      )}
      <button
        onClick={() => setCityLights(prev => !prev)}
        title={`City lights: ${cityLights ? 'ON' : 'OFF'} (L)`}
        style={{
          ...styles.lightsToggle,
          opacity: cityLights ? 0.9 : 0.4,
        }}
        aria-label={`Toggle city lights (currently ${cityLights ? 'on' : 'off'})`}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18h6"/><path d="M10 22h4"/>
          <path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/>
        </svg>
      </button>
    </div>
  );
});

export default GlobePanel;

const styles = {
  container: {
    position: 'relative' as const,
    width: '100%',
    height: '100%',
    background: '#000',
    overflow: 'hidden',
  },
  loadingOverlay: {
    position: 'absolute' as const,
    inset: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    background: '#000',
  },
  loadingGlobe: {
    width: 120,
    height: 120,
    borderRadius: '50%',
    background: 'radial-gradient(circle at 35% 30%, #1e3a5f 0%, #0e1f35 50%, #060a10 100%)',
    boxShadow: '0 0 40px rgba(52,152,219,0.15)',
    position: 'relative' as const,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingRing: {
    position: 'absolute' as const,
    inset: -8,
    borderRadius: '50%',
    border: '2px solid transparent',
    borderTopColor: 'rgba(52,152,219,0.5)',
    animation: 'spin 1.5s linear infinite',
  },
  loadingText: {
    marginTop: 20,
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.6rem',
    color: 'var(--text-muted)',
    letterSpacing: '0.15em',
    opacity: 0.6,
  },
  globeWrap: {
    width: '100%',
    height: '100%',
  },
  statusBar: {
    position: 'absolute' as const,
    bottom: 0,
    left: 0,
    right: 0,
    padding: '5px 12px',
    background: 'rgba(13,17,23,0.7)',
    borderTop: '1px solid var(--border)',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.56rem',
    color: 'var(--text-secondary)',
    opacity: 0.85,
    backdropFilter: 'blur(4px)',
    pointerEvents: 'none' as const,
  },
  lightsToggle: {
    position: 'absolute' as const,
    top: 10,
    right: 10,
    zIndex: 15,
    background: 'rgba(13,17,23,0.7)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 6,
    color: '#e6edf3',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    padding: 0,
    transition: 'opacity 0.2s',
    backdropFilter: 'blur(4px)',
  },
};
