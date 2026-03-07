import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Viewer } from 'resium';
import {
  Camera,
  Cartesian3,
  Math as CesiumMath,
  Color,
  Rectangle,
  SceneMode,
  type Viewer as CesiumViewer,
} from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import type { CesiumComponentRef } from 'resium';
import type { MapPoint, MapLine, KpiItem, Meta } from '../../../lib/schemas';
import { MAP_CATEGORIES } from '../../../lib/map-utils';
import { configureCesium } from '../../../lib/cesium-config';
import { createCRTStage, createNVGStage, createThermalStage, type VisualMode } from './cesium-shaders';
import { useCesiumCamera } from './useCesiumCamera';
import CesiumPoints from './CesiumPoints';
import CesiumArcs from './CesiumArcs';
import CesiumControls from './CesiumControls';
import CesiumInfoPanel from './CesiumInfoPanel';
import CesiumTimeline from './CesiumTimeline';
import { useSatellites } from './useSatellites';
import { useFlights } from './useFlights';
import { useEarthquakes } from './useEarthquakes';

interface Props {
  points: MapPoint[];
  lines: MapLine[];
  kpis: KpiItem[];
  meta: Meta;
}

// Configure Cesium Ion on module load
configureCesium();

// Override Cesium's default home view (USA) with Middle East theater
Camera.DEFAULT_VIEW_RECTANGLE = Rectangle.fromDegrees(25, 12, 65, 42);

const KPI_COLORS: Record<string, string> = {
  red: '#e74c3c',
  amber: '#f39c12',
  blue: '#3498db',
  green: '#2ecc71',
};

// Stable DOM element for Cesium credit container (must not change between renders)
const creditDiv = document.createElement('div');

export default function CesiumGlobe({ points, lines, kpis, meta }: Props) {
  const viewerRef = useRef<CesiumComponentRef<CesiumViewer> | null>(null);
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
  const [layers, setLayers] = useState({ satellites: true, flights: true, quakes: false });

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
        setCurrentDate(cur => (cur >= dateRange.max ? dateRange.min : cur));
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

  const toggleLayer = (layer: 'satellites' | 'flights' | 'quakes') => {
    setLayers(prev => ({ ...prev, [layer]: !prev[layer] }));
  };

  const filteredPoints = useMemo(
    () => points.filter(p => activeFilters.has(p.cat) && (p.base || p.date <= currentDate)),
    [points, activeFilters, currentDate],
  );

  const filteredLines = useMemo(
    () => lines.filter(l => activeFilters.has(l.cat) && l.date <= currentDate),
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
    // Remove all custom stages
    stages.removeAll();

    if (visualMode === 'crt') {
      stages.add(createCRTStage());
    } else if (visualMode === 'nvg') {
      stages.add(createNVGStage());
    } else if (visualMode === 'thermal') {
      stages.add(createThermalStage());
    }
  }, [visualMode]);

  // Initial camera position + store viewer in state for hooks
  const handleViewerReady = useCallback((viewer: CesiumViewer) => {
    // Set dark background
    viewer.scene.backgroundColor = Color.fromCssColorString('#0a0b0e');
    viewer.scene.globe.baseColor = Color.fromCssColorString('#0d0f14');

    // Atmosphere settings for dark look
    viewer.scene.globe.enableLighting = false;
    if (viewer.scene.skyAtmosphere) {
      viewer.scene.skyAtmosphere.show = true;
    }

    // Fly to theater
    viewer.camera.setView({
      destination: Cartesian3.fromDegrees(49, 29, 3_000_000),
      orientation: {
        heading: CesiumMath.toRadians(0),
        pitch: CesiumMath.toRadians(-90),
        roll: 0,
      },
    });

    // Store in state to trigger re-render so hooks receive the viewer
    setCesiumViewer(viewer);
  }, []);

  // ── Real-time data feeds ──
  const { count: satCount } = useSatellites(cesiumViewer, layers.satellites);
  const { count: flightCount } = useFlights(cesiumViewer, layers.flights);
  const { count: quakeCount } = useEarthquakes(cesiumViewer, layers.quakes);

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
        creditContainer={creditDiv}
      >
        {cesiumViewer && (
          <>
            <CesiumPoints points={filteredPoints} onSelect={setSelectedPoint} />
            <CesiumArcs lines={filteredLines} />
          </>
        )}
      </Viewer>

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
      />

      {/* Info panel */}
      {selectedPoint && (
        <CesiumInfoPanel point={selectedPoint} onClose={() => setSelectedPoint(null)} />
      )}

      {/* Timeline */}
      <CesiumTimeline
        minDate={dateRange.min}
        maxDate={dateRange.max}
        currentDate={currentDate}
        isPlaying={isPlaying}
        onDateChange={setCurrentDate}
        onTogglePlay={togglePlay}
      />

      {/* Stats overlay */}
      <div className="globe-stats">
        <span>{filteredPoints.length} locations</span>
        <span className="globe-stats-sep">&middot;</span>
        <span>{filteredLines.length} vectors</span>
        {layers.satellites && satCount > 0 && (
          <>
            <span className="globe-stats-sep">&middot;</span>
            <span style={{ color: '#00ff88' }}>{satCount} sats</span>
          </>
        )}
        {layers.flights && flightCount > 0 && (
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
      </div>
    </div>
  );
}
