import { useState, useMemo } from 'react';
import type { FlatEvent } from '../../../lib/timeline-utils';
import type { KpiItem } from '../../../lib/schemas';
import { MAP_CATEGORIES } from '../../../lib/map-utils';
import type { VisualMode } from './cesium-shaders';
import { SAT_GROUPS, type SatGroupCounts } from './useSatellites';
import type { StatsData } from '../../../lib/timeline-bar-utils';

type SheetState = 'minimized' | 'peeked' | 'expanded';
type Tab = 'map' | 'intel' | 'stats';
type MapSection = 'filters' | 'camera' | 'visual' | 'layers';

interface Props {
  activeFilters: Set<string>;
  onToggleFilter: (cat: string) => void;
  pointCounts: Record<string, number>;
  onCameraPreset: (key: string) => void;
  visualMode: VisualMode;
  onVisualMode: (mode: VisualMode) => void;
  layers: { satellites: boolean; flights: boolean; quakes: boolean; weather: boolean; nfz: boolean; ships: boolean };
  onToggleLayer: (layer: 'satellites' | 'flights' | 'quakes' | 'weather' | 'nfz' | 'ships') => void;
  persistLines: boolean;
  onTogglePersist: () => void;
  satGroupCounts?: SatGroupCounts;
  showFov?: boolean;
  onToggleFov?: () => void;
  fovCount?: number;
  aisApiKey?: string;
  onAisApiKeyChange?: (key: string) => void;
  events: FlatEvent[];
  currentDate: string;
  kpis: KpiItem[];
  stats: StatsData;
  cameraPresets?: Record<string, { lon: number; lat: number; alt: number; pitch: number; heading: number; label?: string }>;
  categories?: { id: string; label: string; color: string }[];
}

const VISUAL_MODES: { id: VisualMode; label: string }[] = [
  { id: 'normal', label: 'Standard' },
  { id: 'crt', label: 'CRT' },
  { id: 'nvg', label: 'NVG' },
  { id: 'thermal', label: 'Thermal' },
];

const KPI_COLORS: Record<string, string> = {
  red: '#e74c3c',
  amber: '#f39c12',
  blue: '#3498db',
  green: '#2ecc71',
};

const TYPE_COLORS: Record<string, string> = {
  military: '#e74c3c',
  diplomatic: '#3498db',
  humanitarian: '#f39c12',
  economic: '#2ecc71',
};

const TYPE_LABELS: Record<string, string> = {
  military: 'MIL',
  diplomatic: 'DIP',
  humanitarian: 'HUM',
  economic: 'ECO',
};

