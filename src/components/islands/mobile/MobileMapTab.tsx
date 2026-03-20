// src/components/islands/mobile/MobileMapTab.tsx
import IntelMap from '../IntelMap';
import type { MapPoint, MapLine, KpiItem } from '../../../lib/schemas';
import type { FlatEvent } from '../../../lib/timeline-utils';
import type { MapCategory } from '../../../lib/map-utils';

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
}

export default function MobileMapTab({
  mode,
  points,
  lines,
  events,
  categories,
  kpis,
  mapCenter,
  mapBounds,
  trackerSlug,
}: Props) {
  const topKpis = kpis.slice(0, 5);

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
        <div className="mtab-3d-placeholder">
          <span>3D Globe view</span>
          <a
            href={`/${trackerSlug}/globe/`}
            className="mtab-3d-link"
          >
            Open full globe
          </a>
        </div>
      )}
    </div>
  );
}
