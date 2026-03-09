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
import { createCRTStage, createNVGStage, createThermalStage, createBloomStage, createSharpenStage, createPanopticStage, type VisualMode } from './cesium-shaders';
import { useCesiumCamera } from './useCesiumCamera';
import type { OrbitMode } from './useCesiumCamera';
import { useConflictData } from './useConflictData';
import { useMissiles } from './useMissiles';
import CesiumControls from './CesiumControls';
import CesiumInfoPanel from './CesiumInfoPanel';
import CesiumTimelineBar from './CesiumTimelineBar';
import CesiumEventsPanel from './CesiumEventsPanel';
import CesiumHud from './CesiumHud';
import MobileBottomSheet from './MobileBottomSheet';
import { useSatellites } from './useSatellites';
import { useFlights } from './useFlights';
import { useEarthquakes } from './useEarthquakes';
import { useWeather } from './useWeather';
import { useNoFlyZones } from './useNoFlyZones';
import { useShips, getStoredAisKey, setStoredAisKey } from './useShips';
import { useGpsJamming } from './useGpsJamming';
import { useInternetBlackout } from './useInternetBlackout';
import { useGroundTruth } from './useGroundTruth';

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
  const { flyTo, startOrbit, stopOrbit, orbitModeRef } = useCesiumCamera(viewerRef);

  // ── Mobile detection ──
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 768px)').matches : false,
  );
  useEffect(() => {
    const mql = window.matchMedia('(max-width: 768px)');
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  // ── Filters ──
  const [activeFilters, setActiveFilters] = useState<Set<string>>(
    new Set(['strike', 'retaliation', 'asset', 'front']),
  );
  const [selectedPoint, setSelectedPoint] = useState<MapPoint | null>(null);

  // ── Visual mode ──
  const [visualMode, setVisualMode] = useState<VisualMode>('normal');

  // ── Live data layer toggles ──
  const [layers, setLayers] = useState({
    satellites: true, flights: true, quakes: false, weather: false, nfz: true, ships: true,
    gpsJam: true, internetBlackout: true, groundTruth: true,
  });

  // ── Events panel (default collapsed) ──
  const [eventsOpen, setEventsOpen] = useState(false);

  // ── KPI strip compact ──
  const [showAllKpis, setShowAllKpis] = useState(false);

  // ── Persist lines toggle (day-only by default) ──
  const [persistLines, setPersistLines] = useState(false);

  // ── Satellite FOV footprints ──
  const [showFov, setShowFov] = useState(false);

  // ── HUD visibility ──
  const [showHud, setShowHud] = useState(true);

  // ── Orbit mode ──
  const [orbitMode, setOrbitMode] = useState<OrbitMode>('off');

  // ── AIS API key (user-provided, stored in localStorage) ──
  const [aisApiKey, setAisApiKey] = useState(() => getStoredAisKey());
  const handleAisKeyChange = useCallback((key: string) => {
    setStoredAisKey(key);
    setAisApiKey(key);
  }, []);

  // ── Timeline ──
  const dateRange = useMemo(() => {
    const allDates = [
      ...points.map(p => p.date),
      ...lines.map(l => l.date),
      TODAY, // Always include today so live mode can reach it
    ].sort();
    return {
      min: allDates[0] || '2025-12-01',
      max: allDates[allDates.length - 1] || TODAY,
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

      // Sync Cesium clock every frame for smooth day/night terminator
      const viewer = viewerRef.current?.cesiumElement;
      if (viewer && !viewer.isDestroyed()) {
        viewer.clock.currentTime = JulianDate.fromDate(new Date(simTimeRef.current));
      }

      // In live mode (1x), clamp to real time; otherwise clamp to end of timeline
      const now = Date.now();
      const maxMs = dateToMs(dateRange.max) + 86400000;
      const clampMs = playbackSpeed <= 1 ? Math.min(now, maxMs) : maxMs;

      if (simTimeRef.current >= clampMs) {
        simTimeRef.current = clampMs;
        if (playbackSpeed <= 1) {
          // Live mode — stay at current time, keep ticking
        } else {
          setIsPlaying(false);
          setCurrentDate(dateRange.max);
          return;
        }
      }

      const newDate = msToDateStr(simTimeRef.current);

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
        // Only restart from beginning if sim time is past end of timeline
        const maxMs = dateToMs(dateRange.max) + 86400000;
        if (simTimeRef.current >= maxMs) {
          const startMs = dateToMs(dateRange.min);
          simTimeRef.current = startMs;
          setCurrentDate(dateRange.min);
        }
      }
      return !prev;
    });
  }, [dateRange]);

  const goLive = useCallback(() => {
    simTimeRef.current = Date.now(); // Real current time
    setCurrentDate(TODAY);
    setPlaybackSpeed(1); // Real-time 1x speed
    setIsPlaying(true);  // Start playing in real-time
  }, []);

  // When user manually changes date (scrub, step), sync simTimeRef
  const handleDateChange = useCallback((date: string) => {
    simTimeRef.current = dateToMs(date) + 43200000; // noon of that day
    setCurrentDate(date);
  }, []);

  // Intra-day time scrub — sets simTimeRef to exact ms within the day
  const handleTimeChange = useCallback((ms: number) => {
    simTimeRef.current = ms;
    setCurrentDate(msToDateStr(ms));
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

  const toggleLayer = (layer: 'satellites' | 'flights' | 'quakes' | 'weather' | 'nfz' | 'ships' | 'gpsJam' | 'internetBlackout' | 'groundTruth') => {
    setLayers(prev => ({ ...prev, [layer]: !prev[layer] }));
  };

  const handleOrbitMode = useCallback((mode: OrbitMode) => {
    setOrbitMode(mode);
    if (mode === 'off') {
      stopOrbit();
    } else {
      startOrbit(mode, 3);
    }
  }, [startOrbit, stopOrbit]);

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
    } else if (visualMode === 'panoptic') {
      stages.add(createPanopticStage());
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

  // ── Satellite targets — strike/retaliation points for targeting lines ──
  const satTargets = useMemo(
    () => filteredPoints
      .filter(p => p.cat === 'strike' || p.cat === 'retaliation')
      .map(p => ({ lon: p.lon, lat: p.lat })),
    [filteredPoints],
  );

  // ── External data layers (synced to timeline) ──
  const { count: satCount, groupCounts: satGroupCounts, fovCount: satFovCount } = useSatellites(cesiumViewer, layers.satellites, simTimeRef, showFov, satTargets);
  const { count: flightCount } = useFlights(cesiumViewer, layers.flights && mode === 'live');
  const { count: quakeCount } = useEarthquakes(cesiumViewer, layers.quakes, currentDate);
  const { count: weatherCount } = useWeather(cesiumViewer, layers.weather, currentDate);
  const { count: nfzCount } = useNoFlyZones(cesiumViewer, layers.nfz, currentDate);
  const { count: shipCount } = useShips(cesiumViewer, layers.ships && mode === 'live', aisApiKey);
  const { count: gpsJamCount } = useGpsJamming(cesiumViewer, layers.gpsJam, currentDate);
  const { count: internetBlackoutCount } = useInternetBlackout(cesiumViewer, layers.internetBlackout, currentDate);
  const { count: groundTruthCount } = useGroundTruth(cesiumViewer, layers.groundTruth, points, events, currentDate);

  // ── Sync Cesium clock for day/night terminator ──
  useEffect(() => {
    if (!cesiumViewer || cesiumViewer.isDestroyed()) return;
    const julianDate = JulianDate.fromDate(new Date(simTimeRef.current));
    cesiumViewer.clock.currentTime = julianDate;
  }, [cesiumViewer, currentDate]);

  const totalLines = pastLines.length + currentLines.length;

  // ── Stats data (for timeline bar + mobile sheet) ──
  const stats = useMemo(() => ({
    locations: filteredPoints.length,
    vectors: totalLines,
    sats: layers.satellites && satCount > 0 ? satCount : undefined,
    fov: layers.satellites && showFov && satFovCount > 0 ? satFovCount : undefined,
    flights: mode === 'live' && layers.flights && flightCount > 0 ? flightCount : undefined,
    quakes: layers.quakes && quakeCount > 0 ? quakeCount : undefined,
    wx: layers.weather && weatherCount > 0 ? weatherCount : undefined,
    nfz: layers.nfz && nfzCount > 0 ? nfzCount : undefined,
    ships: mode === 'live' && layers.ships && shipCount > 0 ? shipCount : undefined,
    gpsJam: layers.gpsJam && gpsJamCount > 0 ? gpsJamCount : undefined,
    internetBlackout: layers.internetBlackout && internetBlackoutCount > 0 ? internetBlackoutCount : undefined,
    groundTruth: layers.groundTruth && groundTruthCount > 0 ? groundTruthCount : undefined,
    historical: mode === 'historical',
  }), [filteredPoints.length, totalLines, layers, satCount, satFovCount, showFov, flightCount, quakeCount, weatherCount, nfzCount, shipCount, gpsJamCount, internetBlackoutCount, groundTruthCount, mode]);

  return (
    <div className="globe-wrapper">
      {/* Operation header */}
      <div className="globe-header">
        <div className="globe-header-dateline">{meta.dateline}</div>
        <div className="globe-header-op">{meta.operationName}</div>
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

      {/* Military HUD overlay */}
      <CesiumHud
        viewer={cesiumViewer}
        visible={showHud}
        visualMode={visualMode}
        simTimeRef={simTimeRef}
        currentDate={currentDate}
      />

      {/* Info panel */}
      {selectedPoint && (
        <CesiumInfoPanel point={selectedPoint} onClose={() => setSelectedPoint(null)} />
      )}

      {/* Enhanced Timeline — always rendered */}
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
        stats={stats}
        simTimeRef={simTimeRef}
        onTimeChange={handleTimeChange}
      />

      {isMobile ? (
        <MobileBottomSheet
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
          showFov={showFov}
          onToggleFov={() => setShowFov(prev => !prev)}
          fovCount={satFovCount}
          aisApiKey={aisApiKey}
          onAisApiKeyChange={handleAisKeyChange}
          events={events}
          currentDate={currentDate}
          kpis={kpis}
          stats={stats}
        />
      ) : (
        <>
          {/* KPI strip — hidden when info panel is open */}
          {!selectedPoint && <div className={`globe-kpi-strip${showAllKpis ? ' expanded' : ''}`}>
            {kpis.slice(0, showAllKpis ? kpis.length : 4).map(k => (
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
            {kpis.length > 4 && (
              <button className="globe-kpi-more" onClick={() => setShowAllKpis(p => !p)}>
                {showAllKpis ? '\u2212' : `+${kpis.length - 4}`}
              </button>
            )}
          </div>}

          {/* Overlay controls toolbar */}
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
            showFov={showFov}
            onToggleFov={() => setShowFov(prev => !prev)}
            fovCount={satFovCount}
            aisApiKey={aisApiKey}
            onAisApiKeyChange={handleAisKeyChange}
            showHud={showHud}
            onToggleHud={() => setShowHud(prev => !prev)}
            orbitMode={orbitMode}
            onOrbitMode={handleOrbitMode}
          />

          {/* Events / Intel feed panel */}
          <CesiumEventsPanel
            events={events}
            currentDate={currentDate}
            isOpen={eventsOpen}
            onToggle={() => setEventsOpen(prev => !prev)}
          />
        </>
      )}
    </div>
  );
}
