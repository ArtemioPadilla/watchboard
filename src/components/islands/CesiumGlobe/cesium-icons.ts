/**
 * Custom SVG icon generators for CesiumJS billboard entities.
 *
 * Design language: NATO APP-6 frame shapes + minimalist geometric silhouettes
 * + pixel-art crispness at 32x32. White/bright centers with colored strokes
 * survive all post-processing modes (bloom, CRT, NVG, thermal).
 */

export type IconType =
  | 'strike'
  | 'retaliation'
  | 'naval'
  | 'airbase'
  | 'front'
  | 'satellite'
  | 'aircraft_mil'
  | 'aircraft_civ'
  | 'earthquake'
  | 'explosion'
  | 'weapon_ballistic'
  | 'weapon_cruise'
  | 'weapon_drone_loitering'
  | 'weapon_drone_ucav'
  | 'weapon_drone_recon'
  | 'weapon_drone_fpv'
  | 'weapon_rocket'
  | 'weapon_mixed'
  | 'weapon_unknown';

const iconCache = new Map<string, HTMLCanvasElement>();

/** Get a cached Canvas element for the given icon type and color.
 *  CesiumJS accepts Canvas elements directly as billboard images,
 *  bypassing the Image loading pipeline that causes per-frame errors with data URIs. */
export function getIconDataUri(type: IconType, color?: string): HTMLCanvasElement | string {
  const key = `${type}:${color || 'default'}`;
  const cached = iconCache.get(key);
  if (cached) return cached;

  // Render SVG to Canvas synchronously via offscreen drawing
  if (typeof document !== 'undefined') {
    const canvas = renderSvgToCanvas(generateSvg(type, color), 64);
    if (canvas) {
      iconCache.set(key, canvas);
      return canvas;
    }
  }

  // SSR fallback — return data URI (won't be used by CesiumJS in practice)
  const svg = generateSvg(type, color);
  return 'data:image/svg+xml;base64,' + btoa(svg);
}

/** Render SVG string to a Canvas element synchronously.
 *  Uses DOMParser + manual canvas drawing of simple shapes. */
function renderSvgToCanvas(svgString: string, size: number): HTMLCanvasElement | null {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Parse SVG and draw shapes manually
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgString, 'image/svg+xml');
    const svg = doc.documentElement;
    const viewBox = svg.getAttribute('viewBox')?.split(' ').map(Number) || [0, 0, 32, 32];
    const scale = size / (viewBox[2] || 32);

    ctx.scale(scale, scale);

    for (const el of Array.from(svg.children)) {
      drawSvgElement(ctx, el as SVGElement);
    }

    return canvas;
  } catch {
    return null;
  }
}

