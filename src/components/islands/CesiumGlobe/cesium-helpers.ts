import { Cartesian3, Cartographic, Color, PolylineGlowMaterialProperty, PolylineDashMaterialProperty } from 'cesium';
import type { MaterialProperty } from 'cesium';
import type { IconType } from './cesium-icons';
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

/** Generate a 3D arc between two lon/lat points with altitude peak.
 *  `lateralOffset` (degrees) fans the arc perpendicular to the path —
 *  use it to visually separate overlapping arcs that share endpoints. */
export function arc3D(
  from: [number, number],
  to: [number, number],
  segments = 60,
  peakAltitude = 150_000,
  lateralOffset = 0,
): Cartesian3[] {
  // Perpendicular unit vector (in lon/lat space)
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const perpLon = -dy / len;
  const perpLat = dx / len;

  const positions: Cartesian3[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const baseLon = from[0] + dx * t;
    const baseLat = from[1] + dy * t;
    const alt = Math.sin(t * Math.PI) * peakAltitude;

    // Fan: 0 at endpoints, max at midpoint
    const fan = Math.sin(t * Math.PI) * lateralOffset;
    positions.push(Cartesian3.fromDegrees(
      baseLon + perpLon * fan,
      baseLat + perpLat * fan,
      alt,
    ));
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

/** Front zone radius in meters — uses data-driven zoneRadius, defaults to 40km */
export function frontZoneRadius(zoneRadius?: number): number {
  return zoneRadius ?? 40_000;
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
    case 'drone':
    case 'drone_loitering': return 200;
    case 'drone_ucav': return 250;
    case 'drone_recon': return 180;
    case 'drone_fpv': return 120;
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
    case 'drone':
    case 'drone_loitering': return 30_000;
    case 'drone_ucav': return 45_000;
    case 'drone_recon': return 40_000;
    case 'drone_fpv': return 15_000;
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

/** Weapon-type color */
export function weaponColor(weaponType?: string): Color {
  switch (weaponType) {
    case 'ballistic': return Color.fromCssColorString('#ff4466');
    case 'cruise': return Color.fromCssColorString('#44bbff');
    case 'drone':
    case 'drone_loitering': return Color.fromCssColorString('#88ff44');
    case 'drone_ucav': return Color.fromCssColorString('#66dd66');
    case 'drone_recon': return Color.fromCssColorString('#44cc88');
    case 'drone_fpv': return Color.fromCssColorString('#aaff66');
    case 'rocket': return Color.fromCssColorString('#ffaa22');
    case 'mixed': return Color.fromCssColorString('#cc66ff');
    case 'unknown': return Color.fromCssColorString('#888888');
    default: return Color.fromCssColorString('#888888');
  }
}

/** Weapon-type trail material (glow or dash) */
export function weaponTrailMaterial(weaponType?: string, alpha = 0.9): MaterialProperty {
  const color = weaponColor(weaponType).withAlpha(alpha);
  switch (weaponType) {
    case 'drone':
    case 'drone_loitering':
      return new PolylineDashMaterialProperty({ color, dashLength: 8 });
    case 'drone_ucav':
      return new PolylineGlowMaterialProperty({ glowPower: 0.15, color });
    case 'drone_recon':
      return new PolylineDashMaterialProperty({ color, dashLength: 12 });
    case 'drone_fpv':
      return new PolylineDashMaterialProperty({ color, dashLength: 4 });
    case 'unknown':
      return new PolylineDashMaterialProperty({ color, dashLength: 12 });
    case 'ballistic':
      return new PolylineGlowMaterialProperty({ glowPower: 0.5, color });
    case 'cruise':
      return new PolylineGlowMaterialProperty({ glowPower: 0.2, color });
    case 'rocket':
      return new PolylineGlowMaterialProperty({ glowPower: 0.35, color });
    case 'mixed':
      return new PolylineGlowMaterialProperty({ glowPower: 0.3, color });
    default:
      return new PolylineGlowMaterialProperty({ glowPower: 0.25, color });
  }
}

/** Weapon-type trail width */
export function weaponTrailWidth(weaponType?: string): number {
  switch (weaponType) {
    case 'ballistic': return 4.0;
    case 'cruise': return 2.5;
    case 'drone':
    case 'drone_loitering': return 1.5;
    case 'drone_ucav': return 2.0;
    case 'drone_recon': return 1.5;
    case 'drone_fpv': return 1.0;
    case 'rocket': return 2.0;
    case 'mixed': return 3.0;
    case 'unknown': return 1.5;
    default: return 2.0;
  }
}

/** Weapon-type billboard size (lead vs swarm) */
export function weaponBillboardSize(weaponType?: string, isLead = true): { width: number; height: number } {
  switch (weaponType) {
    case 'ballistic': return isLead ? { width: 28, height: 28 } : { width: 22, height: 22 };
    case 'cruise': return isLead ? { width: 24, height: 16 } : { width: 18, height: 12 };
    case 'drone':
    case 'drone_loitering': return isLead ? { width: 18, height: 18 } : { width: 14, height: 14 };
    case 'drone_ucav': return isLead ? { width: 20, height: 20 } : { width: 16, height: 16 };
    case 'drone_recon': return isLead ? { width: 18, height: 18 } : { width: 14, height: 14 };
    case 'drone_fpv': return isLead ? { width: 12, height: 12 } : { width: 10, height: 10 };
    case 'rocket': return isLead ? { width: 20, height: 20 } : { width: 16, height: 16 };
    case 'mixed': return isLead ? { width: 22, height: 22 } : { width: 18, height: 18 };
    case 'unknown': return isLead ? { width: 18, height: 18 } : { width: 14, height: 14 };
    default: return isLead ? { width: 18, height: 18 } : { width: 14, height: 14 };
  }
}

/** Map weapon type to icon type */
export function weaponIconType(weaponType?: string): IconType {
  switch (weaponType) {
    case 'ballistic': return 'weapon_ballistic';
    case 'cruise': return 'weapon_cruise';
    case 'drone':
    case 'drone_loitering': return 'weapon_drone_loitering';
    case 'drone_ucav': return 'weapon_drone_ucav';
    case 'drone_recon': return 'weapon_drone_recon';
    case 'drone_fpv': return 'weapon_drone_fpv';
    case 'rocket': return 'weapon_rocket';
    case 'mixed': return 'weapon_mixed';
    case 'unknown': return 'weapon_unknown';
    default: return 'weapon_unknown';
  }
}

/** Compute initial bearing (radians, clockwise from north) between two Cartesian3 positions */
export function bearingBetween(from: Cartesian3, to: Cartesian3): number {
  const fromCarto = Cartographic.fromCartesian(from);
  const toCarto = Cartographic.fromCartesian(to);
  const lat1 = fromCarto.latitude;
  const lon1 = fromCarto.longitude;
  const lat2 = toCarto.latitude;
  const lon2 = toCarto.longitude;
  const dLon = lon2 - lon1;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return Math.atan2(y, x);
}

/** Precompute bearing (radians, CW from north) for each segment of an arc */
export function precomputeArcBearings(arc: Cartesian3[]): number[] {
  const bearings = new Array<number>(arc.length);
  let last = 0;
  for (let i = 0; i < arc.length - 1; i++) {
    const b = bearingBetween(arc[i], arc[i + 1]);
    if (isNaN(b)) {
      bearings[i] = last;
    } else {
      bearings[i] = b;
      last = b;
    }
  }
  bearings[arc.length - 1] = last;
  return bearings;
}

/** SVG default heading offset — most weapon icons point up (0), cruise points right (π/2) */
export function weaponSvgHeadingOffset(weaponType?: string): number {
  if (weaponType === 'cruise') return Math.PI / 2;
  return 0;
}

// Re-export tier helpers for backward compatibility — canonical source is tier-utils
export { tierClass, tierLabelFull } from '../../../lib/tier-utils';
