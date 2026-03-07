import { MAP_CATEGORIES } from '../../../lib/map-utils';
import { type CameraPresetKey } from '../../../lib/cesium-config';
import type { VisualMode } from './cesium-shaders';

interface Props {
  activeFilters: Set<string>;
  onToggleFilter: (cat: string) => void;
  pointCounts: Record<string, number>;
  onCameraPreset: (key: CameraPresetKey) => void;
  visualMode: VisualMode;
  onVisualMode: (mode: VisualMode) => void;
  layers: { satellites: boolean; flights: boolean; quakes: boolean; weather: boolean; nfz: boolean };
  onToggleLayer: (layer: 'satellites' | 'flights' | 'quakes' | 'weather' | 'nfz') => void;
  persistLines: boolean;
  onTogglePersist: () => void;
}

const PRESET_LABELS: Record<CameraPresetKey, string> = {
  theater: 'Full Theater',
  tehran: 'Tehran',
  natanz: 'Natanz',
  hormuz: 'Strait of Hormuz',
  ford_csg: 'USS Ford CSG',
  lincoln: 'USS Lincoln CSG',
  red_sea: 'Red Sea',
};

const VISUAL_MODES: { id: VisualMode; label: string }[] = [
  { id: 'normal', label: 'Standard' },
  { id: 'crt', label: 'CRT' },
  { id: 'nvg', label: 'Night Vision' },
  { id: 'thermal', label: 'Thermal' },
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
}: Props) {
  return (
    <div className="globe-controls">
      {/* Category filters */}
      <div className="globe-control-group">
        <div className="globe-control-label">Filters</div>
        {MAP_CATEGORIES.map(c => (
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

      {/* Camera presets */}
      <div className="globe-control-group">
        <div className="globe-control-label">Camera</div>
        <div className="globe-preset-grid">
          {(Object.keys(PRESET_LABELS) as CameraPresetKey[]).map(key => (
            <button key={key} className="globe-preset-btn" onClick={() => onCameraPreset(key)}>
              {PRESET_LABELS[key]}
            </button>
          ))}
        </div>
      </div>

      {/* Visual modes */}
      <div className="globe-control-group">
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

      {/* Real-time data layers */}
      <div className="globe-control-group">
        <div className="globe-control-label">Intel Layers</div>
        <button
          className={`globe-filter${layers.satellites ? ' active' : ''}`}
          onClick={() => onToggleLayer('satellites')}
        >
          <span className="globe-fdot" style={{ background: '#00ffcc' }} />
          Satellites
        </button>
        {layers.satellites && (
          <div className="globe-sublabel">
            <span style={{ color: '#00ffcc' }}>&#9679; GPS</span>{' '}
            <span style={{ color: '#ffcc00' }}>&#9679; Military</span>{' '}
            <span style={{ color: '#ff8844' }}>&#9679; Recon</span>
          </div>
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
          No-Fly Zones
        </button>
      </div>
    </div>
  );
}