function drawSvgElement(ctx: CanvasRenderingContext2D, el: SVGElement): void {
  const fill = el.getAttribute('fill') || 'none';
  const stroke = el.getAttribute('stroke') || 'none';
  const strokeWidth = parseFloat(el.getAttribute('stroke-width') || '1');
  const opacity = parseFloat(el.getAttribute('opacity') || '1');

  ctx.save();
  ctx.globalAlpha = opacity;

  switch (el.tagName) {
    case 'circle': {
      const cx = parseFloat(el.getAttribute('cx') || '0');
      const cy = parseFloat(el.getAttribute('cy') || '0');
      const r = parseFloat(el.getAttribute('r') || '0');
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      if (fill !== 'none') { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke !== 'none') { ctx.strokeStyle = stroke; ctx.lineWidth = strokeWidth; ctx.stroke(); }
      break;
    }
    case 'rect': {
      const x = parseFloat(el.getAttribute('x') || '0');
      const y = parseFloat(el.getAttribute('y') || '0');
      const w = parseFloat(el.getAttribute('width') || '0');
      const h = parseFloat(el.getAttribute('height') || '0');
      const rx = parseFloat(el.getAttribute('rx') || '0');
      if (rx > 0) {
        roundRect(ctx, x, y, w, h, rx);
        if (fill !== 'none') { ctx.fillStyle = fill; ctx.fill(); }
        if (stroke !== 'none') { ctx.strokeStyle = stroke; ctx.lineWidth = strokeWidth; ctx.stroke(); }
      } else {
        if (fill !== 'none') { ctx.fillStyle = fill; ctx.fillRect(x, y, w, h); }
        if (stroke !== 'none') { ctx.strokeStyle = stroke; ctx.lineWidth = strokeWidth; ctx.strokeRect(x, y, w, h); }
      }
      break;
    }
    case 'polygon': {
      const points = (el.getAttribute('points') || '').trim().split(/\s+/).map(p => p.split(',').map(Number));
      if (points.length < 2) break;
      ctx.beginPath();
      ctx.moveTo(points[0][0], points[0][1]);
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
      ctx.closePath();
      if (fill !== 'none') { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke !== 'none') {
        ctx.strokeStyle = stroke; ctx.lineWidth = strokeWidth;
        ctx.lineJoin = (el.getAttribute('stroke-linejoin') as CanvasLineJoin) || 'miter';
        ctx.lineCap = (el.getAttribute('stroke-linecap') as CanvasLineCap) || 'butt';
        ctx.stroke();
      }
      break;
    }
    case 'polyline': {
      const points = (el.getAttribute('points') || '').trim().split(/\s+/).map(p => p.split(',').map(Number));
      if (points.length < 2) break;
      ctx.beginPath();
      ctx.moveTo(points[0][0], points[0][1]);
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
      if (fill !== 'none') { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke !== 'none') {
        ctx.strokeStyle = stroke; ctx.lineWidth = strokeWidth;
        ctx.lineJoin = (el.getAttribute('stroke-linejoin') as CanvasLineJoin) || 'miter';
        ctx.lineCap = (el.getAttribute('stroke-linecap') as CanvasLineCap) || 'butt';
        ctx.stroke();
      }
      break;
    }
    case 'line': {
      const x1 = parseFloat(el.getAttribute('x1') || '0');
      const y1 = parseFloat(el.getAttribute('y1') || '0');
      const x2 = parseFloat(el.getAttribute('x2') || '0');
      const y2 = parseFloat(el.getAttribute('y2') || '0');
      if (stroke !== 'none') {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = stroke; ctx.lineWidth = strokeWidth;
        ctx.stroke();
      }
      break;
    }
    case 'ellipse': {
      const cx = parseFloat(el.getAttribute('cx') || '0');
      const cy = parseFloat(el.getAttribute('cy') || '0');
      const rx = parseFloat(el.getAttribute('rx') || '0');
      const ry = parseFloat(el.getAttribute('ry') || '0');
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      if (fill !== 'none') { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke !== 'none') { ctx.strokeStyle = stroke; ctx.lineWidth = strokeWidth; ctx.stroke(); }
      break;
    }
    case 'path': {
      const d = el.getAttribute('d');
      if (d) {
        const path = new Path2D(d);
        if (fill !== 'none') { ctx.fillStyle = fill; ctx.fill(path); }
        if (stroke !== 'none') { ctx.strokeStyle = stroke; ctx.lineWidth = strokeWidth; ctx.stroke(path); }
      }
      break;
    }
    case 'text': {
      const x = parseFloat(el.getAttribute('x') || '0');
      const y = parseFloat(el.getAttribute('y') || '0');
      const fontSize = el.getAttribute('font-size') || '16';
      const fontFamily = el.getAttribute('font-family') || 'sans-serif';
      const fontWeight = el.getAttribute('font-weight') || 'normal';
      ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
      ctx.textAlign = (el.getAttribute('text-anchor') === 'middle' ? 'center' : 'start') as CanvasTextAlign;
      if (fill !== 'none') { ctx.fillStyle = fill; ctx.fillText(el.textContent || '', x, y); }
      break;
    }
  }
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function svgWrap(inner: string, size = 32): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" shape-rendering="crispEdges">${inner}</svg>`;
}

