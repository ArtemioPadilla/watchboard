import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Math as CesiumMath,
  type Viewer as CesiumViewer,
  Cartesian3,
} from 'cesium';
import type { VisualMode } from './cesium-shaders';

interface Props {
  viewer: CesiumViewer | null;
  visible: boolean;
  visualMode: VisualMode;
  simTimeRef: React.RefObject<number>;
  currentDate: string;
}

/** Convert decimal degrees to DMS string */
function toDMS(deg: number, isLat: boolean): string {
  const abs = Math.abs(deg);
  const d = Math.floor(abs);
  const m = Math.floor((abs - d) * 60);
  const s = ((abs - d - m / 60) * 3600).toFixed(2);
  const dir = isLat ? (deg >= 0 ? 'N' : 'S') : (deg >= 0 ? 'E' : 'W');
  return `${d}°${m.toString().padStart(2, '0')}'${s.padStart(5, '0')}"${dir}`;
}

/** Convert lat/lon to MGRS (simplified — 100km grid approximation) */
function toMGRS(lat: number, lon: number): string {
  // UTM zone
  const zone = Math.floor((lon + 180) / 6) + 1;
  // UTM band letter
  const bands = 'CDEFGHJKLMNPQRSTUVWX';
  const bandIdx = Math.min(Math.max(Math.floor((lat + 80) / 8), 0), bands.length - 1);
  const band = bands[bandIdx];

  // 100km grid square ID (simplified)
  const colLetters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const rowLetters = 'ABCDEFGHJKLMNPQRSTUV';
  const colIdx = Math.floor(((lon % 6) + 6) % 6 / 6 * 8) % colLetters.length;
  const rowIdx = Math.floor(((lat % 8) + 8) % 8 / 8 * 20) % rowLetters.length;
  const sq = colLetters[colIdx] + rowLetters[rowIdx];

  // Easting/Northing within 100km square (5-digit)
  const easting = Math.floor(((lon % 6 + 6) % 6 / 6) * 100000).toString().padStart(5, '0');
  const northing = Math.floor(((lat % 8 + 8) % 8 / 8) * 100000).toString().padStart(5, '0');

  return `${zone}${band} ${sq} ${easting.substring(0, 4)} ${northing.substring(0, 4)}`;
}

/** Compute approximate Ground Sample Distance in meters */
function computeGSD(altitudeM: number): number {
  // Simulating a KH-11 class sensor: ~0.1m GSD at 250km altitude
  // GSD scales linearly with altitude
  return (altitudeM / 250_000) * 0.1 * 1000; // result in meters
}

/** NIIRS rating from GSD (National Imagery Interpretability Rating Scale) */
function computeNIIRS(gsdMeters: number): number {
  if (gsdMeters <= 0) return 9;
  // NIIRS = 11.81 + 3.32 * log10(1/GSD) — General Image Quality Equation simplified
  const niirs = 11.81 + 3.32 * Math.log10(1 / gsdMeters);
  return Math.max(0, Math.min(9, niirs));
}

