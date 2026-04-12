import React, { useRef, useEffect } from 'react';
import { interpolate, Easing } from 'remotion';
import type { GeoFeature } from '../data/types';

interface CanvasGlobeProps {
  width: number;
  height: number;
  geoFeatures: GeoFeature[];
  trackers: Array<{ mapCenter: [number, number] }>;
  activeTrackerIndex: number; // -1 for intro/outro
  globalFrame: number; // absolute frame for continuous rotation
  accentColor?: string;
}

// ---------------------------------------------------------------------------
// Projection math
// ---------------------------------------------------------------------------

const DEG_TO_RAD = Math.PI / 180;

interface ProjectedPoint {
  x: number;
  y: number;
  visible: boolean;
}

function projectOrthographic(
  lon: number,
  lat: number,
  centerLon: number,
  centerLat: number,
  radius: number,
  cx: number,
  cy: number,
): ProjectedPoint {
  const lambda = (lon - centerLon) * DEG_TO_RAD;
  const phi = lat * DEG_TO_RAD;
  const phi0 = centerLat * DEG_TO_RAD;

  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const sinPhi0 = Math.sin(phi0);
  const cosPhi0 = Math.cos(phi0);
  const cosLambda = Math.cos(lambda);
  const sinLambda = Math.sin(lambda);

  const x = radius * cosPhi * sinLambda;
  const y = radius * (cosPhi0 * sinPhi - sinPhi0 * cosPhi * cosLambda);
  const cosc = sinPhi0 * sinPhi + cosPhi0 * cosPhi * cosLambda;

  return {
    x: cx + x,
    y: cy - y,
    visible: cosc > 0,
  };
}

// ---------------------------------------------------------------------------
// Globe center interpolation — smooth rotation between trackers
// ---------------------------------------------------------------------------

function computeGlobeCenter(
  trackers: Array<{ mapCenter: [number, number] }>,
  _activeTrackerIndex: number,
  globalFrame: number,
): { lon: number; lat: number } {
  // Frame layout (30fps):
  // Intro:     0-89    (3s)
  // Tracker 0: 90-239  (150 frames, 5s)
  // Tracker 1: 240-389 (150 frames, 5s)
  // Tracker 2: 390-539 (150 frames, 5s)
  // Outro:     540-689 (5s)
  //
  // Within each tracker segment (150 frames):
  //   0-14:   ease IN from previous position to tracker center
  //   15-134: HOLD at exact tracker center (dot perfectly centered)
  //   135-149: ease OUT toward next position

  const INTRO_END = 89;
  const SLIDE = 150; // frames per tracker
  const EASE = 15;   // transition frames

  // Extract tracker coordinates (lon, lat) with fallbacks
  const coords = trackers.map((t) => ({
    lon: t.mapCenter[1] ?? 30,
    lat: t.mapCenter[0] ?? 25,
  }));
  const t0 = coords[0] ?? { lon: 30, lat: 25 };
  const t1 = coords[1] ?? { lon: 60, lat: 20 };
  const t2 = coords[2] ?? { lon: -100, lat: 20 };

  const snappyEase = Easing.bezier(0.33, 1, 0.68, 1); // fast-out ease

  // Build keyframes: [frame, lon, lat] with snappy transitions and exact holds
  // Each tracker segment: quick ease-in (15f), exact hold, quick ease-out (15f)
  const T0_START = 90;
  const T1_START = 240;
  const T2_START = 390;
  const OUTRO_START = 540;
  const OUTRO_END = 689;

  // Keyframe arrays: [frame] → [lon] and [frame] → [lat]
  // Intro drifts slowly, then snaps to first tracker
  const frames = [
    0,                                 // intro start
    INTRO_END,                         // intro end
    T0_START + EASE,                   // T0 locked
    T0_START + SLIDE - EASE,           // T0 unlock
    T1_START + EASE,                   // T1 locked
    T1_START + SLIDE - EASE,           // T1 unlock
    T2_START + EASE,                   // T2 locked
    T2_START + SLIDE - EASE,           // T2 unlock
    OUTRO_START + EASE,                // outro drift start
    OUTRO_END,                         // outro end
  ];

  const lons = [
    20,        // intro: gentle starting lon
    t0.lon * 0.5, // approach first tracker
    t0.lon,    // locked on T0
    t0.lon,    // still T0
    t1.lon,    // locked on T1
    t1.lon,    // still T1
    t2.lon,    // locked on T2
    t2.lon,    // still T2
    t2.lon + 30, // outro drift
    t2.lon + 60, // outro end
  ];

  const lats = [
    15,        // intro
    t0.lat * 0.7,
    t0.lat,    // locked on T0
    t0.lat,    // still T0
    t1.lat,    // locked on T1
    t1.lat,    // still T1
    t2.lat,    // locked on T2
    t2.lat,    // still T2
    t2.lat * 0.5,
    10,
  ];

  const easeOpts = {
    easing: snappyEase,
    extrapolateLeft: 'clamp' as const,
    extrapolateRight: 'clamp' as const,
  };

  const lon = interpolate(globalFrame, frames, lons, easeOpts);
  const lat = interpolate(globalFrame, frames, lats, easeOpts);

  // No baseRotation — during tracker holds, globe center == tracker coords exactly
  // The transitions between trackers provide sufficient visual movement
  return { lon, lat };
}

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------

