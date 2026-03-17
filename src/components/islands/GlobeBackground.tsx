import { useEffect, useRef } from 'react';

/* ─── Land bands: simplified continent outlines at 4° latitude resolution ─── */
/* Each entry: [latitude, ...lonRanges[]] where lonRange is [minLon, maxLon]    */

const LAND: [number, ...[number, number][]][] = [
  [80, [-72, -12], [20, 180]],
  [76, [-73, -12], [15, 180]],
  [72, [-170, -12], [5, 180]],
  [68, [-170, -55], [-25, -13], [5, 180]],
  [64, [-170, -52], [-25, -13], [-8, 180]],
  [60, [-170, -50], [-12, 180]],
  [56, [-170, -52], [-12, 178]],
  [52, [-140, -52], [-10, 178]],
  [48, [-130, -52], [-8, 155]],
  [44, [-128, -60], [-10, 150]],
  [40, [-126, -68], [-10, 148]],
  [36, [-122, -72], [-10, 142]],
  [32, [-118, -76], [-5, 140]],
  [28, [-115, -80], [-18, 125]],
  [24, [-112, -80], [-18, 125]],
  [20, [-110, -68], [-18, 122]],
  [16, [-105, -83], [-18, 56], [72, 84], [92, 108]],
  [12, [-88, -82], [-18, 52], [72, 82], [95, 108]],
  [8, [-84, -76], [-15, 50], [72, 82], [95, 115]],
  [4, [-80, -75], [-8, 48], [73, 82], [95, 142]],
  [0, [-80, -75], [5, 42], [73, 80], [95, 142]],
  [-4, [-80, -68], [8, 42], [95, 152]],
  [-8, [-78, -65], [12, 42], [100, 155]],
  [-12, [-78, -55], [20, 42], [43, 50], [115, 150]],
  [-16, [-76, -48], [22, 40], [43, 50], [120, 148]],
  [-20, [-70, -40], [25, 36], [43, 48], [125, 148]],
  [-24, [-65, -35], [25, 35], [113, 153]],
  [-28, [-60, -38], [26, 33], [113, 153]],
  [-32, [-58, -45], [26, 32], [115, 152]],
  [-36, [-72, -50], [18, 30], [118, 150]],
  [-40, [-74, -62], [143, 148], [170, 178]],
  [-44, [-76, -66], [168, 178]],
  [-48, [-78, -68]],
  [-52, [-74, -70]],
];

const DEG_TO_RAD = Math.PI / 180;
const POINT_COUNT = 2200;
const SCAN_PERIOD_MS = 12_000;
const ROTATION_SPEED_DEG = 0.02;
const SCAN_BAND_PX = 80;
const MOUSE_RADIUS_PX = 120;

/* ─── Fibonacci sphere: uniform point distribution ─── */

interface SpherePoint {
  lat: number;
  lon: number;
  isLand: boolean;
}

function isLand(lat: number, lon: number): boolean {
  let bestBand: [number, ...[number, number][]] | null = null;
  let bestDist = Infinity;

  for (const band of LAND) {
    const dist = Math.abs(lat - band[0]);
    if (dist < bestDist) {
      bestDist = dist;
      bestBand = band;
    }
  }

  if (!bestBand || bestDist > 4) return false;

  for (let i = 1; i < bestBand.length; i++) {
    const range = bestBand[i] as [number, number];
    if (lon >= range[0] && lon <= range[1]) return true;
  }

  return false;
}

function buildFibonacciSphere(): SpherePoint[] {
  const points: SpherePoint[] = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  for (let i = 0; i < POINT_COUNT; i++) {
    const y = 1 - (i / (POINT_COUNT - 1)) * 2;
    const radiusAtY = Math.sqrt(1 - y * y);
    const theta = goldenAngle * i;

    const lat = Math.asin(y) / DEG_TO_RAD;
    const lon = ((theta / DEG_TO_RAD) % 360 + 540) % 360 - 180;

    points.push({ lat, lon, isLand: isLand(lat, lon) });
  }

  return points;
}

/* ─── Orthographic projection ─── */

function project(
  lat: number,
  lon: number,
  rotationDeg: number,
  cx: number,
  cy: number,
  radius: number,
): { x: number; y: number; z: number } | null {
  const latRad = lat * DEG_TO_RAD;
  const lonRad = (lon + rotationDeg) * DEG_TO_RAD;

  const cosLat = Math.cos(latRad);
  const x = cosLat * Math.sin(lonRad);
  const y = -Math.sin(latRad);
  const z = cosLat * Math.cos(lonRad);

  return { x: cx + x * radius, y: cy + y * radius, z };
}

/* ─── Props ─── */

interface GlobeBackgroundProps {
  events?: { lat: number; lon: number }[];
}

/* ─── Component ─── */