function generateSvg(type: IconType, color?: string): string {
  switch (type) {
    case 'strike': return svgStrike(color || '#e74c3c');
    case 'retaliation': return svgRetaliation(color || '#f39c12');
    case 'naval': return svgNaval(color || '#00ccff');
    case 'airbase': return svgAirbase(color || '#4aa3df');
    case 'front': return svgFront(color || '#9b59b6');
    case 'satellite': return svgSatellite(color || '#00ffcc');
    case 'aircraft_mil': return svgAircraftMil(color || '#ffdd00');
    case 'aircraft_civ': return svgAircraftCiv(color || '#00aaff');
    case 'earthquake': return svgEarthquake(color || '#ff6633');
    case 'explosion': return svgExplosion(color || '#ff4444');
    case 'weapon_ballistic': return svgWeaponBallistic(color || '#ff4466');
    case 'weapon_cruise': return svgWeaponCruise(color || '#44bbff');
    case 'weapon_drone_loitering': return svgWeaponDroneLoitering(color || '#88ff44');
    case 'weapon_drone_ucav': return svgWeaponDroneUcav(color || '#66dd66');
    case 'weapon_drone_recon': return svgWeaponDroneRecon(color || '#44cc88');
    case 'weapon_drone_fpv': return svgWeaponDroneFpv(color || '#aaff66');
    case 'weapon_rocket': return svgWeaponRocket(color || '#ffaa22');
    case 'weapon_mixed': return svgWeaponMixed(color || '#cc66ff');
    case 'weapon_unknown': return svgWeaponUnknown(color || '#888888');
  }
}

// ── Strike: Diamond frame + crosshair reticle ──
function svgStrike(c: string): string {
  return svgWrap(`
    <polygon points="16,2 30,16 16,30 2,16" fill="white" stroke="${c}" stroke-width="2"/>
    <line x1="16" y1="7" x2="16" y2="25" stroke="${c}" stroke-width="1.5"/>
    <line x1="7" y1="16" x2="25" y2="16" stroke="${c}" stroke-width="1.5"/>
    <circle cx="16" cy="16" r="3" fill="none" stroke="${c}" stroke-width="1.5"/>
  `);
}

// ── Retaliation: Diamond frame + upward chevron ──
function svgRetaliation(c: string): string {
  return svgWrap(`
    <polygon points="16,2 30,16 16,30 2,16" fill="white" stroke="${c}" stroke-width="2"/>
    <polyline points="9,20 16,10 23,20" fill="none" stroke="${c}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
  `);
}

// ── Naval: Circle frame + anchor ──
function svgNaval(c: string): string {
  return svgWrap(`
    <circle cx="16" cy="16" r="13" fill="white" stroke="${c}" stroke-width="2.5"/>
    <line x1="16" y1="7" x2="16" y2="25" stroke="${c}" stroke-width="2"/>
    <line x1="11" y1="11" x2="21" y2="11" stroke="${c}" stroke-width="2"/>
    <path d="M10,23 Q10,19 16,19 Q22,19 22,23" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round"/>
    <circle cx="16" cy="7" r="1.5" fill="${c}"/>
  `);
}

// ── Air Base: Rectangle frame + runway star ──
function svgAirbase(c: string): string {
  return svgWrap(`
    <rect x="3" y="6" width="26" height="20" rx="2" fill="white" stroke="${c}" stroke-width="2"/>
    <polygon points="16,9 18.5,14.5 24,15 20,18.5 21,24 16,21 11,24 12,18.5 8,15 13.5,14.5" fill="${c}" stroke="none"/>
  `);
}

// ── Front Line: Hexagon frame + exclamation ──
function svgFront(c: string): string {
  return svgWrap(`
    <polygon points="16,2 28,9 28,23 16,30 4,23 4,9" fill="white" stroke="${c}" stroke-width="2"/>
    <rect x="14" y="8" width="4" height="11" rx="1" fill="${c}"/>
    <circle cx="16" cy="24" r="2.5" fill="${c}"/>
  `);
}

