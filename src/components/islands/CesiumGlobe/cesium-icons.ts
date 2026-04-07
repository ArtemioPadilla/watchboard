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

const iconCache = new Map<string, string>();
const pendingRaster = new Map<string, Promise<string>>();

/** Get a cached data URI for the given icon type and color.
 *  Returns an SVG data URI immediately (sync), but also kicks off a
 *  canvas rasterization so that subsequent calls return a PNG data URI
 *  which CesiumJS handles without billboard image-load errors. */
export function getIconDataUri(type: IconType, color?: string): string {
  const key = `${type}:${color || 'default'}`;
  const cached = iconCache.get(key);
  if (cached) return cached;

  const svg = generateSvg(type, color);
  const svgUri = 'data:image/svg+xml,' + encodeURIComponent(svg);

  // Rasterize to PNG via canvas to avoid CesiumJS SVG billboard errors
  if (typeof document !== 'undefined' && !pendingRaster.has(key)) {
    const promise = rasterizeSvg(svgUri, 64).then(pngUri => {
      iconCache.set(key, pngUri);
      return pngUri;
    }).catch(() => {
      // Fallback: keep SVG URI if rasterization fails
      iconCache.set(key, svgUri);
      return svgUri;
    });
    pendingRaster.set(key, promise);
  }

  // Return SVG URI for first call; subsequent calls get the cached PNG
  iconCache.set(key, svgUri);
  return svgUri;
}

/** Pre-rasterize all icon types so they're ready as PNGs before Cesium uses them */
export async function preloadIcons(types: IconType[], colors: string[]): Promise<void> {
  const tasks: Promise<string>[] = [];
  for (const type of types) {
    for (const color of colors) {
      getIconDataUri(type, color); // kicks off rasterization
      const p = pendingRaster.get(`${type}:${color}`);
      if (p) tasks.push(p);
    }
  }
  await Promise.all(tasks);
}

function rasterizeSvg(svgUri: string, size: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('no 2d ctx')); return; }
      ctx.drawImage(img, 0, 0, size, size);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = svgUri;
  });
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
let _spacecraftIcon: string | null = null;
export function createSpacecraftIcon(): string {
  if (_spacecraftIcon) return _spacecraftIcon;
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path d="M16 2L20 12L20 24L24 28L24 30L20 27L20 30L16 28L12 30L12 27L8 30L8 28L12 24L12 12Z" fill="#e0e0e0" stroke="#4ade80" stroke-width="1"/><circle cx="16" cy="10" r="2" fill="#60a5fa"/></svg>';
  const svgUri = 'data:image/svg+xml,' + encodeURIComponent(svg);
  _spacecraftIcon = svgUri;
  // Async rasterize to PNG for CesiumJS reliability
  if (typeof document !== 'undefined') {
    rasterizeSvg(svgUri, 64).then(png => { _spacecraftIcon = png; }).catch(() => {});
  }
  return _spacecraftIcon;
}
