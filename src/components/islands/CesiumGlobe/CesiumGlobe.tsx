import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Viewer } from 'resium';
import {
  Camera,
  Cartesian3,
  JulianDate,
  Math as CesiumMath,
  Color,
  Ion,
  Rectangle,
  SceneMode,
  createWorldTerrainAsync,
  type Viewer as CesiumViewer,
} from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import type { CesiumComponentRef } from 'resium';
import type { MapPoint, MapLine, KpiItem, Meta } from '../../../lib/schemas';
import type { FlatEvent } from '../../../lib/timeline-utils';
import { MAP_CATEGORIES } from '../../../lib/map-utils';
import { configureCesium } from '../../../lib/cesium-config';
import { createCRTStage, createNVGStage, createThermalStage, createBloomStage, type VisualMode } from './cesium-shaders';
import { useCesiumCamera } from './useCesiumCamera';
import { useConflictData } from './useConflictData';
import { useMissiles } from './useMissiles';
import CesiumControls from './CesiumControls';
import CesiumInfoPanel from './CesiumInfoPanel';
import CesiumTimelineBar from './CesiumTimelineBar';
import CesiumEventsPanel from './CesiumEventsPanel';
import { useSatellites } from './useSatellites';
import { useFlights } from './useFlights';
import { useEarthquakes } from './useEarthquakes';
import { useWeather } from './useWeather';
import { useNoFlyZones } from './useNoFlyZones';

interface Props {
  points: MapPoint[];
  lines: MapLine[];
  kpis: KpiItem[];
  meta: Meta;
  events?: FlatEvent[];
}

// Configure Cesium Ion on module load
configureCesium();

const KPI_COLORS: Record<string, string> = {
  red: '#e74c3c',
  amber: '#f39c12',
  blue: '#3498db',
  green: '#2ecc71',
};

// Today's date for mode detection
const TODAY = new Date().toISOString().split('T')[0];

// ── Time helpers ──

function dateToMs(dateStr: string): number {
  return new Date(dateStr + 'T00:00:00Z').getTime();
}

function msToDateStr(ms: number): string {
  return new Date(ms).toISOString().split('T')[0];
}

