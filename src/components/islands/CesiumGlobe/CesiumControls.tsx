import { useState, useRef, useEffect } from 'react';
import { MAP_CATEGORIES } from '../../../lib/map-utils';
import type { VisualMode } from './cesium-shaders';
import type { OrbitMode } from './useCesiumCamera';
import { SAT_GROUPS, type SatGroupCounts } from './useSatellites';
import type { VectorToggles } from './useMissionVectors';

interface Props {
  activeFilters: Set<string>;
  onToggleFilter: (cat: string) => void;
  pointCounts: Record<string, number>;
  onCameraPreset: (key: string) => void;
  visualMode: VisualMode;
  onVisualMode: (mode: VisualMode) => void;
  layers: {
    satellites: boolean; flights: boolean; quakes: boolean; weather: boolean;
    nfz: boolean; ships: boolean; gpsJam: boolean; internetBlackout: boolean; groundTruth: boolean;
  };
  onToggleLayer: (layer: 'satellites' | 'flights' | 'quakes' | 'weather' | 'nfz' | 'ships' | 'gpsJam' | 'internetBlackout' | 'groundTruth') => void;
  persistLines: boolean;
  onTogglePersist: () => void;
  satGroupCounts?: SatGroupCounts;
  showFov?: boolean;
  onToggleFov?: () => void;
  fovCount?: number;
  aisApiKey?: string;
  onAisApiKeyChange?: (key: string) => void;
  showHud?: boolean;
  onToggleHud?: () => void;
  orbitMode?: OrbitMode;
  onOrbitMode?: (mode: OrbitMode) => void;
  cameraPresets?: Record<string, { lon: number; lat: number; alt: number; pitch: number; heading: number; label?: string }>;
  categories?: { id: string; label: string; color: string }[];
  cinematicMode?: boolean;
  onToggleCinematic?: () => void;
  vectorToggles?: VectorToggles;
  onToggleVector?: (key: keyof VectorToggles) => void;
}

type ToolbarSection = 'filters' | 'camera' | 'visual' | 'layers' | 'vectors';

const VISUAL_MODES: { id: VisualMode; label: string }[] = [
  { id: 'normal', label: 'Standard' },
  { id: 'crt', label: 'CRT' },
  { id: 'nvg', label: 'Night Vision' },
  { id: 'thermal', label: 'FLIR' },
  { id: 'panoptic', label: 'Panoptic' },
];

const ORBIT_MODES: { id: OrbitMode; label: string }[] = [
  { id: 'off', label: 'OFF' },
  { id: 'flat', label: 'FLAT' },
  { id: 'spiral_in', label: 'SPIRAL IN' },
  { id: 'spiral_out', label: 'SPIRAL OUT' },
];

