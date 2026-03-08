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
  | 'explosion';

const iconCache = new Map<string, string>();

/** Get a cached data URI for the given icon type and color */
export function getIconDataUri(type: IconType, color?: string): string {
  const key = `${type}:${color || 'default'}`;
  const cached = iconCache.get(key);
  if (cached) return cached;

  const svg = generateSvg(type, color);
  const uri = 'data:image/svg+xml;base64,' + btoa(svg);
  iconCache.set(key, uri);
  return uri;
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
