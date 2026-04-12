/**
 * GlobeMobileSheet — swipeable bottom sheet for mobile globe view (<=768px).
 *
 * Replaces all desktop side-panels with a single bottom sheet that has three
 * snap states: peek (timeline controls visible), half (active tab content),
 * and full (scrollable content at ~85vh).
 *
 * Tabs: Timeline | Mission | Intel | Filters
 * Mission tab only appears when missionTrajectory is provided.
 */
import { useState, useRef, useCallback, useEffect, useMemo, type MutableRefObject, type ReactNode } from 'react';
import type { FlatEvent } from '../../../lib/timeline-utils';
import type { MapPoint, MapLine, KpiItem, MissionTrajectory } from '../../../lib/schemas';
import type { VisualMode } from './cesium-shaders';
import type { TelemetryState } from './mission-helpers';
import type { VectorToggles } from './useMissionVectors';
import type { VectorSet } from './mission-vectors';
import type { CarouselEntity } from './FloatingFactCard';
import type { TimelineZoomLevel, StatsData } from '../../../lib/timeline-bar-utils';

/* ── Types ─────────────────────────────────────────── */

type SheetState = 'peek' | 'half' | 'full';
type TabId = 'timeline' | 'mission' | 'intel' | 'filters' | 'detail';

interface Props {
  /* Timeline props */
  minDate: string;
  maxDate: string;
  currentDate: string;
  isPlaying: boolean;
  playbackSpeed: number;
  events: FlatEvent[];
  lines: MapLine[];
  onDateChange: (date: string) => void;
  onTogglePlay: () => void;
  onSpeedChange: (speed: number) => void;
  onGoLive: () => void;
  onTimeChange?: (ms: number) => void;
  simTimeRef: MutableRefObject<number>;
  stats?: StatsData;
  zoomLevel: TimelineZoomLevel;
  onZoomChange: (level: TimelineZoomLevel) => void;
  isHistorical: boolean;
  clocks?: { label: string; offsetHours: number }[];

  /* Mission props (optional) */
  missionTrajectory?: MissionTrajectory | null;
  telemetryRef?: MutableRefObject<TelemetryState>;
  showMissionHeader?: boolean;
  vectorsRef?: MutableRefObject<VectorSet | null>;
  vectorToggles?: VectorToggles;
  onToggleVector?: (key: keyof VectorToggles) => void;
  onTrackSpacecraft?: () => void;

  /* Intel props */
  eventsOpen: boolean;
  onToggleEvents: () => void;
  activeEventId?: string | null;

  /* Filters props */
  activeFilters: Set<string>;
  onToggleFilter: (cat: string) => void;
  pointCounts: Record<string, number>;
  categories: { id: string; label: string; color: string }[];
  visualMode: VisualMode;
  onVisualMode: (mode: VisualMode) => void;
  layers: {
    satellites: boolean; flights: boolean; quakes: boolean; weather: boolean;
    nfz: boolean; ships: boolean; gpsJam: boolean; internetBlackout: boolean; groundTruth: boolean;
  };
  onToggleLayer: (layer: 'satellites' | 'flights' | 'quakes' | 'weather' | 'nfz' | 'ships' | 'gpsJam' | 'internetBlackout' | 'groundTruth') => void;
  persistLines: boolean;
  onTogglePersist: () => void;

  /* Detail card (when fact card is tapped on globe) */
  carouselEntities: CarouselEntity[];
  activeCardIndex: number;
  onCloseCard: () => void;

  /* Children: timeline bar component is passed in to avoid circular imports */
  timelineBar: ReactNode;
}

/* ── Snap points (px from bottom of viewport) ─────── */

const PEEK_HEIGHT = 80;
const HALF_RATIO = 0.50;
const FULL_RATIO = 0.85;

function getSnapY(state: SheetState, vh: number): number {
  switch (state) {
    case 'peek': return vh - PEEK_HEIGHT;
    case 'half': return vh * (1 - HALF_RATIO);
    case 'full': return vh * (1 - FULL_RATIO);
  }
}

/* ── Visual mode list ─────────────────────────────── */

const VISUAL_MODES: { id: VisualMode; label: string }[] = [
  { id: 'normal', label: 'Standard' },
  { id: 'crt', label: 'CRT' },
  { id: 'nvg', label: 'Night Vision' },
  { id: 'thermal', label: 'FLIR' },
  { id: 'panoptic', label: 'Panoptic' },
];

/* ── Event type colors ────────────────────────────── */

const TYPE_COLORS: Record<string, string> = {
  military: '#e74c3c',
  diplomatic: '#3498db',
  humanitarian: '#f39c12',
  economic: '#2ecc71',
};

