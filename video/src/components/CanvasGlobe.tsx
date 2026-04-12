import React, { useRef, useEffect } from 'react';
import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';

interface CanvasGlobeProps {
  width: number;
  height: number;
  center?: { lat: number; lon: number };
  accentColor?: string;
  rotationOffset?: number;
}

// ---------------------------------------------------------------------------
// Continent outlines — simplified [lon, lat] coordinate arrays
// ---------------------------------------------------------------------------

const NORTH_AMERICA: [number, number][] = [
  [-130, 55], [-125, 60], [-115, 62], [-100, 64], [-90, 68], [-80, 65],
  [-70, 60], [-65, 50], [-70, 44], [-75, 38], [-80, 32], [-82, 28],
  [-90, 28], [-97, 26], [-105, 22], [-105, 30], [-110, 32], [-118, 34],
  [-122, 38], [-125, 45], [-130, 55],
];

const SOUTH_AMERICA: [number, number][] = [
  [-80, 10], [-75, 5], [-70, 10], [-60, 5], [-50, 0], [-42, -3],
  [-38, -12], [-40, -22], [-48, -28], [-55, -34], [-60, -40],
  [-65, -46], [-68, -52], [-72, -48], [-75, -40], [-75, -20],
  [-80, -5], [-80, 10],
];

const EUROPE: [number, number][] = [
  [-10, 36], [-5, 40], [-2, 43], [2, 46], [5, 48], [8, 54],
  [12, 56], [18, 58], [25, 60], [30, 62], [35, 58], [30, 50],
  [28, 45], [25, 40], [20, 38], [15, 38], [10, 44], [5, 44],
  [-10, 36],
];

const AFRICA: [number, number][] = [
  [-15, 30], [-17, 20], [-16, 14], [-12, 8], [-5, 5], [5, 4],
  [9, 4], [12, 2], [15, -5], [20, -10], [28, -15], [35, -22],
  [30, -30], [25, -34], [18, -34], [15, -28], [12, -18],
  [10, -5], [5, 10], [10, 20], [10, 30], [5, 36], [-5, 36],
  [-15, 30],
];

const ASIA: [number, number][] = [
  [30, 62], [40, 65], [50, 55], [60, 58], [70, 55], [80, 50],
  [90, 48], [100, 52], [110, 48], [120, 55], [130, 60], [140, 55],
  [145, 48], [140, 42], [135, 35], [128, 35], [120, 30], [115, 22],
  [108, 18], [105, 12], [100, 8], [95, 15], [85, 20], [78, 25],
  [72, 22], [68, 24], [62, 25], [55, 26], [48, 30], [42, 36],
  [30, 42], [30, 62],
];

const AUSTRALIA: [number, number][] = [
  [115, -15], [120, -14], [128, -15], [135, -12], [142, -14],
  [146, -18], [150, -24], [153, -28], [150, -35], [140, -38],
  [132, -34], [125, -30], [118, -22], [115, -15],
];

const CONTINENTS: [number, number][][] = [
  NORTH_AMERICA,
  SOUTH_AMERICA,
  EUROPE,
  AFRICA,
  ASIA,
  AUSTRALIA,
];

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

  // Latitude lines every 30 degrees
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

  // Longitude lines every 30 degrees
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

function drawContinents(
  ctx: CanvasRenderingContext2D,
  centerLon: number,
  centerLat: number,
  radius: number,
  cx: number,
  cy: number,
): void {
  for (const continent of CONTINENTS) {
    // Project all points
    const projected = continent.map(([lon, lat]) =>
      projectOrthographic(lon, lat, centerLon, centerLat, radius, cx, cy),
    );

    // Only draw if at least some points are visible
    const visiblePoints = projected.filter((p) => p.visible);
    if (visiblePoints.length < 2) continue;

    // Fill
    ctx.beginPath();
    let started = false;
    for (const p of projected) {
      if (p.visible) {
        if (!started) {
          ctx.moveTo(p.x, p.y);
          started = true;
        } else {
          ctx.lineTo(p.x, p.y);
        }
      }
    }
    ctx.closePath();
    ctx.fillStyle = '#1a2535';
    ctx.fill();

    // Stroke
    ctx.beginPath();
    started = false;
    for (const p of projected) {
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
    ctx.strokeStyle = '#2a3a4f';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
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

  // Three expanding concentric rings
  for (let i = 0; i < 3; i++) {
    const phase = ((frame * 0.06) + (i * 0.33)) % 1;
    const ringRadius = 4 + phase * 28;
    const ringOpacity = Math.max(0, (1 - phase) * 0.6);

    ctx.beginPath();
    ctx.arc(p.x, p.y, ringRadius, 0, Math.PI * 2);
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = ringOpacity;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Glow
  const glowGradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 10);
  glowGradient.addColorStop(0, accentColor);
  glowGradient.addColorStop(1, 'transparent');
  ctx.beginPath();
  ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
  ctx.fillStyle = glowGradient;
  ctx.globalAlpha = 0.35;
  ctx.fill();
  ctx.globalAlpha = 1;

  // Solid center dot
  ctx.beginPath();
  ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
  ctx.fillStyle = accentColor;
  ctx.fill();

  // Bright core
  ctx.beginPath();
  ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const CanvasGlobe: React.FC<CanvasGlobeProps> = ({
  width,
  height,
  center,
  accentColor = '#e74c3c',
  rotationOffset = 0,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

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
    const radius = Math.min(width, height) * 0.42;

    // Compute rotation
    const defaultLon = frame * 0.5 + rotationOffset;
    let centerLon = defaultLon;
    let centerLat = 0;

    if (center) {
      const springValue = spring({
        frame,
        fps,
        config: { damping: 20, stiffness: 60, mass: 1.2 },
        durationInFrames: 40,
      });

      centerLon = interpolate(springValue, [0, 1], [defaultLon, center.lon]);
      centerLat = interpolate(springValue, [0, 1], [0, center.lat]);
    }

    // Normalize centerLon to [-180, 180]
    centerLon = ((centerLon % 360) + 540) % 360 - 180;

    // Clear
    ctx.clearRect(0, 0, width, height);

    // 1. Atmosphere glow (behind globe)
    drawAtmosphere(ctx, cx, cy, radius);

    // 2. Ocean fill
    drawOcean(ctx, cx, cy, radius);

    // Clip to globe circle for grid and continents
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();

    // 3. Grid lines
    drawGridLines(ctx, centerLon, centerLat, radius, cx, cy);

    // 4. Continent polygons
    drawContinents(ctx, centerLon, centerLat, radius, cx, cy);

    ctx.restore();

    // Subtle rim highlight
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(52, 152, 219, 0.15)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 5. Pulsing dot
    if (center) {
      drawPulsingDot(
        ctx,
        centerLon,
        centerLat,
        center.lat,
        center.lon,
        radius,
        cx,
        cy,
        frame,
        accentColor,
      );
    }
  }, [frame, width, height, center, accentColor, rotationOffset, fps, dpr]);

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
