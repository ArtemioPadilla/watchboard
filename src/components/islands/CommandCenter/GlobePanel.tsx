import { useEffect, useRef } from 'react';
import type { TrackerCardData } from '../../../lib/tracker-directory-utils';

interface GlobePoint {
  type: 'hub' | 'event';
  slug: string;
  lat: number;
  lng: number;
  color: string;
  name: string;
}

interface Props {
  trackers: TrackerCardData[];
  activeTracker: string | null;
  hoveredTracker: string | null;
  onSelectTracker: (slug: string | null) => void;
  onHoverTracker: (slug: string | null) => void;
}

const DARK_EARTH_URL = '//unpkg.com/three-globe/example/img/earth-night.jpg';
const BUMP_URL = '//unpkg.com/three-globe/example/img/earth-topology.png';

function buildPoints(trackers: TrackerCardData[]): GlobePoint[] {
  const points: GlobePoint[] = [];

  for (const t of trackers) {
    // Event dots (smaller ambient markers)
    if (t.eventPoints) {
      for (const ep of t.eventPoints) {
        points.push({
          type: 'event',
          slug: t.slug,
          lat: ep.lat,
          lng: ep.lon,
          color: ep.color,
          name: t.shortName,
        });
      }
    }

    // Hub marker (bigger, interactive, at tracker center)
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

  return points;
}

export default function GlobePanel({
  trackers,
  activeTracker,
  hoveredTracker,
  onSelectTracker,
  onHoverTracker,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<any>(null);
  const activeRef = useRef(activeTracker);
  const hoveredRef = useRef(hoveredTracker);

  activeRef.current = activeTracker;
  hoveredRef.current = hoveredTracker;

  const points = buildPoints(trackers);
  const pointsRef = useRef(points);
  pointsRef.current = points;

  const onSelectRef = useRef(onSelectTracker);
  onSelectRef.current = onSelectTracker;
  const onHoverRef = useRef(onHoverTracker);
  onHoverRef.current = onHoverTracker;

  // Point accessors — handle both hub and event types
  function getPointColor(d: any): string {
    const active = activeRef.current;
    const hovered = hoveredRef.current;
    if (d.type === 'event') {
      // Event dots: dimmed when a tracker is selected and this isn't it
      if (active && d.slug !== active) return d.color + '20';
      if (active && d.slug === active) return d.color + 'cc';
      return d.color + '60';
    }
    // Hub markers
    if (active && d.slug !== active && d.slug !== hovered) return d.color + '40';
    return d.color;
  }

  function getPointRadius(d: any): number {
    if (d.type === 'event') {
      const active = activeRef.current;
      if (active && d.slug === active) return 0.12;
      return 0.08;
    }
    if (d.slug === activeRef.current) return 0.55;
    if (d.slug === hoveredRef.current) return 0.4;
    return 0.28;
  }

  function getPointAltitude(d: any): number {
    if (d.type === 'event') {
      if (activeRef.current === d.slug) return 0.02;
      return 0.005;
    }
    if (d.slug === activeRef.current) return 0.06;
    if (d.slug === hoveredRef.current) return 0.03;
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
        });

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

  // Update points when trackers change
  useEffect(() => {
    if (globeRef.current) {
      globeRef.current.pointsData(points);
    }
  }, [trackers]);

  // Update visuals when selection/hover changes
  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return;

    globe
      .pointColor(getPointColor)
      .pointRadius(getPointRadius)
      .pointAltitude(getPointAltitude);
  }, [activeTracker, hoveredTracker]);

  // Fly-to on selection
  useEffect(() => {
    const globe = globeRef.current;
    if (!globe || !activeTracker) return;

    const hub = points.find(p => p.type === 'hub' && p.slug === activeTracker);
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
      <div ref={containerRef} style={styles.globeWrap} />
      <div style={styles.statusBar}>
        <span>Drag to rotate · Scroll to zoom · Click marker to select</span>
      </div>
    </div>
  );
}

const styles = {
  container: {
    position: 'relative' as const,
    width: '100%',
    height: '100%',
    background: '#000',
    overflow: 'hidden',
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