/** Compute sun elevation angle for a given location and time */
function computeSunElevation(lat: number, lon: number, date: Date): number {
  const dayOfYear = Math.floor(
    (date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86400000,
  );
  const declination = 23.45 * Math.sin(((360 / 365) * (dayOfYear - 81) * Math.PI) / 180);
  const hourAngle = ((date.getUTCHours() + date.getUTCMinutes() / 60 + lon / 15) % 24 - 12) * 15;

  const latRad = (lat * Math.PI) / 180;
  const decRad = (declination * Math.PI) / 180;
  const haRad = (hourAngle * Math.PI) / 180;

  const sinElevation =
    Math.sin(latRad) * Math.sin(decRad) +
    Math.cos(latRad) * Math.cos(decRad) * Math.cos(haRad);

  return (Math.asin(sinElevation) * 180) / Math.PI;
}

/** Compute distance between two Cartesian3 points */
function distanceBetween(a: Cartesian3, b: Cartesian3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** Format distance for scale bar */
function formatDistance(meters: number): string {
  if (meters >= 1000000) return `${(meters / 1000000).toFixed(0)}K km`;
  if (meters >= 1000) return `${(meters / 1000).toFixed(0)} km`;
  return `${meters.toFixed(0)} m`;
}

const VISUAL_MODE_LABELS: Record<VisualMode, string> = {
  normal: 'NORMAL',
  crt: 'CRT',
  nvg: 'NVG',
  thermal: 'FLIR',
  panoptic: 'PANOPTIC',
};

/** Military-grade HUD overlay — MGRS, GSD, NIIRS, sun elevation, classification banner */
export default function CesiumHud({ viewer, visible, visualMode, simTimeRef, currentDate }: Props) {
  const [hudData, setHudData] = useState({
    mgrs: '',
    latDms: '',
    lonDms: '',
    altitude: 0,
    gsd: 0,
    niirs: 0,
    sunElevation: 0,
    recTime: '',
    scaleDistance: '',
    scaleWidth: 0,
  });
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!viewer || !visible || viewer.isDestroyed()) {
      cancelAnimationFrame(rafRef.current);
      return;
    }

    const update = () => {
      if (viewer.isDestroyed()) return;

      const camera = viewer.camera;
      const carto = camera.positionCartographic;
      const lat = CesiumMath.toDegrees(carto.latitude);
      const lon = CesiumMath.toDegrees(carto.longitude);
      const alt = carto.height;

      const simDate = new Date(simTimeRef.current);
      const sunEl = computeSunElevation(lat, lon, simDate);
      const gsd = computeGSD(alt);
      const niirs = computeNIIRS(gsd);

      // REC timestamp
      const recTime = simDate.toISOString().replace('T', ' ').substring(0, 23) + 'Z';

      // Scale bar calculation — compute ground distance for ~150px on screen
      const canvas = viewer.scene.canvas;
      const centerX = canvas.clientWidth / 2;
      const centerY = canvas.clientHeight / 2;
      let scaleDistance = '';
      let scaleWidth = 150;

      try {
        const leftRay = viewer.camera.getPickRay({ x: centerX - 75, y: centerY } as any);
        const rightRay = viewer.camera.getPickRay({ x: centerX + 75, y: centerY } as any);
        if (leftRay && rightRay) {
          const leftPos = viewer.scene.globe.pick(leftRay, viewer.scene);
          const rightPos = viewer.scene.globe.pick(rightRay, viewer.scene);
          if (leftPos && rightPos) {
            const dist = distanceBetween(leftPos, rightPos);
            // Round to nice number
            const niceDistances = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000, 1000000, 2000000, 5000000];
            let niceDist = niceDistances[0];
            for (const nd of niceDistances) {
              if (nd <= dist * 1.2) niceDist = nd;
              else break;
            }
            scaleWidth = Math.round((niceDist / dist) * 150);
            scaleDistance = formatDistance(niceDist);
          }
        }
      } catch {
        // Globe pick may fail at extreme angles
      }

      setHudData({
        mgrs: toMGRS(lat, lon),
        latDms: toDMS(lat, true),
        lonDms: toDMS(lon, false),
        altitude: Math.round(alt),
        gsd: gsd,
        niirs: niirs,
        sunElevation: sunEl,
        recTime,
        scaleDistance,
        scaleWidth,
      });

      rafRef.current = requestAnimationFrame(update);
    };

    rafRef.current = requestAnimationFrame(update);

    return () => cancelAnimationFrame(rafRef.current);
  }, [viewer, visible, simTimeRef]);

  if (!visible) return null;

  const gsdStr = hudData.gsd >= 1000
    ? `${(hudData.gsd / 1000).toFixed(2)}K`
    : `${hudData.gsd.toFixed(2)}`;
  const altStr = hudData.altitude >= 1000000
    ? `${Math.round(hudData.altitude)}M`
    : hudData.altitude >= 1000
      ? `${Math.round(hudData.altitude)}M`
      : `${hudData.altitude}M`;

  return (
    <div className="hud-overlay">
      {/* Classification banner */}
      <div className="hud-classification">
        OSINT // OPEN SOURCE // UNCLASSIFIED
      </div>

      {/* Top-left — designation + mode */}
      <div className="hud-top-left">
        <div className="hud-designation">OSINT-TRACKER OPS-001</div>
        <div className="hud-mode-label">{VISUAL_MODE_LABELS[visualMode]}</div>
      </div>

      {/* Top-right — REC timestamp + orbital params */}
      <div className="hud-top-right">
        <div className="hud-rec">
          <span className="hud-rec-dot" />
          REC {hudData.recTime}
        </div>
        <div className="hud-orbital">ORB: 47951 PASS: DESC-193</div>
      </div>

      {/* Bottom-left — MGRS + coordinates */}
      <div className="hud-bottom-left">
        <div className="hud-mgrs">MGRS: {hudData.mgrs}</div>
        <div className="hud-coords">{hudData.latDms} {hudData.lonDms}</div>
      </div>

      {/* Bottom-right — GSD, NIIRS, ALT, SUN */}
      <div className="hud-bottom-right">
        <div className="hud-gsd">GSD: {gsdStr}M NIIRS: {hudData.niirs.toFixed(1)}</div>
        <div className="hud-alt">ALT: {altStr} SUN: {hudData.sunElevation.toFixed(1)}° EL</div>
      </div>

      {/* Active visual mode badge — top right corner */}
      <div className="hud-active-mode">{VISUAL_MODE_LABELS[visualMode]}</div>

      {/* Scale bar — bottom center */}
      {hudData.scaleDistance && (
        <div className="hud-scale-bar">
          <div className="hud-scale-line" style={{ width: hudData.scaleWidth + 'px' }} />
          <div className="hud-scale-label">{hudData.scaleDistance}</div>
        </div>
      )}
    </div>
  );
}