function drawOcean(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
): void {
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = '#0d1117';
  ctx.fill();
}

function drawAtmosphere(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
): void {
  const glowRadius = radius * 1.15;
  const gradient = ctx.createRadialGradient(cx, cy, radius * 0.92, cx, cy, glowRadius);
  gradient.addColorStop(0, 'rgba(26, 74, 122, 0.30)');
  gradient.addColorStop(0.5, 'rgba(26, 74, 122, 0.12)');
  gradient.addColorStop(1, 'rgba(26, 74, 122, 0)');

  ctx.beginPath();
  ctx.arc(cx, cy, glowRadius, 0, Math.PI * 2);
  ctx.fillStyle = gradient;
  ctx.fill();
}

function drawGridLines(
  ctx: CanvasRenderingContext2D,
  centerLon: number,
  centerLat: number,
  radius: number,
  cx: number,
  cy: number,
): void {
  ctx.strokeStyle = 'rgba(21, 25, 34, 0.5)';
  ctx.lineWidth = 0.8;

  for (let lat = -60; lat <= 60; lat += 30) {
    ctx.beginPath();
    let started = false;
    for (let lon = -180; lon <= 180; lon += 3) {
      const p = projectOrthographic(lon, lat, centerLon, centerLat, radius, cx, cy);
      if (p.visible) {
        if (!started) {
          ctx.moveTo(p.x, p.y);
          started = true;
        } else {
          ctx.lineTo(p.x, p.y);
        }
      } else {
        started = false;
      }
    }
    ctx.stroke();
  }

  for (let lon = -180; lon < 180; lon += 30) {
    ctx.beginPath();
    let started = false;
    for (let lat = -90; lat <= 90; lat += 3) {
      const p = projectOrthographic(lon, lat, centerLon, centerLat, radius, cx, cy);
      if (p.visible) {
        if (!started) {
          ctx.moveTo(p.x, p.y);
          started = true;
        } else {
          ctx.lineTo(p.x, p.y);
        }
      } else {
        started = false;
      }
    }
    ctx.stroke();
  }
}

function isRingVisible(
  ring: number[][],
  centerLon: number,
  centerLat: number,
): boolean {
  let lonSum = 0;
  let latSum = 0;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    lonSum += ring[i][0];
    latSum += ring[i][1];
  }
  const centLon = lonSum / n;
  const centLat = latSum / n;

  const lambda = (centLon - centerLon) * DEG_TO_RAD;
  const phi = centLat * DEG_TO_RAD;
  const phi0 = centerLat * DEG_TO_RAD;
  const cosc =
    Math.sin(phi0) * Math.sin(phi) +
    Math.cos(phi0) * Math.cos(phi) * Math.cos(lambda);
  return cosc > -0.1;
}

