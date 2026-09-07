import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { trackEvent } from '../../lib/analytics';
import type { MapPoint, MapLine } from '../../lib/schemas';
import type { FlatEvent } from '../../lib/timeline-utils';
import { MAP_CATEGORIES, type MapCategory } from '../../lib/map-utils';
import { tierLabelFull, tierClass } from './map-helpers';
import LeafletMap from './LeafletMap';
import type { ViewBounds } from './LeafletMap';
import UnifiedTimelineBar from './UnifiedTimelineBar';
import MapEventsPanel from './MapEventsPanel';
import MapLayerToggles from './MapLayerToggles';
import { useMapOverlays } from './useMapOverlays';
import type { LayerState } from './useMapOverlays';
import { readViewState, createViewStateWriter, type ViewState } from '../../lib/view-state';
import { layersForTracker } from '../../lib/live-layers';
import DossierPanel from './shared/DossierPanel';
import { useDossier } from './shared/useDossier';
import GeoLayersLeaflet from './GeoLayersLeaflet';
import { useFrontlineData, useGdacsData, useStaticGeoLayerData, DEEPSTATE_ENABLED } from './useGeoLayersData';
import { staticLayerMeta } from '../../lib/geo-layer-schema';

/** Layer keys accepted in the `layers` URL parameter (ADR-0001). */
export const MAP_LAYER_KEYS = [
  'noFlyZones', 'gpsJamming', 'internetBlackout', 'earthquakes', 'weather', 'flights', 'terminator', 'factCards',
] as const satisfies readonly (keyof LayerState)[];
import { useMapFlights } from './useMapFlights';
import { useTerminator } from './useTerminator';
import IslandErrorBoundary from './shared/IslandErrorBoundary';
import { IslandErrorFallback } from './shared/IslandErrorFallback';

interface Props {
  points: MapPoint[];
  lines: MapLine[];
  events: FlatEvent[];
  categories?: MapCategory[];
  mapCenter?: { lon: number; lat: number };
  mapBounds?: { lonMin: number; lonMax: number; latMin: number; latMax: number };
  /** Optional named weather sample points from tracker.json (globe.weatherPoints). */
  weatherPoints?: { lat: number; lon: number; label: string }[];
  /** Used to scope snapshot layers (live-layers.ts). */
  trackerSlug?: string;
  liveLayers?: string[];
  staticLayers?: string[];
}

export default function IntelMap(props: Props) {
  return (
    <IslandErrorBoundary
      fallback={<IslandErrorFallback feature="the intelligence map" />}
    >
      <IntelMapInner {...props} />
    </IslandErrorBoundary>
  );
}