export default function GlobeBackground({ events = [] }: GlobeBackgroundProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;

    const points = buildFibonacciSphere();
    let rotation = 0;
    let frameId = 0;
    let startTime = performance.now();

    /* Mouse tracking — relative to canvas */
    let mouseX = -9999;
    let mouseY = -9999;

    function onMouseMove(e: MouseEvent) {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      mouseX = e.clientX - rect.left;
      mouseY = e.clientY - rect.top;
    }

    function onMouseLeave() {
      mouseX = -9999;
      mouseY = -9999;
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseleave', onMouseLeave);

    function resize() {
      if (!container || !canvas || !ctx) return;
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    resize();
    window.addEventListener('resize', resize);

    function render(now: number) {
      if (!canvas || !ctx || !container) return;

      const w = container.getBoundingClientRect().width;
      const h = container.getBoundingClientRect().height;
      const radius = Math.min(w, h) * 0.4;
      const cx = w * 0.5;
      const cy = h * 0.5;

      ctx.clearRect(0, 0, w, h);

      /* Atmosphere glow */
      const atmosGrad = ctx.createRadialGradient(cx, cy, radius * 0.85, cx, cy, radius * 1.25);
      atmosGrad.addColorStop(0, 'rgba(50, 160, 110, 0.06)');
      atmosGrad.addColorStop(1, 'rgba(50, 160, 110, 0)');
      ctx.fillStyle = atmosGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 1.25, 0, Math.PI * 2);
      ctx.fill();

      /* Globe outline */
      ctx.strokeStyle = 'rgba(50, 160, 110, 0.08)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();

      /* Scan beam position — cycles top to bottom of globe */
      const elapsed = now - startTime;
      const scanPhase = (elapsed % SCAN_PERIOD_MS) / SCAN_PERIOD_MS;
      const scanY = (cy - radius) + scanPhase * radius * 2;

      /* Draw scan beam line */
      ctx.strokeStyle = 'rgba(50, 160, 110, 0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - radius, scanY);
      ctx.lineTo(cx + radius, scanY);
      ctx.stroke();

      /* Scan beam glow band */
      const beamGrad = ctx.createLinearGradient(0, scanY - SCAN_BAND_PX / 2, 0, scanY + SCAN_BAND_PX / 2);
      beamGrad.addColorStop(0, 'rgba(50, 160, 110, 0)');
      beamGrad.addColorStop(0.5, 'rgba(50, 160, 110, 0.04)');
      beamGrad.addColorStop(1, 'rgba(50, 160, 110, 0)');
      ctx.fillStyle = beamGrad;
      ctx.fillRect(cx - radius, scanY - SCAN_BAND_PX / 2, radius * 2, SCAN_BAND_PX);

      /* Land dots */
      for (const pt of points) {
        if (!pt.isLand) continue;

        const proj = project(pt.lat, pt.lon, rotation, cx, cy, radius);
        if (!proj || proj.z < -0.02) continue;

        /* Clip to globe circle */
        const dx = proj.x - cx;
        const dy = proj.y - cy;
        if (dx * dx + dy * dy > radius * radius) continue;

        let alpha = 0.08 + proj.z * 0.1;
        let sizeBoost = 0;

        /* Scan beam boost: quadratic falloff within band */
        const distToScan = Math.abs(proj.y - scanY);
        if (distToScan < SCAN_BAND_PX) {
          const t = 1 - distToScan / SCAN_BAND_PX;
          alpha += t * t * 0.2;
        }

        /* Mouse proximity boost */
        const mDx = proj.x - mouseX;
        const mDy = proj.y - mouseY;
        const mDist = Math.sqrt(mDx * mDx + mDy * mDy);
        if (mDist < MOUSE_RADIUS_PX) {
          const t = 1 - mDist / MOUSE_RADIUS_PX;
          alpha += t * t * 0.25;
          sizeBoost = t * 0.6;
        }

        const dotSize = 1.0 + proj.z * 0.8 + sizeBoost;

        ctx.fillStyle = `rgba(50, 160, 110, ${alpha})`;
        ctx.beginPath();
        ctx.arc(proj.x, proj.y, dotSize, 0, Math.PI * 2);
        ctx.fill();
      }

      /* Event markers */
      for (const ev of events) {
        const proj = project(ev.lat, ev.lon, rotation, cx, cy, radius);
        if (!proj || proj.z < 0.05) continue;

        const dx = proj.x - cx;
        const dy = proj.y - cy;
        if (dx * dx + dy * dy > radius * radius) continue;

        let alpha = 0.15 + proj.z * 0.2;
        let evSizeBoost = 0;

        const distToScan = Math.abs(proj.y - scanY);
        if (distToScan < SCAN_BAND_PX) {
          const t = 1 - distToScan / SCAN_BAND_PX;
          alpha += t * t * 0.35;
        }

        /* Mouse proximity boost */
        const eDx = proj.x - mouseX;
        const eDy = proj.y - mouseY;
        const eDist = Math.sqrt(eDx * eDx + eDy * eDy);
        if (eDist < MOUSE_RADIUS_PX) {
          const t = 1 - eDist / MOUSE_RADIUS_PX;
          alpha += t * t * 0.35;
          evSizeBoost = t * 1.5;
        }

        /* Glow ring */
        if (alpha > 0.12) {
          ctx.fillStyle = `rgba(231, 76, 60, ${alpha * 0.3})`;
          ctx.beginPath();
          ctx.arc(proj.x, proj.y, 5 + evSizeBoost, 0, Math.PI * 2);
          ctx.fill();
        }

        /* Dot */
        ctx.fillStyle = `rgba(231, 76, 60, ${alpha})`;
        ctx.beginPath();
        ctx.arc(proj.x, proj.y, 2 + evSizeBoost * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }

      /* Advance rotation */
      if (!prefersReducedMotion) {
        rotation += ROTATION_SPEED_DEG;
      }

      frameId = requestAnimationFrame(render);
    }

    frameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', resize);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseleave', onMouseLeave);
    };
  }, [events]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} />
    </div>
  );
}