// ── Satellite: Bus body + solar panel wings ──
function svgSatellite(c: string): string {
  return svgWrap(`
    <rect x="13" y="10" width="6" height="12" rx="1" fill="white" stroke="${c}" stroke-width="1.5"/>
    <rect x="2" y="12" width="10" height="8" rx="1" fill="white" stroke="${c}" stroke-width="1.5"/>
    <rect x="20" y="12" width="10" height="8" rx="1" fill="white" stroke="${c}" stroke-width="1.5"/>
    <line x1="4" y1="16" x2="10" y2="16" stroke="${c}" stroke-width="0.8"/>
    <line x1="22" y1="16" x2="28" y2="16" stroke="${c}" stroke-width="0.8"/>
    <circle cx="16" cy="16" r="1.5" fill="${c}"/>
  `);
}

// ── Aircraft Military: Swept-wing fighter (top-down) ──
function svgAircraftMil(c: string): string {
  return svgWrap(`
    <polygon points="16,2 18,10 28,18 18,16 19,28 16,24 13,28 14,16 4,18 14,10" fill="white" stroke="${c}" stroke-width="1.5" stroke-linejoin="round"/>
  `);
}

// ── Aircraft Civilian: Straight-wing airliner (top-down) ──
function svgAircraftCiv(c: string): string {
  return svgWrap(`
    <polygon points="16,3 17.5,12 28,16 17.5,17 18,27 16,25 14,27 14.5,17 4,16 14.5,12" fill="white" stroke="${c}" stroke-width="1.5" stroke-linejoin="round"/>
  `);
}

// ── Earthquake: Center dot + concentric seismic wave rings ──
function svgEarthquake(c: string): string {
  return svgWrap(`
    <circle cx="16" cy="16" r="4" fill="white" stroke="${c}" stroke-width="2"/>
    <circle cx="16" cy="16" r="9" fill="none" stroke="${c}" stroke-width="1.5" opacity="0.7"/>
    <circle cx="16" cy="16" r="14" fill="none" stroke="${c}" stroke-width="1" opacity="0.4"/>
  `);
}

// ── Explosion: 8-point starburst ──
function svgExplosion(c: string): string {
  // Generate an 8-point star
  const cx = 16, cy = 16, outerR = 14, innerR = 7;
  const points: string[] = [];
  for (let i = 0; i < 16; i++) {
    const angle = (i * Math.PI) / 8 - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    points.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
  }
  return svgWrap(`
    <polygon points="${points.join(' ')}" fill="white" stroke="${c}" stroke-width="1.5"/>
    <circle cx="16" cy="16" r="3" fill="${c}"/>
  `);
}

// ── Weapon Ballistic: Tall pointed warhead/chevron ──
function svgWeaponBallistic(c: string): string {
  return svgWrap(`
    <polygon points="16,1 20,12 19,28 16,30 13,28 12,12" fill="white" stroke="${c}" stroke-width="2" stroke-linejoin="round"/>
    <line x1="12" y1="24" x2="8" y2="28" stroke="${c}" stroke-width="1.5"/>
    <line x1="20" y1="24" x2="24" y2="28" stroke="${c}" stroke-width="1.5"/>
    <circle cx="16" cy="10" r="1.5" fill="${c}"/>
  `);
}

// ── Weapon Cruise: Sleek horizontal lozenge with tail fins ──
function svgWeaponCruise(c: string): string {
  return svgWrap(`
    <ellipse cx="16" cy="16" rx="14" ry="5" fill="white" stroke="${c}" stroke-width="2"/>
    <polygon points="2,16 6,11 6,21" fill="white" stroke="${c}" stroke-width="1.5" stroke-linejoin="round"/>
    <circle cx="20" cy="16" r="1.5" fill="${c}"/>
  `);
}

// ── Weapon Drone/Loitering: Delta-wing (Shahed silhouette) ──
function svgWeaponDroneLoitering(c: string): string {
  return svgWrap(`
    <polygon points="16,4 28,26 22,22 16,28 10,22 4,26" fill="white" stroke="${c}" stroke-width="1.5" stroke-linejoin="round"/>
    <line x1="16" y1="10" x2="16" y2="22" stroke="${c}" stroke-width="1"/>
  `);
}

