import { useState, useEffect, useMemo, useCallback } from 'react';
import type { MapPoint, MapLine } from '../../lib/schemas';
import { MAP_CATEGORIES } from '../../lib/map-utils';
import { tierLabelFull, tierClass } from './map-helpers';
import LeafletMap from './LeafletMap';
import TimelineSlider from './TimelineSlider';

interface Props {
  points: MapPoint[];
  lines: MapLine[];
}

export default function IntelMap({ points, lines }: Props) {
  // ── Filters ──
  const [activeFilters, setActiveFilters] = useState<Set<string>>(
    new Set(['strike', 'retaliation', 'asset', 'front']),
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

  // Play/pause auto-advance
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
    }, 200);
    return () => clearInterval(interval);
  }, [isPlaying, dateRange.max]);

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
      lines.filter(
        l => activeFilters.has(l.cat) && l.date <= currentDate,
      ),
    [lines, activeFilters, currentDate],
  );

  // Count points per category (for filter badges)
  const pointCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of MAP_CATEGORIES) counts[c.id] = 0;
    for (const p of filteredPoints) counts[p.cat] = (counts[p.cat] || 0) + 1;
    return counts;
  }, [filteredPoints]);

  const selectedCategory = selectedPoint
    ? MAP_CATEGORIES.find(c => c.id === selectedPoint.cat)
    : null;

  return (
    <section className="section" id="sec-map">
      <div className="section-header">
        <span className="section-num">02</span>
        <h2 className="section-title">Theater of Operations</h2>
        <span className="section-count">{filteredPoints.length} locations &middot; {filteredLines.length} vectors</span>
      </div>

      <div className="map-container">
        {/* Map fills the container */}
        <LeafletMap
          points={filteredPoints}
          lines={filteredLines}
          onSelectPoint={setSelectedPoint}
        />

        {/* Overlay: filter controls (top-left) */}
        <div className="map-controls-overlay">
          {MAP_CATEGORIES.map(c => (
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

        {/* Overlay: legend (bottom-left) */}
        <div className="map-legend-overlay">
          {MAP_CATEGORIES.map(c => (
            <span key={c.id} className="map-legend-item">
              <span className="map-legend-dot" style={{ background: c.color }} />
              {c.label}
            </span>
          ))}
        </div>

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

        {/* Timeline slider (bottom bar, outside map) */}
        <TimelineSlider
          minDate={dateRange.min}
          maxDate={dateRange.max}
          currentDate={currentDate}
          isPlaying={isPlaying}
          onDateChange={setCurrentDate}
          onTogglePlay={togglePlay}
        />
      </div>
    </section>
  );
}