/* ── Tab icons (SVG inline) ───────────────────────── */

function TabIcon({ tab }: { tab: TabId }) {
  const size = 18;
  switch (tab) {
    case 'timeline':
      return (
        <svg viewBox="0 0 16 16" width={size} height={size}>
          <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.3"/>
          <path d="M8 4v4l3 2" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        </svg>
      );
    case 'mission':
      return (
        <svg viewBox="0 0 16 16" width={size} height={size}>
          <path d="M8 1l2 5h-1.5v7h-1V6H6z" fill="currentColor"/>
          <path d="M5 13h6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          <circle cx="4" cy="14" r="1" fill="currentColor" opacity="0.5"/>
          <circle cx="12" cy="14" r="1" fill="currentColor" opacity="0.5"/>
        </svg>
      );
    case 'intel':
      return (
        <svg viewBox="0 0 16 16" width={size} height={size}>
          <path d="M2 3h12M2 7h12M2 11h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      );
    case 'filters':
      return (
        <svg viewBox="0 0 16 16" width={size} height={size}>
          <path d="M2 4h12M4 8h8M6 12h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      );
    case 'detail':
      return (
        <svg viewBox="0 0 16 16" width={size} height={size}>
          <rect x="2" y="2" width="12" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.3"/>
          <path d="M5 6h6M5 9h4" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
        </svg>
      );
  }
}

/* ── Component ────────────────────────────────────── */

export default function GlobeMobileSheet(props: Props) {
  const {
    events, currentDate, activeEventId,
    activeFilters, onToggleFilter, pointCounts, categories,
    visualMode, onVisualMode,
    layers, onToggleLayer,
    persistLines, onTogglePersist,
    missionTrajectory, telemetryRef, vectorsRef, vectorToggles, onToggleVector, onTrackSpacecraft,
    carouselEntities, activeCardIndex, onCloseCard,
    timelineBar,
  } = props;

  const [sheetState, setSheetState] = useState<SheetState>('half');
  const [activeTab, setActiveTab] = useState<TabId>('timeline');
  const [translateY, setTranslateY] = useState<number | null>(null); // null = snapped
  const sheetRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<{ y: number; time: number; startTranslateY: number } | null>(null);
  const vhRef = useRef(typeof window !== 'undefined' ? window.innerHeight : 800);

  // Available tabs
  const tabs = useMemo<TabId[]>(() => {
    const t: TabId[] = ['timeline'];
    if (missionTrajectory) t.push('mission');
    t.push('intel', 'filters');
    if (carouselEntities.length > 0) t.push('detail');
    return t;
  }, [missionTrajectory, carouselEntities.length]);

  // Auto-switch to detail tab when a fact card is tapped
  useEffect(() => {
    if (carouselEntities.length > 0) {
      setActiveTab('detail');
      if (sheetState === 'peek') setSheetState('half');
    } else if (activeTab === 'detail') {
      setActiveTab('timeline');
    }
  }, [carouselEntities.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for viewport changes
  useEffect(() => {
    const onResize = () => { vhRef.current = window.innerHeight; };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Compute current Y
  const snapY = getSnapY(sheetState, vhRef.current);
  const currentY = translateY ?? snapY;

  /* ── Touch handling ──────────────────────────────── */

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = {
      y: touch.clientY,
      time: Date.now(),
      startTranslateY: translateY ?? getSnapY(sheetState, vhRef.current),
    };
  }, [translateY, sheetState]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const touch = e.touches[0];
    const dy = touch.clientY - touchStartRef.current.y;
    const newY = Math.max(
      getSnapY('full', vhRef.current),
      Math.min(vhRef.current - 40, touchStartRef.current.startTranslateY + dy),
    );
    setTranslateY(newY);
  }, []);

  const onTouchEnd = useCallback(() => {
    if (!touchStartRef.current) return;
    const vh = vhRef.current;
    const endY = translateY ?? getSnapY(sheetState, vh);
    const dy = endY - touchStartRef.current.startTranslateY;
    const elapsed = Date.now() - touchStartRef.current.time;
    const velocity = dy / Math.max(elapsed, 1);

    // Determine target snap based on velocity or position
    const peekY = getSnapY('peek', vh);
    const halfY = getSnapY('half', vh);
    const fullY = getSnapY('full', vh);

    let target: SheetState;

    // Fast swipe detection
    if (Math.abs(velocity) > 0.5) {
      if (velocity < 0) {
        // Swiping up
        target = sheetState === 'peek' ? 'half' : 'full';
      } else {
        // Swiping down
        target = sheetState === 'full' ? 'half' : 'peek';
      }
    } else {
      // Position-based snap
      const distPeek = Math.abs(endY - peekY);
      const distHalf = Math.abs(endY - halfY);
      const distFull = Math.abs(endY - fullY);
      const minDist = Math.min(distPeek, distHalf, distFull);
      if (minDist === distFull) target = 'full';
      else if (minDist === distHalf) target = 'half';
      else target = 'peek';
    }

    touchStartRef.current = null;
    setTranslateY(null);
    setSheetState(target);
  }, [translateY, sheetState]);

  /* ── Tab click handler ──────────────────────────── */

  const handleTabClick = useCallback((tab: TabId) => {
    setActiveTab(tab);
    if (sheetState === 'peek' && tab !== 'timeline') {
      setSheetState('half');
    }
  }, [sheetState]);

  /* ── Date events for intel tab ──────────────────── */

  const dateEvents = useMemo(
    () => events.filter(ev => ev.resolvedDate === currentDate),
    [events, currentDate],
  );

  /* ── Render tab content ─────────────────────────── */

  const renderTimelineContent = () => (
    <div className="mobile-sheet-timeline">
      {timelineBar}
    </div>
  );

  const renderMissionContent = () => {
    if (!missionTrajectory || !telemetryRef) return null;
    return (
      <div className="mobile-sheet-mission">
        <MissionCompact
          telemetryRef={telemetryRef}
          vehicle={missionTrajectory.vehicle}
          onTrackSpacecraft={onTrackSpacecraft}
          vectorsRef={vectorsRef}
          vectorToggles={vectorToggles}
          onToggleVector={onToggleVector}
        />
      </div>
    );
  };

  const renderIntelContent = () => (
    <div className="mobile-sheet-intel">
      <div className="mobile-sheet-section-title">
        INTEL FEED
        <span className="mobile-sheet-badge">{dateEvents.length}</span>
      </div>
      {dateEvents.length === 0 ? (
        <div className="mobile-sheet-empty">No events for this date</div>
      ) : (
        <div className="mobile-sheet-event-list">
          {dateEvents.map(ev => (
            <MobileEventCard key={ev.id} event={ev} isActive={activeEventId === ev.id} />
          ))}
        </div>
      )}
    </div>
  );

  const renderFiltersContent = () => (
    <div className="mobile-sheet-filters">
      <div className="mobile-sheet-section-title">CATEGORY FILTERS</div>
      <div className="mobile-sheet-filter-grid">
        {categories.map(c => (
          <button
            key={c.id}
            className={`mobile-sheet-filter-btn${activeFilters.has(c.id) ? ' active' : ''}`}
            onClick={() => onToggleFilter(c.id)}
          >
            <span className="mobile-sheet-fdot" style={{ background: c.color }} />
            {c.label}
            {activeFilters.has(c.id) && pointCounts[c.id] > 0 && (
              <span className="mobile-sheet-filter-count">{pointCounts[c.id]}</span>
            )}
          </button>
        ))}
      </div>

      <button
        className={`mobile-sheet-filter-btn${persistLines ? ' active' : ''}`}
        onClick={onTogglePersist}
        style={{ marginTop: 8 }}
      >
        <span className="mobile-sheet-fdot" style={{ background: persistLines ? '#00ff88' : '#555' }} />
        {persistLines ? 'All Days' : 'Day Only'}
      </button>

      <div className="mobile-sheet-section-title" style={{ marginTop: 16 }}>VISUAL MODE</div>
      <div className="mobile-sheet-mode-row">
        {VISUAL_MODES.map(m => (
          <button
            key={m.id}
            className={`mobile-sheet-mode-btn${visualMode === m.id ? ' active' : ''}`}
            onClick={() => onVisualMode(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="mobile-sheet-section-title" style={{ marginTop: 16 }}>INTEL LAYERS</div>
      <div className="mobile-sheet-filter-grid">
        {([
          { key: 'satellites' as const, label: 'Satellites', color: '#00ffcc' },
          { key: 'flights' as const, label: 'Flights', color: '#00aaff' },
          { key: 'ships' as const, label: 'Ships', color: '#00ddaa' },
          { key: 'quakes' as const, label: 'Seismic', color: '#ff6644' },
          { key: 'weather' as const, label: 'Weather', color: '#88ccff' },
          { key: 'nfz' as const, label: 'Airspace', color: '#e74c3c' },
          { key: 'gpsJam' as const, label: 'GPS Jam', color: '#ff2244' },
          { key: 'internetBlackout' as const, label: 'Internet', color: '#ff6644' },
          { key: 'groundTruth' as const, label: 'Fact Cards', color: '#ffaa00' },
        ]).map(l => (
          <button
            key={l.key}
            className={`mobile-sheet-filter-btn${layers[l.key] ? ' active' : ''}`}
            onClick={() => onToggleLayer(l.key)}
          >
            <span className="mobile-sheet-fdot" style={{ background: l.color }} />
            {l.label}
          </button>
        ))}
      </div>
    </div>
  );

  const renderDetailContent = () => {
    if (carouselEntities.length === 0) return null;
    const entity = carouselEntities[activeCardIndex];
    if (!entity) return null;

    return (
      <div className="mobile-sheet-detail">
        <div className="mobile-sheet-detail-header">
          <div className="mobile-sheet-section-title">
            {entity.type === 'map-point' && entity.point ? entity.point.label : entity.name || 'Entity'}
          </div>
          <button className="mobile-sheet-detail-close" onClick={onCloseCard} aria-label="Close detail">
            &times;
          </button>
        </div>
        {entity.type === 'map-point' && entity.point && (
          <div className="mobile-sheet-detail-body">
            <div className="mobile-sheet-detail-row">
              <span className="mobile-sheet-detail-label">Category</span>
              <span>{entity.point.cat}</span>
            </div>
            <div className="mobile-sheet-detail-row">
              <span className="mobile-sheet-detail-label">Date</span>
              <span>{entity.point.date}</span>
            </div>
            <div className="mobile-sheet-detail-row">
              <span className="mobile-sheet-detail-label">Location</span>
              <span>{entity.point.sub}</span>
            </div>
            <div className="mobile-sheet-detail-row">
              <span className="mobile-sheet-detail-label">Source Tier</span>
              <span>T{entity.point.tier}</span>
            </div>
          </div>
        )}
        {entity.type === 'generic' && entity.description && (
          <p className="mobile-sheet-detail-text">{entity.description}</p>
        )}
      </div>
    );
  };

  const tabContent: Record<TabId, () => ReactNode> = {
    timeline: renderTimelineContent,
    mission: renderMissionContent,
    intel: renderIntelContent,
    filters: renderFiltersContent,
    detail: renderDetailContent,
  };

  const tabLabels: Record<TabId, string> = {
    timeline: 'Timeline',
    mission: 'Mission',
    intel: 'Intel',
    filters: 'Filters',
    detail: 'Detail',
  };

  /* ── Sheet styles ───────────────────────────────── */

  const isAnimating = translateY === null;
  const sheetStyle: React.CSSProperties = {
    position: 'fixed',
    left: 0,
    right: 0,
    bottom: 0,
    height: `${vhRef.current}px`,
    transform: `translateY(${currentY}px)`,
    transition: isAnimating ? 'transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)' : 'none',
    zIndex: 200,
    display: 'flex',
    flexDirection: 'column',
    background: 'rgba(10, 11, 14, 0.95)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    borderTop: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '12px 12px 0 0',
    touchAction: 'none',
    willChange: 'transform',
  };

  return (
    <div
      ref={sheetRef}
      className="globe-mobile-sheet"
      style={sheetStyle}
    >
      {/* Drag handle */}
      <div
        className="mobile-sheet-drag-area"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div className="mobile-sheet-drag-handle" />
      </div>

      {/* Tab bar */}
      <div className="mobile-sheet-tabs">
        {tabs.map(tab => (
          <button
            key={tab}
            className={`mobile-sheet-tab${activeTab === tab ? ' active' : ''}`}
            onClick={() => handleTabClick(tab)}
          >
            <TabIcon tab={tab} />
            <span className="mobile-sheet-tab-label">{tabLabels[tab]}</span>
            {tab === 'intel' && dateEvents.length > 0 && (
              <span className="mobile-sheet-tab-badge">{dateEvents.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Content area */}
      <div className="mobile-sheet-content">
        {tabContent[activeTab]?.()}
      </div>
    </div>
  );
}

/* ── Sub-components ────────────────────────────────── */

/** Compact mission panel for mobile sheet */
function MissionCompact({
  telemetryRef,
  vehicle,
  onTrackSpacecraft,
  vectorsRef,
  vectorToggles,
  onToggleVector,
}: {
  telemetryRef: MutableRefObject<TelemetryState>;
  vehicle: string;
  onTrackSpacecraft?: () => void;
  vectorsRef?: MutableRefObject<VectorSet | null>;
  vectorToggles?: VectorToggles;
  onToggleVector?: (key: keyof VectorToggles) => void;
}) {
  const phaseRef = useRef<HTMLSpanElement>(null);
  const altRef = useRef<HTMLSpanElement>(null);
  const velRef = useRef<HTMLSpanElement>(null);
  const moonDistRef = useRef<HTMLSpanElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const tick = () => {
      const t = telemetryRef.current;
      if (phaseRef.current) phaseRef.current.textContent = t.currentPhase?.label ?? 'Pre-Launch';
      if (altRef.current) altRef.current.textContent = formatDistanceCompact(t.altitudeKm);
      if (velRef.current) velRef.current.textContent = formatVelocityCompact(t.velocityKmS);
      if (moonDistRef.current) moonDistRef.current.textContent = formatDistanceCompact(t.distToMoonKm);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [telemetryRef]);

  return (
    <div className="mobile-mission-compact">
      <div className="mobile-mission-header">
        <div className="mobile-mission-vehicle">{vehicle}</div>
        <div className="mobile-mission-phase">
          <span className="mobile-mission-phase-dot" />
          <span ref={phaseRef}>Pre-Launch</span>
        </div>
        {onTrackSpacecraft && (
          <button className="mobile-mission-track-btn" onClick={onTrackSpacecraft}>
            TRACK
          </button>
        )}
      </div>
      <div className="mobile-mission-telemetry">
        <div className="mobile-mission-metric">
          <span className="mobile-mission-metric-label" style={{ color: '#60a5fa' }}>ALT</span>
          <span ref={altRef} className="mobile-mission-metric-value">0 km</span>
        </div>
        <div className="mobile-mission-metric">
          <span className="mobile-mission-metric-label" style={{ color: '#00ffaa' }}>VEL</span>
          <span ref={velRef} className="mobile-mission-metric-value">0 m/s</span>
        </div>
        <div className="mobile-mission-metric">
          <span className="mobile-mission-metric-label" style={{ color: '#a78bfa' }}>MOON</span>
          <span ref={moonDistRef} className="mobile-mission-metric-value">0 km</span>
        </div>
      </div>
      {vectorToggles && onToggleVector && (
        <div className="mobile-mission-vectors">
          <div className="mobile-sheet-section-title" style={{ marginTop: 12 }}>VECTORS</div>
          <div className="mobile-sheet-filter-grid">
            {([
              { key: 'velocity' as const, label: 'Velocity', color: '#00ffaa' },
              { key: 'gravityEarth' as const, label: 'Earth Gravity', color: '#ff9500' },
              { key: 'gravityMoon' as const, label: 'Moon Gravity', color: '#bf7fff' },
              { key: 'thrust' as const, label: 'Thrust', color: '#ff3333' },
            ]).map(v => (
              <button
                key={v.key}
                className={`mobile-sheet-filter-btn${vectorToggles[v.key] ? ' active' : ''}`}
                onClick={() => onToggleVector(v.key)}
              >
                <span className="mobile-sheet-fdot" style={{ background: v.color }} />
                {v.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Compact mobile event card */
function MobileEventCard({ event, isActive }: { event: FlatEvent; isActive: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const thumb = event.media?.find(m => m.thumbnail)?.thumbnail;
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <div className={`mobile-event-card${isActive ? ' active' : ''}`}>
      <button
        className="mobile-event-card-header"
        onClick={() => setExpanded(prev => !prev)}
      >
        {thumb && !imgFailed ? (
          <img
            className="mobile-event-card-thumb"
            src={thumb}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <span
            className="mobile-event-type-dot"
            style={{ background: TYPE_COLORS[event.type] || '#888' }}
          />
        )}
        <span className="mobile-event-title">{event.title}</span>
        <span className="mobile-event-expand">{expanded ? '\u2212' : '+'}</span>
      </button>
      {expanded && (
        <div className="mobile-event-detail">
          <p>{event.detail}</p>
          {event.sources && event.sources.length > 0 && (
            <div className="mobile-event-sources">
              {event.sources.map((src, i) => (
                <span key={i} className={`source-chip t${src.tier}`}>
                  {src.url ? (
                    <a href={src.url} target="_blank" rel="noopener noreferrer">{src.name}</a>
                  ) : src.name}
                  <span className="mobile-event-tier">T{src.tier}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Formatting helpers (compact for mobile) ─────── */

function formatDistanceCompact(km: number): string {
  if (km < 1) return `${(km * 1000).toFixed(0)} m`;
  if (km < 1000) return `${km.toFixed(0)} km`;
  return `${(km / 1000).toFixed(1)}K km`;
}

function formatVelocityCompact(kmS: number): string {
  if (kmS < 0.001) return `${(kmS * 1000000).toFixed(0)} mm/s`;
  if (kmS < 1) return `${(kmS * 1000).toFixed(0)} m/s`;
  return `${kmS.toFixed(2)} km/s`;
}
