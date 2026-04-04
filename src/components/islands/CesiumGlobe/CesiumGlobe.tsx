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
import { useConflictData, type GenericEntityInfo } from './useConflictData';
import { useMissiles } from './useMissiles';
import CesiumControls from './CesiumControls';
import CesiumInfoPanel from './CesiumInfoPanel';
import UnifiedTimelineBar from '../UnifiedTimelineBar';
import type { TimelineZoomLevel } from '../../../lib/timeline-bar-utils';
import CesiumEventsPanel from './CesiumEventsPanel';
import CesiumHud from './CesiumHud';
import { useSatellites } from './useSatellites';
import { useFlights } from './useFlights';
import { useEarthquakes } from './useEarthquakes';
import { useWeather } from './useWeather';
import { useNoFlyZones } from './useNoFlyZones';
import { useShips, getStoredAisKey, setStoredAisKey } from './useShips';
import { useGpsJamming } from './useGpsJamming';
import { useInternetBlackout } from './useInternetBlackout';
import { useGroundTruth } from './useGroundTruth';
import { useCinematicMode } from './useCinematicMode';
import { useLunarMission } from './useLunarMission';
import MissionHUD from './MissionHUD';
import type { MissionTrajectory } from '../../../lib/schemas';

interface Props {
  points: MapPoint[];
  lines: MapLine[];
  kpis: KpiItem[];
  meta: Meta;
  events?: FlatEvent[];
  cameraPresets?: Record<string, { lon: number; lat: number; alt: number; pitch: number; heading: number; label?: string }>;
  categories?: { id: string; label: string; color: string }[];
  mapCenter?: { lon: number; lat: number };
  isHistorical?: boolean;
  endDate?: string;
  clocks?: { label: string; offsetHours: number }[];
  missionTrajectory?: MissionTrajectory | null;
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

export default function CesiumGlobe({ points, lines, kpis, meta, events = [], cameraPresets = {}, categories = [], mapCenter, isHistorical = false, endDate, clocks, missionTrajectory }: Props) {
  const viewerRef = useRef<CesiumComponentRef<CesiumViewer> | null>(null);
  const creditDivRef = useRef<HTMLDivElement | null>(null);
  if (!creditDivRef.current && typeof document !== 'undefined') {
    creditDivRef.current = document.createElement('div');
  }
  const [cesiumViewer, setCesiumViewer] = useState<CesiumViewer | null>(null);
  const { flyTo, flyToPosition, startOrbit, stopOrbit, orbitModeRef } = useCesiumCamera(viewerRef, cameraPresets);

  // ── Filters ──
  const [activeFilters, setActiveFilters] = useState<Set<string>>(
    () => new Set(categories.map(c => c.id)),
  );
  const [selectedPoint, setSelectedPoint] = useState<MapPoint | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<GenericEntityInfo | null>(null);

  // ── Visual mode ──
  const [visualMode, setVisualMode] = useState<VisualMode>('normal');

  // ── Live data layer toggles ──
  const [layers, setLayers] = useState(() => {
    const mil = categories.some(c => c.id === 'strike' || c.id === 'retaliation');
    return {
      satellites: true, flights: true, quakes: false, weather: false, nfz: mil, ships: mil,
      gpsJam: mil, internetBlackout: mil, groundTruth: true,
    };
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

  // ── Timeline zoom ──
  const [zoomLevel, setZoomLevel] = useState<TimelineZoomLevel>('all');

  // ── Cinematic mode ──
  const [cinematicMode, setCinematicMode] = useState(false);

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
      ...(!isHistorical ? [TODAY] : []), // Only include today for live trackers
    ].sort();
    const maxFromData = allDates[allDates.length - 1] || TODAY;
    return {
      min: allDates[0] || '2025-12-01',
      max: isHistorical && endDate ? endDate : maxFromData,
    };
  }, [points, lines, isHistorical, endDate]);

  const initialDate = isHistorical ? dateRange.min : dateRange.max;
  const [currentDate, setCurrentDate] = useState(initialDate);
  const currentDateRef = useRef(currentDate);
  currentDateRef.current = currentDate;

  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(3600); // default: 1hr per real second