export default function CesiumControls({
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
  showHud,
  onToggleHud,
  orbitMode,
  onOrbitMode,
  cameraPresets = {},
  categories = [],
  cinematicMode,
  onToggleCinematic,
  vectorToggles,
  onToggleVector,
}: Props) {
  const [activeSection, setActiveSection] = useState<ToolbarSection | null>(null);
  const [aisKeyDraft, setAisKeyDraft] = useState('');
  const hasAisKey = !!aisApiKey;
  const toolbarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!activeSection) return;
    const handler = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setActiveSection(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [activeSection]);

  const toggle = (s: ToolbarSection) => setActiveSection(prev => prev === s ? null : s);

  const filterCats = categories.length > 0 ? categories : MAP_CATEGORIES;

  const renderFilters = () => (
    <div className="globe-toolbar-flyout">
      <div className="globe-control-label">Filters</div>
      {filterCats.map(c => (
        <button
          key={c.id}
          className={`globe-filter${activeFilters.has(c.id) ? ' active' : ''}`}
          onClick={() => onToggleFilter(c.id)}
          aria-pressed={activeFilters.has(c.id)}
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
        aria-pressed={persistLines}
        title={persistLines ? 'Showing all past arcs' : 'Showing current day arcs only'}
      >
        <span className="globe-fdot" style={{ background: persistLines ? '#00ff88' : '#555' }} />
        {persistLines ? 'All Days' : 'Day Only'}
      </button>
    </div>
  );

  const renderCamera = () => (
    <div className="globe-toolbar-flyout">
      <div className="globe-control-label">Camera Presets</div>
      <div className="globe-preset-grid">
        {Object.entries(cameraPresets).map(([key, preset]) => (
          <button key={key} className="globe-preset-btn" onClick={() => { onCameraPreset(key); setActiveSection(null); }}>
            {preset.label || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
          </button>
        ))}
      </div>
      {onOrbitMode && (
        <>
          <div className="globe-control-label" style={{ marginTop: '8px' }}>Orbit Mode</div>
          <div className="globe-mode-row">
            {ORBIT_MODES.map(m => (
              <button
                key={m.id}
                className={`globe-mode-btn${orbitMode === m.id ? ' active' : ''}`}
                onClick={() => onOrbitMode(m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>
        </>
      )}
      {onToggleHud && (
        <>
          <div className="globe-control-label" style={{ marginTop: '8px' }}>HUD</div>
          <button
            className={`globe-filter${showHud ? ' active' : ''}`}
            onClick={onToggleHud}
            aria-pressed={showHud}
          >
            <span className="globe-fdot" style={{ background: showHud ? '#00ff88' : '#555' }} />
            {showHud ? 'HUD Visible' : 'HUD Hidden'}
          </button>
        </>
      )}
    </div>
  );

  const renderVisual = () => (
    <div className="globe-toolbar-flyout">
      <div className="globe-control-label">Visual Mode</div>
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
  );

  const renderLayers = () => (
    <div className="globe-toolbar-flyout">
      <div className="globe-control-label">Intel Layers</div>
      <button
        className={`globe-filter${layers.satellites ? ' active' : ''}`}
        onClick={() => onToggleLayer('satellites')}
      >
        <span className="globe-fdot" style={{ background: '#00ffcc' }} />
        Satellites
      </button>
      {layers.satellites && (
        <>
          <div className="globe-sublabel globe-sublabel-wrap">
            {SAT_GROUPS.map(g => {
              const cnt = satGroupCounts?.[g.group] ?? 0;
              return (
                <span key={g.group} style={{ color: g.color }}>
                  &#9679; {g.label}{cnt > 0 ? ` (${cnt})` : ''}
                </span>
              );
            })}
          </div>
          {onToggleFov && (
            <button
              className={`globe-filter globe-fov-toggle${showFov ? ' active' : ''}`}
              onClick={onToggleFov}
              aria-pressed={showFov}
              title={showFov ? 'Hide sensor FOV + targeting lines' : 'Show sensor FOV + targeting lines'}
            >
              <span className="globe-fdot" style={{ background: showFov ? '#ff8844' : '#555' }} />
              Sensor FOV + Targeting
              {showFov && fovCount != null && fovCount > 0 && (
                <span className="globe-filter-count">{fovCount}</span>
              )}
            </button>
          )}
        </>
      )}
      <button
        className={`globe-filter${layers.flights ? ' active' : ''}`}
        onClick={() => onToggleLayer('flights')}
      >
        <span className="globe-fdot" style={{ background: '#00aaff' }} />
        Flights
      </button>
      {layers.flights && (
        <div className="globe-sublabel">
          <span style={{ color: '#00aaff' }}>&#9679; Civilian</span>{' '}
          <span style={{ color: '#ffdd00' }}>&#9679; Military</span>
        </div>
      )}
      <button
        className={`globe-filter${layers.ships ? ' active' : ''}`}
        onClick={() => onToggleLayer('ships')}
      >
        <span className="globe-fdot" style={{ background: '#00ddaa' }} />
        Ships (AIS)
      </button>
      {layers.ships && (
        <>
          <div className="globe-sublabel">
            <span style={{ color: '#00ddaa' }}>&#9679; Underway</span>{' '}
            <span style={{ color: '#888888' }}>&#9679; Anchored</span>
          </div>
          {!hasAisKey ? (
            <div className="globe-ais-key-input">
              <input
                type="password"
                placeholder="AISStream.io API key"
                value={aisKeyDraft}
                onChange={e => setAisKeyDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && aisKeyDraft.trim()) {
                    onAisApiKeyChange?.(aisKeyDraft.trim());
                  }
                }}
              />
              <button
                className="globe-ais-key-save"
                onClick={() => {
                  if (aisKeyDraft.trim()) onAisApiKeyChange?.(aisKeyDraft.trim());
                }}
                disabled={!aisKeyDraft.trim()}
              >
                Connect
              </button>
              <div className="globe-ais-key-hint">
                Free key from <a href="https://aisstream.io" target="_blank" rel="noopener noreferrer">aisstream.io</a>
              </div>
            </div>
          ) : (
            <div className="globe-sublabel" style={{ gap: '6px' }}>
              <span style={{ color: '#00ddaa' }}>AIS connected</span>
              <button
                className="globe-ais-key-clear"
                onClick={() => onAisApiKeyChange?.('')}
                title="Disconnect and clear API key"
              >
                &#x2715;
              </button>
            </div>
          )}
        </>
      )}

      {/* SIGINT / EW Layers */}
      <div className="globe-control-label" style={{ marginTop: '6px' }}>SIGINT / EW</div>
      <button
        className={`globe-filter${layers.gpsJam ? ' active' : ''}`}
        onClick={() => onToggleLayer('gpsJam')}
      >
        <span className="globe-fdot" style={{ background: '#ff2244' }} />
        GPS Jamming
      </button>
      <button
        className={`globe-filter${layers.internetBlackout ? ' active' : ''}`}
        onClick={() => onToggleLayer('internetBlackout')}
      >
        <span className="globe-fdot" style={{ background: '#ff6644' }} />
        Internet Blackout
      </button>

      {/* Fact Cards */}
      <div className="globe-control-label" style={{ marginTop: '6px' }}>Intel Overlays</div>
      <button
        className={`globe-filter${layers.groundTruth ? ' active' : ''}`}
        onClick={() => onToggleLayer('groundTruth')}
      >
        <span className="globe-fdot" style={{ background: '#ffaa00' }} />
        Fact Cards
      </button>

      {/* Existing environmental layers */}
      <div className="globe-control-label" style={{ marginTop: '6px' }}>Environment</div>
      <button
        className={`globe-filter${layers.quakes ? ' active' : ''}`}
        onClick={() => onToggleLayer('quakes')}
      >
        <span className="globe-fdot" style={{ background: '#ff6644' }} />
        Seismic
      </button>
      <button
        className={`globe-filter${layers.weather ? ' active' : ''}`}
        onClick={() => onToggleLayer('weather')}
      >
        <span className="globe-fdot" style={{ background: '#88ccff' }} />
        Weather
      </button>
      {layers.weather && (
        <div className="globe-sublabel">
          <span style={{ color: '#ffffff' }}>&#9679; Cloud</span>{' '}
          <span style={{ color: '#88ccff' }}>&#9679; Wind</span>
        </div>
      )}
      <button
        className={`globe-filter${layers.nfz ? ' active' : ''}`}
        onClick={() => onToggleLayer('nfz')}
      >
        <span className="globe-fdot" style={{ background: '#e74c3c' }} />
        Airspace Closures
      </button>
    </div>
  );

  const sections = {
    filters: renderFilters,
    camera: renderCamera,
    visual: renderVisual,
    layers: renderLayers,
  } as const;

  return (
    <div className="globe-toolbar" ref={toolbarRef}>
      <div className="globe-toolbar-icons">
        <button
          className={`globe-toolbar-icon${activeSection === 'filters' ? ' active' : ''}`}
          onClick={() => toggle('filters')}
          title="Filters"
        >
          <svg viewBox="0 0 16 16" width="16" height="16"><path d="M1 2h14l-5 6v5l-4 2V8z" fill="currentColor"/></svg>
        </button>
        <button
          className={`globe-toolbar-icon${activeSection === 'camera' ? ' active' : ''}`}
          onClick={() => toggle('camera')}
          title="Camera & HUD"
        >
          <svg viewBox="0 0 16 16" width="16" height="16"><path d="M2 4h3l1-2h4l1 2h3v9H2zm6 2a3 3 0 100 6 3 3 0 000-6z" fill="currentColor"/></svg>
        </button>
        <button
          className={`globe-toolbar-icon${activeSection === 'visual' ? ' active' : ''}`}
          onClick={() => toggle('visual')}
          title="Visual Mode"
        >
          <svg viewBox="0 0 16 16" width="16" height="16"><path d="M8 3C4 3 1 8 1 8s3 5 7 5 7-5 7-5-3-5-7-5zm0 8a3 3 0 110-6 3 3 0 010 6z" fill="currentColor"/></svg>
        </button>
        <button
          className={`globe-toolbar-icon${activeSection === 'layers' ? ' active' : ''}`}
          onClick={() => toggle('layers')}
          title="Intel Layers"
        >
          <svg viewBox="0 0 16 16" width="16" height="16"><path d="M8 1L1 5l7 4 7-4zM1 8l7 4 7-4M1 11l7 4 7-4" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg>
        </button>
        {onToggleCinematic && (
          <button
            className={`globe-toolbar-icon${cinematicMode ? ' active cinematic-active' : ''}`}
            onClick={onToggleCinematic}
            title={cinematicMode ? 'Exit Cinematic Mode' : 'Cinematic Mode'}
          >
            <svg viewBox="0 0 16 16" width="16" height="16">
              <rect x="1" y="3" width="14" height="10" rx="1" fill="none" stroke="currentColor" strokeWidth="1.3"/>
              <polygon points="6,6 6,10 11,8" fill="currentColor"/>
            </svg>
          </button>
        )}
      </div>
      {activeSection && activeSection in sections && sections[activeSection as keyof typeof sections]()}
      {vectorToggles && onToggleVector && (
        <div style={{ position: 'relative' }}>
          <button
            className={`globe-toolbar-btn ${activeSection === 'vectors' ? 'active' : ''}`}
            onClick={() => toggle('vectors')}
            title="Physics Vectors"
            style={{ position: 'relative' }}
          >
            V&#x20d7;
            {(vectorToggles.velocity || vectorToggles.gravityEarth || vectorToggles.gravityMoon || vectorToggles.thrust) && (
              <span style={{
                position: 'absolute', top: 2, right: 2, width: 6, height: 6,
                borderRadius: '50%', background: '#4ade80',
              }} />
            )}
          </button>
          {activeSection === 'vectors' && (
            <div className="globe-dropdown" style={{ minWidth: 180 }}>
              <div style={{ padding: '8px 12px', fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                Vectors
              </div>
              {([
                { key: 'velocity' as const, label: 'Velocity', color: '#4ade80' },
                { key: 'gravityEarth' as const, label: 'Earth Gravity', color: '#f59e0b' },
                { key: 'gravityMoon' as const, label: 'Moon Gravity', color: '#a78bfa' },
                { key: 'thrust' as const, label: 'Thrust', color: '#ef4444' },
              ]).map(v => (
                <label
                  key={v.key}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '4px 12px', cursor: 'pointer', fontSize: '12px',
                    color: vectorToggles[v.key] ? v.color : '#94a3b8',
                  }}
                  onClick={() => onToggleVector(v.key)}
                >
                  <span style={{
                    width: 14, height: 14, borderRadius: 3,
                    border: `2px solid ${v.color}`,
                    background: vectorToggles[v.key] ? v.color : 'transparent',
                    display: 'inline-block',
                  }} />
                  {v.label}
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
