// src/components/islands/mobile/MobileTabShell.tsx
import { useState, useMemo, useCallback } from 'react';
import MobileHeader from './MobileHeader';
import MobileTabBar, { type MobileTab } from './MobileTabBar';
import MobileMapTab from './MobileMapTab';
import MobileFeedTab from './MobileFeedTab';
import MobileDataTab from './MobileDataTab';
import MobileIntelTab from './MobileIntelTab';
import type { MapPoint, MapLine, KpiItem, CasualtyRow, EconItem, Claim, PolItem, TimelineEra, StrikeItem, Asset } from '../../../lib/schemas';
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
  strikeTargets: StrikeItem[];
  retaliationData: StrikeItem[];
  assetsData: Asset[];
  militaryTabs?: any[];
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
          <MobileMapTab
            mode={mapMode}
            points={props.mapPoints}
            lines={props.mapLines}
            events={props.events}
            categories={props.categories}
            kpis={props.kpis}
            mapCenter={props.mapCenter}
            mapBounds={props.mapBounds}
            trackerSlug={props.trackerSlug}
          />
        </div>

        {activeTab === 'feed' && (
          <div id="tabpanel-feed" role="tabpanel">
            <MobileFeedTab
              heroSubtitle={props.heroSubtitle}
              events={props.events}
            />
          </div>
        )}

        {activeTab === 'data' && (
          <div id="tabpanel-data" role="tabpanel">
            <MobileDataTab
              kpis={props.kpis}
              casualties={props.casualties}
              econ={props.econ}
              strikeTargets={props.strikeTargets}
              retaliationData={props.retaliationData}
              assetsData={props.assetsData}
            />
          </div>
        )}

        {activeTab === 'intel' && (
          <div id="tabpanel-intel" role="tabpanel">
            <MobileIntelTab
              claims={props.claims}
              political={props.political}
              timeline={props.timeline}
            />
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
