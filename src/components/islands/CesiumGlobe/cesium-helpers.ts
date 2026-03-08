import { Cartesian3, Color, PolylineGlowMaterialProperty, PolylineDashMaterialProperty } from 'cesium';
import type { MaterialProperty } from 'cesium';
import { MAP_CATEGORIES } from '../../../lib/map-utils';

/** Convert category ID to Cesium Color */
export function catToCesiumColor(cat: string, alpha = 1.0): Color {
  const hex = MAP_CATEGORIES.find(c => c.id === cat)?.color || '#888888';
  return Color.fromCssColorString(hex).withAlpha(alpha);
}

/** Convert category ID to line Cesium Color */
export function lineToCesiumColor(cat: string): Color {
  if (cat === 'strike') return Color.fromCssColorString('#e74c3c').withAlpha(0.7);
  if (cat === 'retaliation') return Color.fromCssColorString('#f39c12').withAlpha(0.7);
  if (cat === 'front') return Color.fromCssColorString('#9b59b6').withAlpha(0.7);
  return Color.fromCssColorString('#3498db').withAlpha(0.7);
}

/** Generate a 3D arc between two lon/lat points with altitude peak */
export function arc3D(
  from: [number, number],
  to: [number, number],
  segments = 60,
  peakAltitude = 150_000,
): Cartesian3[] {
  const positions: Cartesian3[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const lon = from[0] + (to[0] - from[0]) * t;
    const lat = from[1] + (to[1] - from[1]) * t;
    const alt = Math.sin(t * Math.PI) * peakAltitude;
    positions.push(Cartesian3.fromDegrees(lon, lat, alt));
  }
  return positions;
}

/** Marker pixel size based on category and tier */
export function markerPixelSize(cat: string, tier: number): number {
  if (cat === 'front') return 10;
  if (cat === 'asset') return 8;
  if (tier === 1) return 8;
  return 6;
}

/** Line width based on category */
export function lineWidth(cat: string): number {
  if (cat === 'strike') return 2.0;
  if (cat === 'retaliation') return 1.5;
  return 1.0;
}

/** Line dash pattern (in pixels) */
export function lineDashPattern(cat: string): number {
  if (cat === 'strike') return 16;
  if (cat === 'retaliation') return 8;
  if (cat === 'front') return 4;
  return 12;
}

/** Front zone radius in meters */
export function frontZoneRadius(id: string): number {
  if (id === 'hormuz') return 60_000;
  return 40_000;
}

/** Arc material — glow for strike/retaliation, dash for front/asset */
export function arcMaterial(cat: string): MaterialProperty {
  const color = lineToCesiumColor(cat);
  if (cat === 'strike' || cat === 'retaliation') {
    return new PolylineGlowMaterialProperty({
      glowPower: 0.25,
      taperPower: 0.5,
      color,
    });
  }
  return new PolylineDashMaterialProperty({
    color: color.withAlpha(0.5),
    dashLength: lineDashPattern(cat),
  });
}

/** Haversine distance in meters between two [lon, lat] points */
export function haversineDistance(from: [number, number], to: [number, number]): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(to[1] - from[1]);
  const dLon = toRad(to[0] - from[0]);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from[1])) * Math.cos(toRad(to[1])) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Simulated flight duration in ms, based on haversine distance at ~2000 m/s */
export function simFlightDuration(from: [number, number], to: [number, number]): number {
  const dist = haversineDistance(from, to);
  return Math.max(60_000, (dist / 2000) * 1000); // min 1 minute simulated
}

/** Weapon-type-aware flight speed in m/s */
export function weaponSpeed(weaponType?: string): number {
  switch (weaponType) {
    case 'ballistic': return 4000;
    case 'cruise': return 900;
    case 'drone': return 200;
    case 'rocket': return 1200;
    case 'mixed': return 2000;
    default: return 2000;
  }
}

/** Weapon-type-aware peak altitude in meters */
export function weaponPeakAlt(weaponType?: string): number {
  switch (weaponType) {
    case 'ballistic': return 300_000;
    case 'cruise': return 50_000;
    case 'drone': return 30_000;
    case 'rocket': return 80_000;
    case 'mixed': return 150_000;
    default: return 150_000;
  }
}

/** Flight duration based on weapon type speed */
export function simFlightDurationTyped(
  from: [number, number],
  to: [number, number],
  weaponType?: string,
): number {
  const dist = haversineDistance(from, to);
  const speed = weaponSpeed(weaponType);
  return Math.max(60_000, (dist / speed) * 1000);
}

/** Projectile pixel size by weapon type */
export function weaponProjectileSize(weaponType?: string): number {
  switch (weaponType) {
    case 'ballistic': return 8;
    case 'cruise': return 6;
    case 'drone': return 4;
    case 'rocket': return 5;
    default: return 6;
  }
}

/** Glow power by weapon type */
export function weaponGlowPower(weaponType?: string): number {
  switch (weaponType) {
    case 'ballistic': return 0.4;
    case 'cruise': return 0.25;
    case 'drone': return 0.15;
    case 'rocket': return 0.3;
    default: return 0.25;
  }
}

/** Billboard size for icon entities */
export function billboardSize(cat: string, subType?: string): { width: number; height: number } {
  if (subType === 'naval') return { width: 28, height: 28 };
  if (subType === 'airbase') return { width: 22, height: 18 };
  if (cat === 'front') return { width: 22, height: 22 };
  if (cat === 'strike' || cat === 'retaliation') return { width: 24, height: 24 };
  return { width: 18, height: 18 };
}

/** Tier label for info panel */
export function tierLabelFull(t: number): string {
  return t === 1
    ? 'Tier 1 — Official'
    : t === 2
      ? 'Tier 2 — Major Outlet'
      : t === 3
        ? 'Tier 3 — Institutional'
        : 'Tier 4';
}

/** Tier CSS class for styling */
export function tierClass(t: number): string {
  return t === 1 ? 't1' : t === 2 ? 't2' : t === 3 ? 't3' : 't4';
}