function IntelMapInner({ points, lines, events, categories, mapCenter, mapBounds, weatherPoints, trackerSlug, liveLayers = [], staticLayers = [] }: Props) {
  // Use prop categories with fallback to hardcoded defaults. Passed down to
  // LeafletMap so catColor() resolves dot colors without a module singleton.
  const mapCategories = categories && categories.length > 0 ? categories : MAP_CATEGORIES;
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

  // Shareable view state: client:only island, so reading window is safe.
  const urlView = useMemo(() => readViewState([...MAP_LAYER_KEYS, 'deepstate-frontline', 'gdacs-alerts', ...staticLayers]), [staticLayers]);
  const viewWriter = useMemo(() => createViewStateWriter(500), []);
  const [currentDate, setCurrentDate] = useState(
    urlView.date && urlView.date >= dateRange.min && urlView.date <= dateRange.max ? urlView.date : dateRange.max,
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(200);
  const [eventsOpen, setEventsOpen] = useState(false);
  const [persistLines, setPersistLines] = useState(false);

  // ── Overlay layers ──
  const [layers, setLayers] = useState<LayerState>(() => {
    const defaults: LayerState = {
      noFlyZones: false, gpsJamming: false, internetBlackout: false, earthquakes: false,
      weather: false, flights: false, terminator: false, factCards: false,
    };
    if (!urlView.layers) return defaults;
    const chosen = { ...defaults };
    for (const k of MAP_LAYER_KEYS) chosen[k] = urlView.layers.includes(k);
    return chosen;
  });

  // Camera (centre + zoom) reported by LeafletMap on every moveend.
  const cameraRef = useRef<Pick<ViewState, 'lat' | 'lon' | 'zoom'>>(
    urlView.lat !== undefined && urlView.lon !== undefined
      ? { lat: urlView.lat, lon: urlView.lon, zoom: urlView.zoom }
      : {},
  );
  // E5 layers live in their own state (declared here so the view-state
  // builder can include them; the hooks that consume it come further down).
  const wantFrontline = liveLayers.includes('deepstate-frontline') && DEEPSTATE_ENABLED;
  const [extraLayers, setExtraLayers] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = { 'gdacs-alerts': false };
    if (wantFrontline) init['deepstate-frontline'] = true;
    for (const id of staticLayers) init[id] = false;
    if (urlView.layers) for (const k of Object.keys(init)) init[k] = urlView.layers.includes(k);
    return init;
  });
  // Refs keep handleViewChange's identity stable so LeafletMap's moveend
  // listener is registered once, not on every layer/date change.
  const layersRef = useRef(layers);
  layersRef.current = layers;
  const extraLayersRef = useRef(extraLayers);
  extraLayersRef.current = extraLayers;
  const dateRef = useRef(currentDate);
  dateRef.current = currentDate;
  const buildViewState = useCallback((): ViewState => ({
    ...cameraRef.current,
    // Built-in layers first, then every E5 layer that is on, so a shared
    // link reproduces the frontline / GDACS / static layers too.
    layers: [...MAP_LAYER_KEYS.filter(k => layersRef.current[k]), ...Object.keys(extraLayersRef.current).filter(id => extraLayersRef.current[id])],
    date: dateRef.current,
  }), []);
  useEffect(() => { viewWriter.write(buildViewState()); }, [layers, extraLayers, currentDate, buildViewState, viewWriter]);
  useEffect(() => () => viewWriter.cancel(), [viewWriter]);
  // Live viewport for the flights bbox (E2.H2: "bbox de map.getBounds()").
  // Kept in state, not a ref, because the bbox is a hook input.
  const [viewBounds, setViewBounds] = useState<ViewBounds | null>(null);
  const handleViewChange = useCallback((lat: number, lon: number, zoom: number, bounds?: ViewBounds) => {
    cameraRef.current = { lat, lon, zoom };
    if (bounds) setViewBounds(prev => (prev && prev.latMin === bounds.latMin && prev.latMax === bounds.latMax && prev.lonMin === bounds.lonMin && prev.lonMax === bounds.lonMax) ? prev : bounds);
    viewWriter.write(buildViewState());
  }, [buildViewState, viewWriter]);
  const buildShareUrl = useCallback(() => viewWriter.flush(buildViewState()), [buildViewState, viewWriter]);

  const toggleLayer = useCallback((layer: keyof LayerState) => {
    setLayers(prev => ({ ...prev, [layer]: !prev[layer] }));
  }, []);

  // ── E5 layers ──
  const toggleExtraLayer = useCallback((id: string) => setExtraLayers(prev => ({ ...prev, [id]: !prev[id] })), []);
  const frontline = useFrontlineData(wantFrontline && !!extraLayers['deepstate-frontline']);
  const gdacs = useGdacsData(!!extraLayers['gdacs-alerts']);
  const s0 = useStaticGeoLayerData(staticLayers[0] ?? null, !!extraLayers[staticLayers[0] ?? '']);
  const s1 = useStaticGeoLayerData(staticLayers[1] ?? null, !!extraLayers[staticLayers[1] ?? '']);
  const s2 = useStaticGeoLayerData(staticLayers[2] ?? null, !!extraLayers[staticLayers[2] ?? '']);
  const staticData = useMemo(() => [s0, s1, s2].map((r, i) => ({ id: staticLayers[i], r })).filter(x => x.id && extraLayers[x.id] && x.r.data).map(x => ({ id: x.id!, layer: x.r.data! })), [s0, s1, s2, staticLayers, extraLayers]);
  const extraLayerDefs = useMemo(() => {
    const defs: { id: string; label: string; count: number; on: boolean; status: string; updatedAt: number | null; error?: string; snapshotDate?: string }[] = [];
    if (wantFrontline) defs.push({ id: 'deepstate-frontline', label: 'Frontline (DeepStateMAP)', count: frontline.data?.polygons.length ?? 0, on: !!extraLayers['deepstate-frontline'], status: frontline.status, updatedAt: frontline.updatedAt, error: frontline.error });
    defs.push({ id: 'gdacs-alerts', label: 'Disasters (GDACS)', count: gdacs.data?.alerts.length ?? 0, on: !!extraLayers['gdacs-alerts'], status: gdacs.status, updatedAt: gdacs.updatedAt, error: gdacs.error });
    [s0, s1, s2].forEach((r, i) => { const id = staticLayers[i]; const meta = id ? staticLayerMeta(id) : undefined; if (id && meta) defs.push({ id, label: meta.label, count: r.data?.features.length ?? 0, on: !!extraLayers[id], status: r.status, updatedAt: r.updatedAt, error: r.error, snapshotDate: r.data?._provenance.retrievedAt.slice(0, 10) }); });
    return defs;
  }, [wantFrontline, frontline, gdacs, s0, s1, s2, staticLayers, extraLayers]);

  const dossier = useDossier();
  const handleGroundClick = useCallback((lat: number, lon: number) => dossier.open({ lat, lon }), [dossier.open]);
  const scopedLayerIds = useMemo(() => layersForTracker(trackerSlug ?? '').map(l => l.id), [trackerSlug]);
  const overlayGeo = useMemo(() => ({ bounds: mapBounds ?? null, center: mapCenter ?? null, weatherPoints: weatherPoints ?? null }), [mapBounds, mapCenter, weatherPoints]);
  const { overlays, counts, statuses: overlayStatuses } = useMapOverlays(layers, currentDate, overlayGeo);

  // ── Live flights ──
  const isLatestDate = currentDate === dateRange.max;
  const { flights, flightCount, status: flightStatus, updatedAt: flightUpdatedAt, error: flightError } = useMapFlights(layers.flights, isLatestDate, viewBounds ?? mapBounds ?? null, mapCenter ?? null);

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
    trackEvent('map_filter_toggled', { category: cat });
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
          initialView={urlView.lat !== undefined && urlView.lon !== undefined ? { lat: urlView.lat, lon: urlView.lon, zoom: urlView.zoom ?? 5 } : undefined}
          onViewChange={handleViewChange}
          onGroundClick={handleGroundClick}
          geoLayers={<GeoLayersLeaflet frontline={extraLayers['deepstate-frontline'] ? frontline.data : null} gdacs={extraLayers['gdacs-alerts'] ? gdacs.data : null} statics={staticData} />}
          points={filteredPoints}
          lines={filteredLines}
          categories={mapCategories}
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
          onShareView={buildShareUrl}
          statuses={{ ...overlayStatuses, flights: layers.flights ? { status: flightStatus, updatedAt: flightUpdatedAt, error: flightError } : undefined }}
          scopedLayerIds={scopedLayerIds}
          extraLayers={extraLayerDefs}
          onToggleExtraLayer={toggleExtraLayer}
        />

        {dossier.target && (
          <DossierPanel
            loading={dossier.loading}
            error={dossier.error}
            dossier={dossier.dossier}
            onClose={dossier.close}
            basePath={(import.meta as any).env?.BASE_URL ?? '/'}
            className="map-dossier"
          />
        )}

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