// ── Weapon Drone UCAV: Fixed-wing armed drone (MQ-9 style top-down) ──
function svgWeaponDroneUcav(c: string): string {
  return svgWrap(`
    <polygon points="16,3 18,11 28,16 18,17 19,27 16,24 13,27 14,17 4,16 14,11" fill="white" stroke="${c}" stroke-width="1.5" stroke-linejoin="round"/>
    <rect x="14" y="14" width="4" height="4" rx="0.5" fill="${c}" opacity="0.6"/>
  `);
}

// ── Weapon Drone Recon: Fixed-wing with sensor dish ──
function svgWeaponDroneRecon(c: string): string {
  return svgWrap(`
    <polygon points="16,4 18,12 27,15 18,16 19,26 16,23 13,26 14,16 5,15 14,12" fill="white" stroke="${c}" stroke-width="1.5" stroke-linejoin="round"/>
    <circle cx="16" cy="20" r="3" fill="none" stroke="${c}" stroke-width="1.5"/>
    <circle cx="16" cy="20" r="1" fill="${c}"/>
  `);
}

// ── Weapon Drone FPV: Quadcopter (4 props at corners of a cross) ──
function svgWeaponDroneFpv(c: string): string {
  return svgWrap(`
    <line x1="8" y1="8" x2="24" y2="24" stroke="${c}" stroke-width="2"/>
    <line x1="24" y1="8" x2="8" y2="24" stroke="${c}" stroke-width="2"/>
    <circle cx="8" cy="8" r="4" fill="white" stroke="${c}" stroke-width="1.5"/>
    <circle cx="24" cy="8" r="4" fill="white" stroke="${c}" stroke-width="1.5"/>
    <circle cx="8" cy="24" r="4" fill="white" stroke="${c}" stroke-width="1.5"/>
    <circle cx="24" cy="24" r="4" fill="white" stroke="${c}" stroke-width="1.5"/>
    <rect x="14" y="14" width="4" height="4" rx="1" fill="${c}"/>
  `);
}

// ── Weapon Rocket: Compact pointed triangle with fin at base ──
function svgWeaponRocket(c: string): string {
  return svgWrap(`
    <polygon points="16,2 24,26 16,22 8,26" fill="white" stroke="${c}" stroke-width="2" stroke-linejoin="round"/>
    <line x1="16" y1="8" x2="16" y2="18" stroke="${c}" stroke-width="1.5"/>
    <circle cx="16" cy="7" r="1.5" fill="${c}"/>
  `);
}

// ── Weapon Mixed: Concentric circles (bullseye) ──
function svgWeaponMixed(c: string): string {
  return svgWrap(`
    <circle cx="16" cy="16" r="13" fill="white" stroke="${c}" stroke-width="2"/>
    <circle cx="16" cy="16" r="8" fill="none" stroke="${c}" stroke-width="1.5"/>
    <circle cx="16" cy="16" r="3" fill="${c}"/>
  `);
}

// ── Weapon Unknown: Circle with ? mark ──
function svgWeaponUnknown(c: string): string {
  return svgWrap(`
    <circle cx="16" cy="16" r="13" fill="white" stroke="${c}" stroke-width="2"/>
    <text x="16" y="21" text-anchor="middle" font-size="16" font-weight="bold" fill="${c}" font-family="monospace">?</text>
  `);
}

// ── Spacecraft: Orion-style capsule silhouette ──
let _spacecraftIcon: HTMLCanvasElement | string | null = null;
export function createSpacecraftIcon(): HTMLCanvasElement | string {
  if (_spacecraftIcon) return _spacecraftIcon;
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path d="M16 2L20 12L20 24L24 28L24 30L20 27L20 30L16 28L12 30L12 27L8 30L8 28L12 24L12 12Z" fill="#e0e0e0" stroke="#4ade80" stroke-width="1"/><circle cx="16" cy="10" r="2" fill="#60a5fa"/></svg>';
  if (typeof document !== 'undefined') {
    const canvas = renderSvgToCanvas(svg, 64);
    if (canvas) { _spacecraftIcon = canvas; return canvas; }
  }
  _spacecraftIcon = 'data:image/svg+xml;base64,' + btoa(svg);
  return _spacecraftIcon;
}
