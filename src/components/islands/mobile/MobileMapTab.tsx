// src/components/islands/mobile/MobileMapTab.tsx
import { useState, useMemo, lazy, Suspense } from 'react';
import IntelMap from '../IntelMap';
import type { MapPoint, MapLine, KpiItem, Meta } from '../../../lib/schemas';
import type { FlatEvent } from '../../../lib/timeline-utils';
import type { MapCategory } from '../../../lib/map-utils';

// Lazy-load CesiumGlobe — only imported when user confirms
const CesiumGlobe = lazy(() => import('../CesiumGlobe/CesiumGlobe'));

interface Props {
  mode: '2d' | '3d';
  points: MapPoint[];
  lines: MapLine[];
  events: FlatEvent[];
  categories: MapCategory[];
  kpis: KpiItem[];
  mapCenter?: { lon: number; lat: number };
  mapBounds?: { lonMin: number; lonMax: number; latMin: number; latMax: number };
  trackerSlug: string;
  // Globe-specific props (optional, only needed when globe is enabled)
  meta?: Meta;
  cameraPresets?: Record<string, { lon: number; lat: number; alt: number; pitch: number; heading: number; label?: string }>;
  isHistorical?: boolean;
  endDate?: string;
  clocks?: { label: string; offsetHours: number }[];
}

type GlobeState = 'prompt' | 'loading' | 'loaded' | 'error';

function eventTypeColor(type: string): string {
  if (type === 'strike' || type === 'attack') return 'var(--accent-red)';
  if (type === 'retaliation' || type === 'response') return 'var(--accent-amber)';
  if (type === 'diplomatic' || type === 'politics') return 'var(--accent-blue)';
  if (type === 'ceasefire' || type === 'peace') return 'var(--accent-green)';
  return 'var(--text-muted)';
}

export default function MobileMapTab({
  mode, points, lines, events, categories, kpis,
  mapCenter, mapBounds, trackerSlug,
  meta, cameraPresets, isHistorical, endDate, clocks,
}: Props) {
  const topKpis = kpis.slice(0, 5);
  const [globeState, setGlobeState] = useState<GlobeState>('prompt');
  const [cardDismissed, setCardDismissed] = useState(false);

  // Latest event for floating card (#6)
  const latestEvent = useMemo(() => {
    if (!events.length) return null;
    return events.slice().sort((a, b) => b.resolvedDate.localeCompare(a.resolvedDate))[0];
  }, [events]);

  const handleLoadGlobe = () => {
    setGlobeState('loading');
    // The lazy import triggers on first render of CesiumGlobe
    // Suspense handles the loading state
  };

  return (
    <div className="mtab-map-tab">
      {topKpis.length > 0 && (
        <div className="mtab-kpi-row" aria-label="Key indicators">
          {topKpis.map(kpi => (
            <span key={kpi.id} className={`mtab-kpi ${kpi.color}`}>
              <span className="mtab-kpi-val">{kpi.value}</span>
              {' '}
              {kpi.label}
            </span>
          ))}
        </div>
      )}

      {mode === '2d' ? (
        <div className="mtab-map-container">
          <IntelMap
            points={points}
            lines={lines}
            events={events}
            categories={categories}
            mapCenter={mapCenter}
            mapBounds={mapBounds}
          />
        </div>
      ) : (
        <div className="mtab-3d-container" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {globeState === 'prompt' && (
            <div className="mtab-3d-placeholder">
              <div className="mtab-3d-icon">🌍</div>
              <p className="mtab-3d-title">3D Intelligence Globe</p>
              <p className="mtab-3d-hint">
                Load the interactive 3D globe with satellite tracking, missile animations, and real-time data overlays.
              </p>
              <p className="mtab-3d-size">~3 MB download</p>
              <button className="mtab-3d-load-btn" onClick={handleLoadGlobe}>
                Load 3D Globe
              </button>
            </div>
          )}

          {(globeState === 'loading' || globeState === 'loaded') && meta && (
            <Suspense
              fallback={
                <div className="mtab-3d-placeholder">
                  <div className="mtab-3d-spinner" />
                  <p className="mtab-3d-title">Loading 3D Globe...</p>
                  <p className="mtab-3d-hint">Downloading Cesium engine and map tiles</p>
                </div>
              }
            >
              <div style={{ flex: 1, position: 'relative' }}>
                <CesiumGlobe
                  points={points}
                  lines={lines}
                  kpis={kpis}
                  meta={meta}
                  events={events}
                  cameraPresets={cameraPresets}
                  categories={categories}
                  mapCenter={mapCenter}
                  isHistorical={isHistorical}
                  endDate={endDate}
                  clocks={clocks}
                />
              </div>
            </Suspense>
          )}

          {globeState === 'error' && (
            <div className="mtab-3d-placeholder">
              <p className="mtab-3d-title">Failed to load 3D Globe</p>
              <p className="mtab-3d-hint">Check your connection and try again.</p>
              <button className="mtab-3d-load-btn" onClick={handleLoadGlobe}>
                Retry
              </button>
            </div>
          )}
        </div>
      )}

      {/* Floating latest event card (#6) */}
      {latestEvent && !cardDismissed && (
        <div className="mtab-map-event-card">
          <div className="mtab-map-event-dot" style={{ background: eventTypeColor(latestEvent.type) }} />
          <div className="mtab-map-event-body">
            <div className="mtab-map-event-type">{latestEvent.type}</div>
            <div className="mtab-map-event-title">{latestEvent.title}</div>
          </div>
          <button
            className="mtab-map-event-dismiss"
            onClick={() => setCardDismissed(true)}
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
