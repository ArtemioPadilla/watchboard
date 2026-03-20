import { useState, useEffect, useMemo, useCallback } from 'react';
import type { MapPoint, MapLine } from '../../lib/schemas';
import type { FlatEvent } from '../../lib/timeline-utils';
import { MAP_CATEGORIES, type MapCategory } from '../../lib/map-utils';
import { tierLabelFull, tierClass, setTrackerCategories } from './map-helpers';
import LeafletMap from './LeafletMap';
import UnifiedTimelineBar from './UnifiedTimelineBar';
import MapEventsPanel from './MapEventsPanel';
import MapLayerToggles from './MapLayerToggles';
import { useMapOverlays } from './useMapOverlays';
import type { LayerState } from './useMapOverlays';
import { useMapFlights } from './useMapFlights';
import { useTerminator } from './useTerminator';

interface Props {
  points: MapPoint[];
  lines: MapLine[];
  events: FlatEvent[];
  categories?: MapCategory[];
  mapCenter?: { lon: number; lat: number };
  mapBounds?: { lonMin: number; lonMax: number; latMin: number; latMax: number };
}

export default function IntelMap({ points, lines, events, categories, mapCenter, mapBounds }: Props) {
  // Use prop categories with fallback to hardcoded defaults
  const mapCategories = categories && categories.length > 0 ? categories : MAP_CATEGORIES;
  // Set tracker categories so catColor() uses them for dot colors
  setTrackerCategories(mapCategories);
  // ── Filters ──
  const [activeFilters, setActiveFilters] = useState<Set<string>>(
    new Set(mapCategories.map(c => c.id)),
  );
  const [selectedPoint, setSelectedPoint] = useState<MapPoint | null>(null);

  // ── Timeline ──
  const dateRange = useMemo(() => {
    const allDates = [
      ...points.map(p => p.date),
      ...lines.map(l => l.date),
    ].sort();
    return {
      min: allDates[0] || '2025-12-01',
      max: allDates[allDates.length - 1] || '2026-03-04',
    };
  }, [points, lines]);

  const [currentDate, setCurrentDate] = useState(dateRange.max);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(200);
  const [eventsOpen, setEventsOpen] = useState(false);
  const [persistLines, setPersistLines] = useState(false);

  // ── Overlay layers ──
  const [layers, setLayers] = useState<LayerState>({
    noFlyZones: false,
    gpsJamming: false,
    internetBlackout: false,
    earthquakes: false,
    weather: false,
    flights: false,
    terminator: false,
    factCards: false,
  });

  const toggleLayer = useCallback((layer: keyof LayerState) => {
    setLayers(prev => ({ ...prev, [layer]: !prev[layer] }));
  }, []);

  const { overlays, counts } = useMapOverlays(layers, currentDate);

  // ── Live flights ──
  const isLatestDate = currentDate === dateRange.max;
  const { flights, flightCount } = useMapFlights(layers.flights, isLatestDate);

  // ── Day/night terminator ──
  const terminatorPolygon = useTerminator(layers.terminator, currentDate);

  // ── Merged counts (overlay counts + external counts) ──
  const mergedCounts = useMemo(() => ({
    ...counts,
    flights: flightCount,
    terminator: terminatorPolygon ? 1 : 0,
  }), [counts, flightCount, terminatorPolygon]);

  // Play/pause auto-advance using playbackSpeed
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setCurrentDate(prev => {
        const d = new Date(prev);
        d.setDate(d.getDate() + 1);
        const next = d.toISOString().split('T')[0];
        if (next > dateRange.max) {
          setIsPlaying(false);
          return dateRange.max;
        }
        return next;
      });
    }, playbackSpeed);
    return () => clearInterval(interval);
  }, [isPlaying, dateRange.max, playbackSpeed]);

  const togglePlay = useCallback(() => {
    setIsPlaying(prev => {
      if (!prev) {
        setCurrentDate(cur =>
          cur >= dateRange.max ? dateRange.min : cur,
        );
      }
      return !prev;
    });
  }, [dateRange]);

  const handleSpeedChange = useCallback((speed: number) => {
    setPlaybackSpeed(speed);
  }, []);

  const toggleEventsPanel = useCallback(() => {
    setEventsOpen(prev => !prev);
  }, []);

  const togglePersist = useCallback(() => {
    setPersistLines(prev => !prev);
  }, []);

  // ── Filtering ──
  const toggleFilter = (cat: string) => {
    setActiveFilters(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const filteredPoints = useMemo(
    () =>
      points.filter(
        p => activeFilters.has(p.cat) && (p.base || p.date <= currentDate),
      ),
    [points, activeFilters, currentDate],
  );

  const filteredLines = useMemo(
    () =>
      lines.filter(l => {
        if (!activeFilters.has(l.cat)) return false;
        if (persistLines) {
          return l.date <= currentDate;
        }
        return l.date === currentDate;
      }),
    [lines, activeFilters, currentDate, persistLines],
  );

  // Count points per category (for filter badges)
  const pointCounts = useMemo(() => {
    const cnts: Record<string, number> = {};
    for (const c of mapCategories) cnts[c.id] = 0;
    for (const p of filteredPoints) cnts[p.cat] = (cnts[p.cat] || 0) + 1;
    return cnts;
  }, [filteredPoints, mapCategories]);

  const selectedCategory = selectedPoint
    ? mapCategories.find(c => c.id === selectedPoint.cat)
    : null;

  return (
    <section className="section" id="sec-map">
      <div className="section-header">
        <span className="section-num">02</span>
        <h2 className="section-title">Theater of Operations</h2>
        <span className="section-count">{filteredPoints.length} locations &middot; {filteredLines.length} vectors</span>
      </div>

      <div className="map-container">
        <LeafletMap
          points={filteredPoints}
          lines={filteredLines}
          onSelectPoint={setSelectedPoint}
          overlays={overlays}
          flights={layers.flights ? flights : undefined}
          terminatorPolygon={layers.terminator ? terminatorPolygon : undefined}
          currentDate={currentDate}
          isPlaying={isPlaying}
          events={events}
          showFactCards={layers.factCards}
          mapCenter={mapCenter}
          mapBounds={mapBounds}
        />

        {/* Overlay: filter controls (top-left) */}
        <div className="map-controls-overlay">
          {mapCategories.map(c => (
            <button
              key={c.id}
              className={`map-filter${activeFilters.has(c.id) ? ' active' : ''}`}
              data-cat={c.id}
              onClick={() => toggleFilter(c.id)}
              aria-pressed={activeFilters.has(c.id)}
            >
              <span className="fdot" style={{ background: c.color }} />
              {c.label}
              {activeFilters.has(c.id) && pointCounts[c.id] > 0 && (
                <span className="filter-count">{pointCounts[c.id]}</span>
              )}
            </button>
          ))}
        </div>

        {/* Overlay: layer toggles (below filter controls) */}
        <MapLayerToggles
          layers={layers}
          onToggle={toggleLayer}
          counts={mergedCounts}
        />

        {/* Overlay: info panel (right side) */}
        {selectedPoint && selectedCategory && (
          <div className="map-info-panel visible">
            <button
              className="map-info-close"
              onClick={() => setSelectedPoint(null)}
              aria-label="Close info panel"
            >
              &times;
            </button>
            <div className="map-info-type" style={{ color: selectedCategory.color }}>
              {selectedCategory.label}
            </div>
            <div className="map-info-title">{selectedPoint.label}</div>
            <div className="map-info-body">{selectedPoint.sub}</div>
            <div className="map-info-meta">
              <span
                className={`source-chip ${tierClass(selectedPoint.tier)}`}
                style={{ fontSize: '0.6rem' }}
              >
                {tierLabelFull(selectedPoint.tier)}
              </span>
              <span className="map-info-date">{selectedPoint.date}</span>
              <span className="map-info-coords">
                {selectedPoint.lat.toFixed(2)}°N, {selectedPoint.lon.toFixed(2)}°E
              </span>
            </div>
          </div>
        )}

        {/* Events panel (right side, below info panel) */}
        <MapEventsPanel
          events={events}
          currentDate={currentDate}
          isOpen={eventsOpen}
          onToggle={toggleEventsPanel}
        />

        {/* Enhanced timeline bar (bottom bar) */}
        <UnifiedTimelineBar
          context="2d"
          minDate={dateRange.min}
          maxDate={dateRange.max}
          currentDate={currentDate}
          isPlaying={isPlaying}
          playbackSpeed={playbackSpeed}
          events={events}
          lines={lines}
          persistLines={persistLines}
          onDateChange={setCurrentDate}
          onTogglePlay={togglePlay}
          onSpeedChange={handleSpeedChange}
          onTogglePersist={togglePersist}
          onGoLive={() => setCurrentDate(dateRange.max)}
          stats={{ locations: filteredPoints.length, vectors: filteredLines.length }}
        />
      </div>
    </section>
  );
}