export default function CesiumGlobe({ points, lines, kpis, meta, events = [] }: Props) {
  const viewerRef = useRef<CesiumComponentRef<CesiumViewer> | null>(null);
  const creditDivRef = useRef<HTMLDivElement | null>(null);
  if (!creditDivRef.current && typeof document !== 'undefined') {
    creditDivRef.current = document.createElement('div');
  }
  const [cesiumViewer, setCesiumViewer] = useState<CesiumViewer | null>(null);
  const { flyTo } = useCesiumCamera(viewerRef);

  // ── Filters ──
  const [activeFilters, setActiveFilters] = useState<Set<string>>(
    new Set(['strike', 'retaliation', 'asset', 'front']),
  );
  const [selectedPoint, setSelectedPoint] = useState<MapPoint | null>(null);

  // ── Visual mode ──
  const [visualMode, setVisualMode] = useState<VisualMode>('normal');

  // ── Live data layer toggles ──
  const [layers, setLayers] = useState({ satellites: true, flights: true, quakes: false, weather: false, nfz: true });

  // ── Events panel ──
  const [eventsOpen, setEventsOpen] = useState(true);

  // ── Persist lines toggle (day-only by default) ──
  const [persistLines, setPersistLines] = useState(false);

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
  const currentDateRef = useRef(currentDate);
  currentDateRef.current = currentDate;

  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(3600); // default: 1hr per real second

  // Continuous simulation time (ms since epoch)
  const simTimeRef = useRef<number>(dateToMs(dateRange.max) + 43200000); // noon of max date
  const rafIdRef = useRef<number>(0);
  const lastFrameRef = useRef<number>(0);
  const lastDateUpdateRef = useRef<number>(0); // throttle setCurrentDate at high speeds

  // Derive mode from currentDate
  const mode: 'historical' | 'live' = currentDate >= TODAY ? 'live' : 'historical';

  // ── RAF-based continuous playback ──
  useEffect(() => {
    if (!isPlaying) {
      lastFrameRef.current = 0;
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = 0;
      return;
    }

    const tick = (timestamp: number) => {
      if (lastFrameRef.current === 0) {
        lastFrameRef.current = timestamp;
        rafIdRef.current = requestAnimationFrame(tick);
        return;
      }

      const deltaMs = Math.min(timestamp - lastFrameRef.current, 100); // cap to avoid jumps
      lastFrameRef.current = timestamp;

      simTimeRef.current += deltaMs * playbackSpeed;
      const newDate = msToDateStr(simTimeRef.current);
      const maxMs = dateToMs(dateRange.max) + 86400000; // end of max date

      if (simTimeRef.current >= maxMs) {
        simTimeRef.current = maxMs;
        setIsPlaying(false);
        setCurrentDate(dateRange.max);
        return;
      }

      // Throttle state updates to max 5Hz to avoid entity churn at high speeds
      if (newDate !== currentDateRef.current) {
        const realNow = timestamp;
        if (realNow - lastDateUpdateRef.current >= 200) {
          lastDateUpdateRef.current = realNow;
          setCurrentDate(newDate);
        }
      }

      rafIdRef.current = requestAnimationFrame(tick);
    };

    rafIdRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = 0;
    };
  }, [isPlaying, playbackSpeed, dateRange.max]);

  const togglePlay = useCallback(() => {
    setIsPlaying(prev => {
      if (!prev) {
        // If at the end, restart from the beginning
        if (currentDateRef.current >= dateRange.max) {
          const startMs = dateToMs(dateRange.min);
          simTimeRef.current = startMs;
          setCurrentDate(dateRange.min);
        }
      }
      return !prev;
    });
  }, [dateRange]);

  const goLive = useCallback(() => {
    setIsPlaying(false);
    const targetDate = dateRange.max >= TODAY ? TODAY : dateRange.max;
    simTimeRef.current = dateToMs(targetDate) + 43200000;
    setCurrentDate(targetDate);
  }, [dateRange]);

  // When user manually changes date (scrub, step), sync simTimeRef
  const handleDateChange = useCallback((date: string) => {
    simTimeRef.current = dateToMs(date) + 43200000; // noon of that day
    setCurrentDate(date);
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

  const toggleLayer = (layer: 'satellites' | 'flights' | 'quakes' | 'weather' | 'nfz') => {
    setLayers(prev => ({ ...prev, [layer]: !prev[layer] }));
  };

  const filteredPoints = useMemo(
    () => points.filter(p => activeFilters.has(p.cat) && (p.base || p.date <= currentDate)),
    [points, activeFilters, currentDate],
  );

  // Past arcs — only shown when persist is on (managed by useConflictData)
  const pastLines = useMemo(
    () => persistLines
      ? lines.filter(l => activeFilters.has(l.cat) && l.date < currentDate)
      : [],
    [lines, activeFilters, currentDate, persistLines],
  );

  // Current date arcs — managed by useMissiles
  const currentLines = useMemo(
    () => lines.filter(l => activeFilters.has(l.cat) && l.date === currentDate),
    [lines, activeFilters, currentDate],
  );

  const pointCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of MAP_CATEGORIES) counts[c.id] = 0;
    for (const p of filteredPoints) counts[p.cat] = (counts[p.cat] || 0) + 1;
    return counts;
  }, [filteredPoints]);

  // ── Post-processing shader management ──
  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer) return;

    const stages = viewer.scene.postProcessStages;
    stages.removeAll();

    if (visualMode === 'normal') {
      stages.add(createBloomStage());
    } else if (visualMode === 'crt') {
      stages.add(createCRTStage());
    } else if (visualMode === 'nvg') {
      stages.add(createNVGStage());
    } else if (visualMode === 'thermal') {
      stages.add(createThermalStage());
    }
  }, [visualMode]);

  // Initial camera position + store viewer in state for hooks
  const handleViewerReady = useCallback((viewer: CesiumViewer) => {
    Camera.DEFAULT_VIEW_RECTANGLE = Rectangle.fromDegrees(25, 12, 65, 42);
    viewer.scene.backgroundColor = Color.fromCssColorString('#0a0b0e');
    viewer.scene.globe.baseColor = Color.fromCssColorString('#0d0f14');

    // Terrain (free with Cesium Ion token)
    if (Ion.defaultAccessToken) {
      createWorldTerrainAsync().then(terrain => {
        if (!viewer.isDestroyed()) {
          viewer.terrainProvider = terrain;
        }
      }).catch(() => {});
    }

    // Lighting — day/night terminator
    viewer.scene.globe.enableLighting = true;

    // Atmosphere glow
    if (viewer.scene.skyAtmosphere) {
      viewer.scene.skyAtmosphere.show = true;
      viewer.scene.skyAtmosphere.brightnessShift = -0.3;
      viewer.scene.skyAtmosphere.saturationShift = -0.2;
    }
    viewer.scene.globe.showGroundAtmosphere = true;

    // Subtle fog for depth
    viewer.scene.fog.enabled = true;
    viewer.scene.fog.density = 0.0002;

    // Fly to theater
    viewer.camera.setView({
      destination: Cartesian3.fromDegrees(49, 29, 3_000_000),
      orientation: {
        heading: CesiumMath.toRadians(0),
        pitch: CesiumMath.toRadians(-90),
        roll: 0,
      },
    });

    setCesiumViewer(viewer);
  }, []);

  // ── Conflict data (imperative entities) — points + past arcs ──
  useConflictData(cesiumViewer, filteredPoints, pastLines, setSelectedPoint);

  // ── Current-date arcs + animated missiles ──
  useMissiles(cesiumViewer, currentLines, currentDate, isPlaying, simTimeRef, playbackSpeed);

  // ── External data layers (synced to timeline) ──
  const { count: satCount, groupCounts: satGroupCounts } = useSatellites(cesiumViewer, layers.satellites, simTimeRef);
  const { count: flightCount } = useFlights(cesiumViewer, layers.flights && mode === 'live');
  const { count: quakeCount } = useEarthquakes(cesiumViewer, layers.quakes, currentDate);
  const { count: weatherCount } = useWeather(cesiumViewer, layers.weather, currentDate);
  const { count: nfzCount } = useNoFlyZones(cesiumViewer, layers.nfz, currentDate);

  // ── Sync Cesium clock for day/night terminator ──
  useEffect(() => {
    if (!cesiumViewer || cesiumViewer.isDestroyed()) return;
    const julianDate = JulianDate.fromDate(new Date(simTimeRef.current));
    cesiumViewer.clock.currentTime = julianDate;
  }, [cesiumViewer, currentDate]);

  const totalLines = pastLines.length + currentLines.length;

  return (
    <div className="globe-wrapper">
      {/* Operation header */}
      <div className="globe-header">
        <div className="globe-header-dateline">{meta.dateline}</div>
        <div className="globe-header-op">{meta.operationName}</div>
      </div>

      {/* KPI strip */}
      <div className="globe-kpi-strip">
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

      <Viewer
        ref={(e: any) => {
          viewerRef.current = e;
          const v = e?.cesiumElement;
          if (v && v !== cesiumViewer) handleViewerReady(v);
        }}
        full
        sceneMode={SceneMode.SCENE3D}
        animation={false}
        baseLayerPicker={false}
        fullscreenButton={false}
        geocoder={false}
        homeButton={false}
        infoBox={false}
        navigationHelpButton={false}
        sceneModePicker={false}
        selectionIndicator={false}
        timeline={false}
        vrButton={false}
        creditContainer={creditDivRef.current!}
      />

      {/* Overlay controls */}
      <CesiumControls
        activeFilters={activeFilters}
        onToggleFilter={toggleFilter}
        pointCounts={pointCounts}
        onCameraPreset={flyTo}
        visualMode={visualMode}
        onVisualMode={setVisualMode}
        layers={layers}
        onToggleLayer={toggleLayer}
        persistLines={persistLines}
        onTogglePersist={() => setPersistLines(prev => !prev)}
        satGroupCounts={satGroupCounts}
      />

      {/* Info panel */}
      {selectedPoint && (
        <CesiumInfoPanel point={selectedPoint} onClose={() => setSelectedPoint(null)} />
      )}

      {/* Events / Intel feed panel */}
      <CesiumEventsPanel
        events={events}
        currentDate={currentDate}
        isOpen={eventsOpen}
        onToggle={() => setEventsOpen(prev => !prev)}
      />

      {/* Enhanced Timeline */}
      <CesiumTimelineBar
        minDate={dateRange.min}
        maxDate={dateRange.max}
        currentDate={currentDate}
        isPlaying={isPlaying}
        playbackSpeed={playbackSpeed}
        mode={mode}
        events={events}
        lines={lines}
        onDateChange={handleDateChange}
        onTogglePlay={togglePlay}
        onSpeedChange={setPlaybackSpeed}
        onGoLive={goLive}
      />

      {/* Stats overlay */}
      <div className="globe-stats">
        <span>{filteredPoints.length} locations</span>
        <span className="globe-stats-sep">&middot;</span>
        <span>{totalLines} vectors</span>
        {layers.satellites && satCount > 0 && (
          <>
            <span className="globe-stats-sep">&middot;</span>
            <span style={{ color: '#00ff88' }}>{satCount} sats</span>
          </>
        )}
        {mode === 'live' && layers.flights && flightCount > 0 && (
          <>
            <span className="globe-stats-sep">&middot;</span>
            <span style={{ color: '#00aaff' }}>{flightCount} flights</span>
          </>
        )}
        {layers.quakes && quakeCount > 0 && (
          <>
            <span className="globe-stats-sep">&middot;</span>
            <span style={{ color: '#ff6644' }}>{quakeCount} quakes</span>
          </>
        )}
        {layers.weather && weatherCount > 0 && (
          <>
            <span className="globe-stats-sep">&middot;</span>
            <span style={{ color: '#88ccff' }}>{weatherCount} wx</span>
          </>
        )}
        {layers.nfz && nfzCount > 0 && (
          <>
            <span className="globe-stats-sep">&middot;</span>
            <span style={{ color: '#e74c3c' }}>{nfzCount} NFZ</span>
          </>
        )}
        {mode === 'historical' && (
          <>
            <span className="globe-stats-sep">&middot;</span>
            <span style={{ color: '#9498a8' }}>HISTORICAL</span>
          </>
        )}
      </div>
    </div>
  );
}