  // Continuous simulation time (ms since epoch)
  const simTimeRef = useRef<number>(dateToMs(initialDate));
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
        viewer.clock.multiplier = playbackSpeed;
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
        // Restart from beginning only if sim time is past end of timeline
        const maxMs = dateToMs(dateRange.max) + 86400000;
        if (simTimeRef.current >= maxMs) {
          const startMs = dateToMs(dateRange.min);
          simTimeRef.current = startMs;
          setCurrentDate(dateRange.min);
        }
        // Otherwise resume from current position (preserve scrub position)
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
    simTimeRef.current = dateToMs(date); // midnight of that day
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
    const cats = categories.length > 0 ? categories : MAP_CATEGORIES;
    const counts: Record<string, number> = {};
    for (const c of cats) counts[c.id] = 0;
    for (const p of filteredPoints) counts[p.cat] = (counts[p.cat] || 0) + 1;
    return counts;
  }, [filteredPoints, categories]);

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
    const center = mapCenter || { lon: 0, lat: 0 };
    const firstPreset = Object.values(cameraPresets)[0];
    const initLon = firstPreset?.lon ?? center.lon;
    const initLat = firstPreset?.lat ?? center.lat;
    const initAlt = firstPreset?.alt ?? 3_000_000;

    Camera.DEFAULT_VIEW_RECTANGLE = Rectangle.fromDegrees(
      initLon - 20, initLat - 15, initLon + 20, initLat + 15,
    );
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

    // Fly to initial position
    viewer.camera.setView({
      destination: Cartesian3.fromDegrees(initLon, initLat, initAlt),
      orientation: {
        heading: CesiumMath.toRadians(firstPreset?.heading ?? 0),
        pitch: CesiumMath.toRadians(firstPreset?.pitch ?? -90),
        roll: 0,
      },
    });

    setCesiumViewer(viewer);
  }, [cameraPresets, mapCenter]);

  // ── Conflict data (imperative entities) — points + past arcs ──
  const handlePointSelect = useCallback((point: MapPoint | null) => {
    setSelectedPoint(point);
    setSelectedEntity(null);
    if (point) setEventsOpen(false);
  }, []);
  const handleEntitySelect = useCallback((info: GenericEntityInfo) => {
    setSelectedPoint(null);
    setSelectedEntity(info);
    setEventsOpen(false);
  }, []);
  useConflictData(cesiumViewer, filteredPoints, pastLines, handlePointSelect, handleEntitySelect);

  // ── Current-date arcs + animated missiles ──
  useMissiles(cesiumViewer, currentLines, currentDate, isPlaying);

  // ── Satellite targets — strike/retaliation points for targeting lines ──
  const satTargets = useMemo(
    () => filteredPoints
      .filter(p => p.cat === 'strike' || p.cat === 'retaliation')
      .map(p => ({ lon: p.lon, lat: p.lat })),
    [filteredPoints],
  );

  // ── External data layers (synced to timeline) ──
  const { count: satCount, groupCounts: satGroupCounts, fovCount: satFovCount } = useSatellites(cesiumViewer, layers.satellites, simTimeRef, showFov, satTargets);
  const { count: flightCount, status: flightStatus } = useFlights(cesiumViewer, layers.flights && mode === 'live' && playbackSpeed <= 1);
  const { count: quakeCount } = useEarthquakes(cesiumViewer, layers.quakes, currentDate);
  const { count: weatherCount } = useWeather(cesiumViewer, layers.weather, currentDate);
  const { count: nfzCount } = useNoFlyZones(cesiumViewer, layers.nfz, currentDate);
  const { count: shipCount } = useShips(cesiumViewer, layers.ships && mode === 'live' && playbackSpeed <= 1, aisApiKey);
  const { count: gpsJamCount } = useGpsJamming(cesiumViewer, layers.gpsJam, currentDate);
  const { count: internetBlackoutCount } = useInternetBlackout(cesiumViewer, layers.internetBlackout, currentDate);
  const { count: groundTruthCount } = useGroundTruth(cesiumViewer, layers.groundTruth, points, events, currentDate);

  // ── Cinematic mode ──
  const {
    activeEventId: cinematicEventId,
    currentShot,
    totalShots,
    currentShotIndex: cinematicShotIndex,
    shotLabel,
  } = useCinematicMode(
    cesiumViewer,
    cinematicMode,
    simTimeRef,
    currentDate,
    playbackSpeed,
    lines,
    points,
    events,
    cameraPresets,
  );

  // ── Lunar mission trajectory ──
  const { telemetryRef, trackSpacecraft } = useLunarMission(cesiumViewer, missionTrajectory ?? null, simTimeRef);

  const handleToggleCinematic = useCallback(() => {
    setCinematicMode(prev => {
      if (!prev) {
        handleOrbitMode('off');
        setEventsOpen(true);
      }
      return !prev;
    });
  }, [handleOrbitMode]);

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
    flightStatus: mode === 'live' && layers.flights ? flightStatus : undefined,
    quakes: layers.quakes && quakeCount > 0 ? quakeCount : undefined,
    wx: layers.weather && weatherCount > 0 ? weatherCount : undefined,
    nfz: layers.nfz && nfzCount > 0 ? nfzCount : undefined,
    ships: mode === 'live' && layers.ships && shipCount > 0 ? shipCount : undefined,
    shipNoKey: mode === 'live' && layers.ships && !aisApiKey,
    gpsJam: layers.gpsJam && gpsJamCount > 0 ? gpsJamCount : undefined,
    internetBlackout: layers.internetBlackout && internetBlackoutCount > 0 ? internetBlackoutCount : undefined,
    groundTruth: layers.groundTruth && groundTruthCount > 0 ? groundTruthCount : undefined,
    historical: mode === 'historical',
  }), [filteredPoints.length, totalLines, layers, satCount, satFovCount, showFov, flightCount, flightStatus, quakeCount, weatherCount, nfzCount, shipCount, aisApiKey, gpsJamCount, internetBlackoutCount, groundTruthCount, mode]);

  return (
    <div className="globe-wrapper">
      {/* Operation header */}
      <div className="globe-slot globe-slot--top-center">
        <div className="globe-header">
          <div className="globe-header-dateline">{meta.dateline}</div>
          <div className="globe-header-op">{meta.operationName}</div>
        </div>
      </div>

      <div className="globe-canvas">
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
      </div>

      {/* Military HUD overlay */}
      <CesiumHud
        viewer={cesiumViewer}
        visible={showHud}
        visualMode={visualMode}
        simTimeRef={simTimeRef}
        currentDate={currentDate}
      />

      {/* Mission telemetry HUD */}
      {missionTrajectory && (
        <MissionHUD
          telemetryRef={telemetryRef}
          vehicle={missionTrajectory.vehicle}
          phases={missionTrajectory.phases}
          onTrackSpacecraft={trackSpacecraft}
        />
      )}

      {/* Cinematic mode overlay */}
      {cinematicMode && currentShot && (
        <div className="cinematic-overlay">
          <div className="cinematic-shot-counter">
            SHOT {cinematicShotIndex + 1} / {totalShots}
          </div>
          <div className="cinematic-shot-label">{shotLabel}</div>
        </div>
      )}

      {/* Info panel — close events panel when a point is selected */}
      {selectedPoint && (
        <div className="globe-slot globe-slot--right">
          <CesiumInfoPanel point={selectedPoint} onClose={() => setSelectedPoint(null)} />
        </div>
      )}

      {/* Generic entity info panel (flights, ships, satellites) */}
      {selectedEntity && !selectedPoint && (
        <div className="globe-slot globe-slot--right">
          <div className="globe-info-panel">
            <button className="globe-info-close" onClick={() => setSelectedEntity(null)} aria-label="Close info panel">
              &times;
            </button>
            <div className="globe-info-title">{selectedEntity.name}</div>
            {selectedEntity.description && (
              <pre className="globe-info-body" style={{ whiteSpace: 'pre-wrap', margin: '0.5rem 0 0', fontSize: '0.75rem', opacity: 0.85 }}>
                {selectedEntity.description}
              </pre>
            )}
          </div>
        </div>
      )}

      {/* Enhanced Timeline — always rendered */}
      <UnifiedTimelineBar
        context="3d"
        minDate={dateRange.min}
        maxDate={dateRange.max}
        currentDate={currentDate}
        isPlaying={isPlaying}
        playbackSpeed={playbackSpeed}
        events={events}
        lines={lines}
        onDateChange={handleDateChange}
        onTogglePlay={togglePlay}
        onSpeedChange={setPlaybackSpeed}
        onGoLive={goLive}
        onTimeChange={handleTimeChange}
        simTimeRef={simTimeRef}
        stats={stats}
        zoomLevel={zoomLevel}
        onZoomChange={setZoomLevel}
        isHistorical={isHistorical}
        clocks={clocks}
      />

      {/* KPI strip — hidden when info panel is open */}
      {!selectedPoint && !selectedEntity && (
        <div className="globe-slot globe-slot--top-right">
          <div className={`globe-kpi-strip${showAllKpis ? ' expanded' : ''}`}>
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
          </div>
        </div>
      )}

      {/* Overlay controls toolbar */}
      <div className="globe-slot globe-slot--left">
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
          cameraPresets={cameraPresets}
          categories={categories}
          cinematicMode={cinematicMode}
          onToggleCinematic={handleToggleCinematic}
        />
      </div>

      {/* Events / Intel feed panel */}
      <div className="globe-slot globe-slot--right">
        <CesiumEventsPanel
          events={events}
          currentDate={currentDate}
          isOpen={eventsOpen}
          onToggle={() => {
            setEventsOpen(prev => {
              if (!prev) setSelectedPoint(null); // Close info panel when opening intel feed
              return !prev;
            });
          }}
          activeEventId={cinematicMode ? cinematicEventId : undefined}
        />
      </div>
    </div>
  );
}
