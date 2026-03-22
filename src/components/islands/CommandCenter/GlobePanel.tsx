import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
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
  onSelectTracker: (slug: string | null) => void;
  onHoverTracker: (slug: string | null) => void;
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
const DARK_EARTH_URL = `${basePath}textures/earth-night.jpg`;
const BUMP_URL = `${basePath}textures/earth-topology.png`;

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
}

const GlobePanel = forwardRef<GlobePanelHandle, Props>(function GlobePanel({
  trackers,
  activeTracker,
  hoveredTracker,
  followedSlugs,
  onSelectTracker,
  onHoverTracker,
}, ref) {
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<any>(null);
  const activeRef = useRef(activeTracker);
  const hoveredRef = useRef(hoveredTracker);

  const followedRef = useRef(followedSlugs);
  activeRef.current = activeTracker;
  hoveredRef.current = hoveredTracker;
  followedRef.current = followedSlugs;

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

    import('globe.gl').then(({ default: Globe }) => {
      if (destroyed || !containerRef.current) return;

      const globe = Globe()(containerRef.current)
        .globeImageUrl(DARK_EARTH_URL)
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

  // Update visuals when selection/hover changes
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
      });
  }, [activeTracker, hoveredTracker, followedSlugs]);

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

  // Resume auto-rotate on deselect
  useEffect(() => {
    if (!activeTracker && globeRef.current) {
      const controls = globeRef.current.controls();
      if (controls) controls.autoRotate = true;
    }
  }, [activeTracker]);

  return (
    <div style={styles.container}>
      {loading && (
        <div style={styles.loadingOverlay}>
          <div style={styles.loadingGlobe}>
            <div style={styles.loadingRing} />
          </div>
          <div style={styles.loadingText}>INITIALIZING GLOBE</div>
        </div>
      )}
      <div ref={containerRef} style={styles.globeWrap} />
      <div style={styles.statusBar}>
        <span>Drag to rotate · Scroll to zoom · Click marker to select</span>
      </div>
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
    color: 'var(--text-muted)',
    opacity: 0.6,
    backdropFilter: 'blur(4px)',
    pointerEvents: 'none' as const,
  },
};