export default function MobileBottomSheet({
  activeFilters,
  onToggleFilter,
  pointCounts,
  onCameraPreset,
  visualMode,
  onVisualMode,
  layers,
  onToggleLayer,
  persistLines,
  onTogglePersist,
  satGroupCounts,
  showFov,
  onToggleFov,
  fovCount,
  aisApiKey,
  onAisApiKeyChange,
  events,
  currentDate,
  kpis,
  stats,
  cameraPresets = {},
  categories = [],
}: Props) {
  const [state, setState] = useState<SheetState>('peeked');
  const [tab, setTab] = useState<Tab>('map');
  const [openMapSection, setOpenMapSection] = useState<MapSection | null>(null);
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  const [aisKeyDraft, setAisKeyDraft] = useState('');
  const hasAisKey = !!aisApiKey;

  const cycleState = () => {
    setState(prev => {
      if (prev === 'minimized') return 'peeked';
      if (prev === 'peeked') return 'expanded';
      return 'minimized';
    });
  };

  const toggleMapSection = (s: MapSection) => {
    setOpenMapSection(prev => prev === s ? null : s);
    if (state === 'peeked') setState('expanded');
  };

  const dateEvents = useMemo(
    () => events.filter(ev => ev.resolvedDate === currentDate),
    [events, currentDate],
  );

  const filterCats = categories.length > 0 ? categories : MAP_CATEGORIES;

  const renderMapTab = () => (
    <div className="mobile-sheet-map">
      {/* Filters accordion */}
      <button className="mobile-sheet-accordion-header" onClick={() => toggleMapSection('filters')}>
        <span>Filters</span>
        <span>{openMapSection === 'filters' ? '\u2212' : '+'}</span>
      </button>
      {openMapSection === 'filters' && (
        <div className="mobile-sheet-accordion-body">
          {filterCats.map(c => (
            <button
              key={c.id}
              className={`globe-filter${activeFilters.has(c.id) ? ' active' : ''}`}
              onClick={() => onToggleFilter(c.id)}
            >
              <span className="globe-fdot" style={{ background: c.color }} />
              {c.label}
              {activeFilters.has(c.id) && pointCounts[c.id] > 0 && (
                <span className="globe-filter-count">{pointCounts[c.id]}</span>
              )}
            </button>
          ))}
          <button
            className={`globe-filter globe-persist-toggle${persistLines ? ' active' : ''}`}
            onClick={onTogglePersist}
          >
            <span className="globe-fdot" style={{ background: persistLines ? '#00ff88' : '#555' }} />
            {persistLines ? 'All Days' : 'Day Only'}
          </button>
        </div>
      )}

      {/* Camera accordion */}
      <button className="mobile-sheet-accordion-header" onClick={() => toggleMapSection('camera')}>
        <span>Camera Presets</span>
        <span>{openMapSection === 'camera' ? '\u2212' : '+'}</span>
      </button>
      {openMapSection === 'camera' && (
        <div className="mobile-sheet-accordion-body">
          <div className="globe-preset-grid">
            {Object.entries(cameraPresets).map(([key, preset]) => (
              <button key={key} className="globe-preset-btn" onClick={() => { onCameraPreset(key); setState('minimized'); }}>
                {preset.label || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Visual Mode accordion */}
      <button className="mobile-sheet-accordion-header" onClick={() => toggleMapSection('visual')}>
        <span>Visual Mode</span>
        <span>{openMapSection === 'visual' ? '\u2212' : '+'}</span>
      </button>
      {openMapSection === 'visual' && (
        <div className="mobile-sheet-accordion-body">
          <div className="globe-mode-row">
            {VISUAL_MODES.map(m => (
              <button
                key={m.id}
                className={`globe-mode-btn${visualMode === m.id ? ' active' : ''}`}
                onClick={() => onVisualMode(m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Layers accordion */}
      <button className="mobile-sheet-accordion-header" onClick={() => toggleMapSection('layers')}>
        <span>Intel Layers</span>
        <span>{openMapSection === 'layers' ? '\u2212' : '+'}</span>
      </button>
      {openMapSection === 'layers' && (
        <div className="mobile-sheet-accordion-body">
          <button className={`globe-filter${layers.satellites ? ' active' : ''}`} onClick={() => onToggleLayer('satellites')}>
            <span className="globe-fdot" style={{ background: '#00ffcc' }} />Satellites
          </button>
          {layers.satellites && (
            <>
              <div className="globe-sublabel globe-sublabel-wrap">
                {SAT_GROUPS.map(g => {
                  const cnt = satGroupCounts?.[g.group] ?? 0;
                  return <span key={g.group} style={{ color: g.color }}>&#9679; {g.label}{cnt > 0 ? ` (${cnt})` : ''}</span>;
                })}
              </div>
              {onToggleFov && (
                <button className={`globe-filter globe-fov-toggle${showFov ? ' active' : ''}`} onClick={onToggleFov}>
                  <span className="globe-fdot" style={{ background: showFov ? '#ff8844' : '#555' }} />
                  Sensor FOV
                  {showFov && fovCount != null && fovCount > 0 && <span className="globe-filter-count">{fovCount}</span>}
                </button>
              )}
            </>
          )}
          <button className={`globe-filter${layers.flights ? ' active' : ''}`} onClick={() => onToggleLayer('flights')}>
            <span className="globe-fdot" style={{ background: '#00aaff' }} />Flights
          </button>
          <button className={`globe-filter${layers.ships ? ' active' : ''}`} onClick={() => onToggleLayer('ships')}>
            <span className="globe-fdot" style={{ background: '#00ddaa' }} />Ships (AIS)
          </button>
          {layers.ships && !hasAisKey && (
            <div className="globe-ais-key-input">
              <input
                type="password"
                placeholder="AISStream.io API key"
                value={aisKeyDraft}
                onChange={e => setAisKeyDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && aisKeyDraft.trim()) onAisApiKeyChange?.(aisKeyDraft.trim());
                }}
              />
              <button
                className="globe-ais-key-save"
                onClick={() => { if (aisKeyDraft.trim()) onAisApiKeyChange?.(aisKeyDraft.trim()); }}
                disabled={!aisKeyDraft.trim()}
              >
                Connect
              </button>
            </div>
          )}
          {layers.ships && hasAisKey && (
            <div className="globe-sublabel" style={{ gap: '6px' }}>
              <span style={{ color: '#00ddaa' }}>AIS connected</span>
              <button className="globe-ais-key-clear" onClick={() => onAisApiKeyChange?.('')}>&#x2715;</button>
            </div>
          )}
          <button className={`globe-filter${layers.quakes ? ' active' : ''}`} onClick={() => onToggleLayer('quakes')}>
            <span className="globe-fdot" style={{ background: '#ff6644' }} />Seismic
          </button>
          <button className={`globe-filter${layers.weather ? ' active' : ''}`} onClick={() => onToggleLayer('weather')}>
            <span className="globe-fdot" style={{ background: '#88ccff' }} />Weather
          </button>
          <button className={`globe-filter${layers.nfz ? ' active' : ''}`} onClick={() => onToggleLayer('nfz')}>
            <span className="globe-fdot" style={{ background: '#e74c3c' }} />No-Fly Zones
          </button>
        </div>
      )}
    </div>
  );

  const renderIntelTab = () => (
    <div className="mobile-sheet-intel">
      {dateEvents.length === 0 ? (
        <div className="globe-events-empty">No events for this date</div>
      ) : (
        dateEvents.map(ev => (
          <div key={ev.id} className="globe-event-card">
            <div
              className="globe-event-card-header"
              onClick={() => setExpandedEvent(expandedEvent === ev.id ? null : ev.id)}
            >
              <span className="globe-event-type-badge" style={{ color: TYPE_COLORS[ev.type] || '#888' }}>
                {TYPE_LABELS[ev.type] || ev.type.toUpperCase()}
              </span>
              <h4 className="globe-event-title">{ev.title}</h4>
              <span className="globe-event-expand">{expandedEvent === ev.id ? '\u2212' : '+'}</span>
            </div>
            {expandedEvent === ev.id && (
              <div className="globe-event-detail">
                <p className="globe-event-body">{ev.detail}</p>
                <div className="globe-event-sources">
                  {ev.sources.map((src, i) => (
                    <span key={i} className={`source-chip t${src.tier}`}>
                      {src.url ? (
                        <a href={src.url} target="_blank" rel="noopener noreferrer">{src.name}</a>
                      ) : src.name}
                      <span className="globe-event-tier">T{src.tier}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );

  const renderStatsTab = () => (
    <div className="mobile-sheet-stats">
      <div className="mobile-sheet-kpi-grid">
        {kpis.map(k => (
          <div key={k.id} className="globe-kpi" style={{ borderColor: KPI_COLORS[k.color] || '#555' }}>
            <span className="globe-kpi-value" style={{ color: KPI_COLORS[k.color] }}>{k.value}</span>
            <span className="globe-kpi-label">{k.label}</span>
            {k.delta && (
              <span className={`globe-kpi-delta ${k.trend === 'up' ? 'up' : k.trend === 'down' ? 'down' : ''}`}>
                {k.delta}
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="mobile-sheet-counts">
        <span>{stats.locations} locations</span>
        <span style={{ opacity: 0.3 }}>&middot;</span>
        <span>{stats.vectors} vectors</span>
        {stats.sats != null && <><span style={{ opacity: 0.3 }}>&middot;</span><span style={{ color: '#00ff88' }}>{stats.sats} sats</span></>}
        {stats.flights != null && <><span style={{ opacity: 0.3 }}>&middot;</span><span style={{ color: '#00aaff' }}>{stats.flights} flights</span></>}
        {stats.quakes != null && <><span style={{ opacity: 0.3 }}>&middot;</span><span style={{ color: '#ff6644' }}>{stats.quakes} quakes</span></>}
        {stats.ships != null && <><span style={{ opacity: 0.3 }}>&middot;</span><span style={{ color: '#00ddaa' }}>{stats.ships} ships</span></>}
        {stats.historical && <><span style={{ opacity: 0.3 }}>&middot;</span><span style={{ color: '#9498a8' }}>HISTORICAL</span></>}
      </div>
    </div>
  );

  return (
    <div className={`mobile-sheet ${state}`}>
      <div className="mobile-sheet-handle" onClick={cycleState}>
        <div className="mobile-sheet-handle-bar" />
      </div>
      {state !== 'minimized' && (
        <>
          <div className="mobile-sheet-tabs">
            <button
              className={`mobile-sheet-tab${tab === 'map' ? ' active' : ''}`}
              onClick={() => setTab('map')}
            >
              MAP
            </button>
            <button
              className={`mobile-sheet-tab${tab === 'intel' ? ' active' : ''}`}
              onClick={() => setTab('intel')}
            >
              INTEL
              {dateEvents.length > 0 && <span className="mobile-sheet-tab-badge">{dateEvents.length}</span>}
            </button>
            <button
              className={`mobile-sheet-tab${tab === 'stats' ? ' active' : ''}`}
              onClick={() => setTab('stats')}
            >
              STATS
            </button>
          </div>
          <div className="mobile-sheet-content">
            {tab === 'map' && renderMapTab()}
            {tab === 'intel' && renderIntelTab()}
            {tab === 'stats' && renderStatsTab()}
          </div>
        </>
      )}
    </div>
  );
}