function drawCountries(
  ctx: CanvasRenderingContext2D,
  features: GeoFeature[],
  centerLon: number,
  centerLat: number,
  radius: number,
  cx: number,
  cy: number,
): void {
  ctx.beginPath();
  for (const feature of features) {
    const { geometry } = feature;
    let rings: number[][][];

    if (geometry.type === 'Polygon') {
      rings = geometry.coordinates as number[][][];
    } else if (geometry.type === 'MultiPolygon') {
      rings = [];
      for (const polygon of geometry.coordinates as number[][][][]) {
        rings.push(polygon[0]);
      }
    } else {
      continue;
    }

    for (const ring of rings) {
      if (!isRingVisible(ring, centerLon, centerLat)) continue;

      let started = false;
      for (const coord of ring) {
        const p = projectOrthographic(coord[0], coord[1], centerLon, centerLat, radius, cx, cy);
        if (p.visible) {
          if (!started) {
            ctx.moveTo(p.x, p.y);
            started = true;
          } else {
            ctx.lineTo(p.x, p.y);
          }
        }
      }
      if (started) ctx.closePath();
    }
  }
  ctx.fillStyle = '#1a2535';
  ctx.fill();

  ctx.beginPath();
  for (const feature of features) {
    const { geometry } = feature;
    let rings: number[][][];

    if (geometry.type === 'Polygon') {
      rings = geometry.coordinates as number[][][];
    } else if (geometry.type === 'MultiPolygon') {
      rings = [];
      for (const polygon of geometry.coordinates as number[][][][]) {
        rings.push(polygon[0]);
      }
    } else {
      continue;
    }

    for (const ring of rings) {
      if (!isRingVisible(ring, centerLon, centerLat)) continue;

      let started = false;
      for (const coord of ring) {
        const p = projectOrthographic(coord[0], coord[1], centerLon, centerLat, radius, cx, cy);
        if (p.visible) {
          if (!started) {
            ctx.moveTo(p.x, p.y);
            started = true;
          } else {
            ctx.lineTo(p.x, p.y);
          }
        } else {
          started = false;
        }
      }
    }
  }
  ctx.strokeStyle = '#2a3a4f';
  ctx.lineWidth = 0.8;
  ctx.stroke();
}

function drawPulsingDot(
  ctx: CanvasRenderingContext2D,
  centerLon: number,
  centerLat: number,
  targetLat: number,
  targetLon: number,
  radius: number,
  cx: number,
  cy: number,
  frame: number,
  accentColor: string,
): void {
  const p = projectOrthographic(targetLon, targetLat, centerLon, centerLat, radius, cx, cy);
  if (!p.visible) return;

  // Pulsing rings — larger and more visible
  for (let i = 0; i < 3; i++) {
    const phase = ((frame * 0.06) + (i * 0.33)) % 1;
    const ringRadius = 8 + phase * 44;
    const ringOpacity = Math.max(0, (1 - phase) * 0.7);

    ctx.beginPath();
    ctx.arc(p.x, p.y, ringRadius, 0, Math.PI * 2);
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 2;
    ctx.globalAlpha = ringOpacity;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Glow halo
  const glowGradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 18);
  glowGradient.addColorStop(0, accentColor);
  glowGradient.addColorStop(1, 'transparent');
  ctx.beginPath();
  ctx.arc(p.x, p.y, 18, 0, Math.PI * 2);
  ctx.fillStyle = glowGradient;
  ctx.globalAlpha = 0.4;
  ctx.fill();
  ctx.globalAlpha = 1;

  // Core dot — bigger
  ctx.beginPath();
  ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
  ctx.fillStyle = accentColor;
  ctx.fill();

  // White center highlight
  ctx.beginPath();
  ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const CanvasGlobe: React.FC<CanvasGlobeProps> = ({
  width,
  height,
  geoFeatures,
  trackers,
  activeTrackerIndex,
  globalFrame,
  accentColor = '#e74c3c',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 2);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const scaledWidth = width * dpr;
    const scaledHeight = height * dpr;

    canvas.width = scaledWidth;
    canvas.height = scaledHeight;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) * 0.46;

    // Compute globe center via smooth interpolation
    const { lon: rawLon, lat: centerLat } = computeGlobeCenter(
      trackers,
      activeTrackerIndex,
      globalFrame,
    );

    // Normalize centerLon to [-180, 180]
    const centerLon = ((rawLon % 360) + 540) % 360 - 180;

    // Clear
    ctx.clearRect(0, 0, width, height);

    // 1. Atmosphere glow
    drawAtmosphere(ctx, cx, cy, radius);

    // 2. Ocean fill
    drawOcean(ctx, cx, cy, radius);

    // Clip to globe circle
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();

    // 3. Grid lines
    drawGridLines(ctx, centerLon, centerLat, radius, cx, cy);

    // 4. Country polygons
    if (geoFeatures.length > 0) {
      drawCountries(ctx, geoFeatures, centerLon, centerLat, radius, cx, cy);
    }

    ctx.restore();

    // Rim highlight
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(52, 152, 219, 0.15)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 5. Pulsing dot at active tracker location
    if (activeTrackerIndex >= 0 && activeTrackerIndex < trackers.length) {
      const target = trackers[activeTrackerIndex];
      drawPulsingDot(
        ctx,
        centerLon,
        centerLat,
        target.mapCenter[0],
        target.mapCenter[1],
        radius,
        cx,
        cy,
        globalFrame,
        accentColor,
      );
    }
  }, [globalFrame, width, height, geoFeatures, trackers, activeTrackerIndex, accentColor, dpr]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width,
        height,
      }}
    />
  );
};
