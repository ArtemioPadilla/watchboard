// src/components/islands/mobile/MobileTabShell.tsx
import { useState, useMemo, useCallback } from 'react';
import MobileHeader from './MobileHeader';
import MobileTabBar, { type MobileTab } from './MobileTabBar';
import type { MapPoint, MapLine, KpiItem, CasualtyRow, EconItem, Claim, PolItem, TimelineEra } from '../../../lib/schemas';
import type { FlatEvent } from '../../../lib/timeline-utils';
import type { MapCategory } from '../../../lib/map-utils';

interface Props {
  // Config
  operationName: string;
  trackerSlug: string;
  globeEnabled?: boolean;
  isHistorical?: boolean;
  // Map data
  mapPoints: MapPoint[];
  mapLines: MapLine[];
  events: FlatEvent[];
  categories: MapCategory[];
  mapCenter?: { lon: number; lat: number };
  mapBounds?: { lonMin: number; lonMax: number; latMin: number; latMax: number };
  // KPIs
  kpis: KpiItem[];
  // Section data
  heroSubtitle: string;
  casualties: CasualtyRow[];
  econ: EconItem[];
  claims: Claim[];
  political: PolItem[];
  timeline: TimelineEra[];
  strikeTargets: any[];
  retaliationData: any[];
  assetsData: any[];
  militaryTabs?: any[];
  politicalAvatars?: Record<string, string>;
  // Initial state
  initialMapMode?: '2d' | '3d';
}

export default function MobileTabShell(props: Props) {
  const [activeTab, setActiveTab] = useState<MobileTab>('map');
  const [mapMode, setMapMode] = useState<'2d' | '3d'>(props.initialMapMode ?? '2d');

  const toggleMapMode = useCallback(() => {
    setMapMode(prev => (prev === '2d' ? '3d' : '2d'));
  }, []);

  // Feed badge: count events on the latest available date
  const feedBadge = useMemo(() => {
    if (!props.events.length) return 0;
    const dates = props.events.map(e => e.resolvedDate).sort();
    const latestDate = dates[dates.length - 1];
    return props.events.filter(e => e.resolvedDate === latestDate).length;
  }, [props.events]);

  return (
    <div className="mtab-shell">
      <MobileHeader
        operationName={props.operationName}
        mapMode={mapMode}
        onToggleMapMode={toggleMapMode}
        globeEnabled={props.globeEnabled}
        isHistorical={props.isHistorical}
      />

      <div className="mtab-content">
        {/* MAP tab — stays mounted, hidden when inactive to preserve Leaflet state */}
        <div
          id="tabpanel-map"
          role="tabpanel"
          style={{
            display: activeTab === 'map' ? 'flex' : 'none',
            flexDirection: 'column',
            height: '100%',
          }}
        >
          <div
            className="mtab-map-placeholder"
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#555',
            }}
          >
            MAP TAB (placeholder — replaced in Task 4)
          </div>
        </div>

        {activeTab === 'feed' && (
          <div id="tabpanel-feed" role="tabpanel">
            <div style={{ padding: 16, color: '#888' }}>
              FEED TAB (placeholder — replaced in Task 5)
            </div>
          </div>
        )}

        {activeTab === 'data' && (
          <div id="tabpanel-data" role="tabpanel">
            <div style={{ padding: 16, color: '#888' }}>
              DATA TAB (placeholder — replaced in Task 6)
            </div>
          </div>
        )}

        {activeTab === 'intel' && (
          <div id="tabpanel-intel" role="tabpanel">
            <div style={{ padding: 16, color: '#888' }}>
              INTEL TAB (placeholder — replaced in Task 7)
            </div>
          </div>
        )}
      </div>

      <MobileTabBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        feedBadge={feedBadge}
      />
    </div>
  );
}
