import React, { useRef, useEffect } from 'react';
import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import type { GeoFeature } from '../data/types';

interface CanvasGlobeProps {
  width: number;
  height: number;
  center?: { lat: number; lon: number };
  accentColor?: string;
  rotationOffset?: number;
  geoFeatures: GeoFeature[];
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

/** Check if a ring's centroid is on the visible hemisphere */
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
  return cosc > -0.1; // slightly generous to avoid popping
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
  // Batch all country fills into one path, then all strokes into another
  ctx.beginPath();
  for (const feature of features) {
    const { geometry } = feature;
    let rings: number[][][];

    if (geometry.type === 'Polygon') {
      rings = geometry.coordinates as number[][][];
    } else if (geometry.type === 'MultiPolygon') {
      // Flatten MultiPolygon to list of rings (outer rings only)
      rings = [];
      for (const polygon of geometry.coordinates as number[][][][]) {
        rings.push(polygon[0]); // outer ring only
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

  // Stroke pass — thinner lines for country borders
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
          started = false; // break stroke on hidden points
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
  geoFeatures,
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

    // Clip to globe circle for grid and countries
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();

    // 3. Grid lines
    drawGridLines(ctx, centerLon, centerLat, radius, cx, cy);

    // 4. Country polygons from GeoJSON
    if (geoFeatures.length > 0) {
      drawCountries(ctx, geoFeatures, centerLon, centerLat, radius, cx, cy);
    }

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
  }, [frame, width, height, center, accentColor, rotationOffset, fps, dpr, geoFeatures]);

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
