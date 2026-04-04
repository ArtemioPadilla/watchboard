// src/components/islands/mobile/MobileTabShell.tsx
import { useState, useMemo, useCallback, useRef } from 'react';
import MobileHeader from './MobileHeader';
import MobileTabBar, { type MobileTab } from './MobileTabBar';
import MobileMapTab from './MobileMapTab';
import MobileFeedTab from './MobileFeedTab';
import MobileDataTab from './MobileDataTab';
import MobileIntelTab from './MobileIntelTab';
import { haptic } from '../../../lib/haptic';
import type { MapPoint, MapLine, KpiItem, CasualtyRow, EconItem, Claim, PolItem, TimelineEra, StrikeItem, Asset, Meta } from '../../../lib/schemas';
import type { FlatEvent } from '../../../lib/timeline-utils';
import type { MapCategory } from '../../../lib/map-utils';

const TAB_ORDER: MobileTab[] = ['map', 'feed', 'data', 'intel'];
const SWIPE_THRESHOLD = 80;

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
  // Globe-specific (optional)
  meta?: Meta;
  cameraPresets?: Record<string, { lon: number; lat: number; alt: number; pitch: number; heading: number; label?: string }>;
  endDate?: string;
  clocks?: { label: string; offsetHours: number }[];
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

  // ── Swipe between tabs (#1) ──
  const swipeRef = useRef<{ x: number; y: number; t: number } | null>(null);

  const handleSwipeStart = useCallback((e: React.TouchEvent) => {
    swipeRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      t: Date.now(),
    };
  }, []);

  const handleSwipeEnd = useCallback((e: React.TouchEvent) => {
    if (!swipeRef.current) return;
    // Skip swipe on map tab — map needs full touch control
    if (activeTab === 'map') { swipeRef.current = null; return; }

    const dx = e.changedTouches[0].clientX - swipeRef.current.x;
    const dy = e.changedTouches[0].clientY - swipeRef.current.y;
    const dt = Date.now() - swipeRef.current.t;
    swipeRef.current = null;

    // Must be fast, mostly horizontal, and exceed threshold
    if (dt > 400 || Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) < Math.abs(dy) * 1.5) return;

    const idx = TAB_ORDER.indexOf(activeTab);
    if (dx < 0 && idx < TAB_ORDER.length - 1) {
      setActiveTab(TAB_ORDER[idx + 1]);
      haptic();
    } else if (dx > 0 && idx > 0) {
      setActiveTab(TAB_ORDER[idx - 1]);
      haptic();
    }
  }, [activeTab]);

  const handleTabChange = useCallback((tab: MobileTab) => {
    setActiveTab(tab);
    haptic();
  }, []);

  return (
    <div className="mtab-shell">
      <MobileHeader
        operationName={props.operationName}
        mapMode={mapMode}
        onToggleMapMode={toggleMapMode}
        globeEnabled={props.globeEnabled}
        isHistorical={props.isHistorical}
      />

      <div
        className="mtab-content"
        onTouchStart={handleSwipeStart}
        onTouchEnd={handleSwipeEnd}
      >
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
            meta={props.meta}
            cameraPresets={props.cameraPresets}
            isHistorical={props.isHistorical}
            endDate={props.endDate}
            clocks={props.clocks}
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
        onTabChange={handleTabChange}
        feedBadge={feedBadge}
      />
    </div>
  );
}
