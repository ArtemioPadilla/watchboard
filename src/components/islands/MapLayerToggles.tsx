import { useState, useCallback } from 'react';
import type { LayerState } from './useMapOverlays';

// ────────────────────────────────────────────
//  Layer metadata
// ────────────────────────────────────────────

interface LayerDef {
  key: keyof LayerState;
  label: string;
  shortLabel: string;
  color: string;
  icon: string;
}

const LAYER_DEFS: LayerDef[] = [
  { key: 'noFlyZones', label: 'No-Fly Zones', shortLabel: 'NFZ', color: '#e74c3c', icon: '\u2718' },
  { key: 'gpsJamming', label: 'GPS Jamming', shortLabel: 'GPS', color: '#ff4444', icon: '\u25C9' },
  { key: 'internetBlackout', label: 'Internet Blackout', shortLabel: 'NET', color: '#ff6644', icon: '\u25A0' },
  { key: 'earthquakes', label: 'Earthquakes', shortLabel: 'EQ', color: '#ff9900', icon: '\u25B2' },
  { key: 'weather', label: 'Weather', shortLabel: 'WX', color: '#88ccff', icon: '\u2601' },
  { key: 'flights', label: 'Live Flights', shortLabel: 'FLT', color: '#00aaff', icon: '\u2708' },
  { key: 'terminator', label: 'Day/Night', shortLabel: 'D/N', color: '#4488aa', icon: '\u25D1' },
];

// ────────────────────────────────────────────
//  Props
// ────────────────────────────────────────────

interface Props {
  layers: LayerState;
  onToggle: (layer: keyof LayerState) => void;
  counts: Record<keyof LayerState, number>;
}

// ────────────────────────────────────────────
//  Component
// ────────────────────────────────────────────

export default function MapLayerToggles({ layers, onToggle, counts }: Props) {
  const [expanded, setExpanded] = useState(false);

  const toggleExpanded = useCallback(() => {
    setExpanded(prev => !prev);
  }, []);

  const activeCount = Object.values(layers).filter(Boolean).length;

  if (!expanded) {
    return (
      <button
        className="map-layers-toggle"
        onClick={toggleExpanded}
        aria-label="Toggle overlay layers panel"
        title="Overlay layers"
      >
        <span className="map-layers-toggle-icon">{'\u25A3'}</span>
        <span className="map-layers-toggle-text">LAYERS</span>
        {activeCount > 0 && (
          <span className="map-layers-toggle-badge">{activeCount}</span>
        )}
      </button>
    );
  }

  return (
    <div className="map-layers-panel">
      <div className="map-layers-header">
        <span className="map-layers-title">OVERLAY LAYERS</span>
        <button
          className="map-layers-close"
          onClick={toggleExpanded}
          aria-label="Close layers panel"
        >
          {'\u00D7'}
        </button>
      </div>
      <div className="map-layers-list">
        {LAYER_DEFS.map(def => {
          const active = layers[def.key];
          const count = counts[def.key];
          return (
            <button
              key={def.key}
              className={`map-layer-item${active ? ' active' : ''}`}
              onClick={() => onToggle(def.key)}
              aria-pressed={active}
            >
              <span
                className="map-layer-dot"
                style={{
                  background: active ? def.color : 'transparent',
                  borderColor: def.color,
                }}
              />
              <span className="map-layer-icon" style={{ color: active ? def.color : 'var(--text-muted)' }}>
                {def.icon}
              </span>
              <span className="map-layer-label">{def.label}</span>
              <span className="map-layer-short">{def.shortLabel}</span>
              {active && count > 0 && (
                <span className="map-layer-count" style={{ background: def.color }}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
