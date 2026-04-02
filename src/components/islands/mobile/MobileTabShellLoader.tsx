/**
 * Thin loader that fetches tracker data on mount instead of receiving it as inline props.
 * Reduces HTML size by ~1.6MB per tracker page.
 */
import { useState, useEffect, lazy, Suspense } from 'react';
import type { MapCategory } from '../../../lib/map-utils';

const MobileTabShell = lazy(() => import('./MobileTabShell'));

interface Props {
  trackerSlug: string;
  operationName: string;
  globeEnabled?: boolean;
  isHistorical?: boolean;
  categories: MapCategory[];
  mapCenter?: { lon: number; lat: number };
  mapBounds?: { lonMin: number; lonMax: number; latMin: number; latMax: number };
  cameraPresets?: Record<string, { lon: number; lat: number; alt: number; pitch: number; heading: number; label?: string }>;
  endDate?: string;
  clocks?: { label: string; offsetHours: number }[];
  militaryTabs?: any[];
}

export default function MobileTabShellLoader(props: Props) {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    fetch(`/api/data/${props.trackerSlug}.json`)
      .then(r => r.json())
      .then(setData)
      .catch(() => {});
  }, [props.trackerSlug]);

  if (!data) {
    return (
      <div style={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)', color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem' }}>
        Loading…
      </div>
    );
  }

  return (
    <Suspense fallback={<div style={{ width: '100vw', height: '100vh' }} />}>
      <MobileTabShell
        operationName={props.operationName}
        trackerSlug={props.trackerSlug}
        globeEnabled={props.globeEnabled}
        isHistorical={props.isHistorical}
        mapPoints={data.mapPoints}
        mapLines={data.mapLines}
        events={data.events}
        categories={props.categories}
        mapCenter={props.mapCenter}
        mapBounds={props.mapBounds}
        kpis={data.kpis}
        meta={data.meta}
        cameraPresets={props.cameraPresets}
        endDate={props.endDate}
        clocks={props.clocks}
        heroSubtitle={data.meta.heroSubtitle}
        casualties={data.casualties}
        econ={data.econ}
        claims={data.claims}
        political={data.political}
        timeline={data.timeline}
        strikeTargets={data.strikeTargets}
        retaliationData={data.retaliationData}
        assetsData={data.assetsData}
        militaryTabs={props.militaryTabs}
      />
    </Suspense>
  );
}
