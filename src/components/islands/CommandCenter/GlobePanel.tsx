import { useEffect, useRef, useCallback } from 'react';
import type { TrackerCardData } from '../../../lib/tracker-directory-utils';

interface GlobeMarker {
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

  const markers: GlobeMarker[] = trackers
    .filter(t => t.mapCenter)
    .map(t => ({
      slug: t.slug,
      lat: t.mapCenter!.lat,
      lng: t.mapCenter!.lon,
      color: t.color || '#3498db',
      name: t.shortName,
    }));

  const markersRef = useRef(markers);
  markersRef.current = markers;

  const onSelectRef = useRef(onSelectTracker);
  onSelectRef.current = onSelectTracker;
  const onHoverRef = useRef(onHoverTracker);
  onHoverRef.current = onHoverTracker;

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
        .pointsData(markersRef.current)
        .pointLat('lat')
        .pointLng('lng')
        .pointColor((d: any) => {
          const active = activeRef.current;
          const hovered = hoveredRef.current;
          if (active && d.slug !== active && d.slug !== hovered) {
            return d.color + '50';
          }
          return d.color;
        })
        .pointAltitude((d: any) => {
          if (d.slug === activeRef.current) return 0.06;
          if (d.slug === hoveredRef.current) return 0.03;
          return 0.01;
        })
        .pointRadius((d: any) => {
          if (d.slug === activeRef.current) return 0.55;
          if (d.slug === hoveredRef.current) return 0.4;
          return 0.25;
        })
        .pointsMerge(false)
        .pointLabel((d: any) => `
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
        `)
        .onPointClick((point: any) => {
          const slug = point.slug;
          onSelectRef.current(activeRef.current === slug ? null : slug);
        })
        .onPointHover((point: any) => {
          onHoverRef.current(point?.slug ?? null);
          if (containerRef.current) {
            containerRef.current.style.cursor = point ? 'pointer' : 'grab';
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
      globeRef.current.pointsData(markers);
    }
  }, [trackers]);

  // Update visuals when selection/hover changes
  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return;

    // Re-trigger point accessors by resetting data
    globe
      .pointColor((d: any) => {
        if (activeTracker && d.slug !== activeTracker && d.slug !== hoveredTracker) {
          return d.color + '50';
        }
        return d.color;
      })
      .pointRadius((d: any) => {
        if (d.slug === activeTracker) return 0.55;
        if (d.slug === hoveredTracker) return 0.4;
        return 0.25;
      })
      .pointAltitude((d: any) => {
        if (d.slug === activeTracker) return 0.06;
        if (d.slug === hoveredTracker) return 0.03;
        return 0.01;
      });
  }, [activeTracker, hoveredTracker]);

  // Fly-to on selection
  useEffect(() => {
    const globe = globeRef.current;
    if (!globe || !activeTracker) return;

    const marker = markers.find(m => m.slug === activeTracker);
    if (marker) {
      globe.pointOfView({ lat: marker.lat, lng: marker.lng, altitude: 1.8 }, 1000);
      // Stop auto-rotate while focused
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
