/**
 * Thin loader that fetches map data on mount instead of receiving it as inline props.
 * Reduces HTML size by ~850KB per tracker page.
 */
import { useState, useEffect } from 'react';
import type { MapCategory } from '../../lib/map-utils';

// Lazy-load the actual IntelMap to keep the loader chunk small
import { lazy, Suspense } from 'react';
const IntelMap = lazy(() => import('./IntelMap'));

interface Props {
  trackerSlug: string;
  categories?: MapCategory[];
  mapCenter?: { lon: number; lat: number };
  mapBounds?: { lonMin: number; lonMax: number; latMin: number; latMax: number };
}

export default function IntelMapLoader({ trackerSlug, categories, mapCenter, mapBounds }: Props) {
  const [data, setData] = useState<{ points: any[]; lines: any[]; events: any[] } | null>(null);

  useEffect(() => {
    fetch(`/api/data/${trackerSlug}.json`)
      .then(r => r.json())
      .then(d => setData({ points: d.mapPoints, lines: d.mapLines, events: d.events }))
      .catch(() => {});
  }, [trackerSlug]);

  if (!data) {
    return <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.7rem' }}>Loading map data…</div>;
  }

  return (
    <Suspense fallback={<div style={{ width: '100%', height: '100%' }} />}>
      <IntelMap
        points={data.points}
        lines={data.lines}
        events={data.events}
        categories={categories}
        mapCenter={mapCenter}
        mapBounds={mapBounds}
      />
    </Suspense>
  );
}
