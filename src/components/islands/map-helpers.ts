import { MAP_CATEGORIES, type MapCategory } from '../../lib/map-utils';

// Re-export tier helpers for backward compatibility — canonical source is tier-utils
export { tierClass, tierLabelFull } from '../../lib/tier-utils';

// Look up category color — uses tracker-specific categories if provided, falls back to hardcoded defaults
let _trackerCategories: MapCategory[] | null = null;

export function setTrackerCategories(cats: MapCategory[]) {
  _trackerCategories = cats;
}

export function catColor(cat: string): string {
  const cats = _trackerCategories ?? MAP_CATEGORIES;
  return cats.find(c => c.id === cat)?.color || '#888';
}

export function lineColor(cat: string, categories?: MapCategory[]): string {
  if (categories) {
    const found = categories.find(c => c.id === cat);
    if (found) return found.color;
  }
  if (cat === 'strike') return '#e74c3c';
  if (cat === 'retaliation') return '#f39c12';
  if (cat === 'front') return '#9b59b6';
  return '#3498db';
}

// ── OSINT weapon-type helpers ──

export const WEAPON_TYPE_WEIGHTS: Record<string, number> = {
  ballistic: 2.5,
  cruise: 2.0,
  drone: 1.5,
  rocket: 2.2,
  mixed: 2.0,
  unknown: 1.5,
};

export const WEAPON_TYPE_LABELS: Record<string, string> = {
  ballistic: 'BALLISTIC',
  cruise: 'CRUISE',
  drone: 'DRONE/UAV',
  rocket: 'ROCKET',
  mixed: 'MIXED',
  unknown: 'UNKNOWN',
};

export const STATUS_LABELS: Record<string, string> = {
  hit: 'HIT',
  intercepted: 'INTERCEPTED',
  partial: 'PARTIAL',
  unknown: 'UNCONFIRMED',
};

// ── Shared arc geometry ──

const DEFAULT_ARC_SEGMENTS = 40;
const ARC_AMPLITUDE_FACTOR = 0.18;

/**
 * Compute a sine-curve arc path between two [lat, lng] points.
 * Used by both LeafletMap (static polylines) and MapArcAnimator (animated projectiles).
 */
export function computeArcPositions(
  from: [number, number],
  to: [number, number],
  segments = DEFAULT_ARC_SEGMENTS,
): [number, number][] {
  const positions: [number, number][] = [];
  const dlat = to[0] - from[0];
  const dlng = to[1] - from[1];
  const dist = Math.sqrt(dlat * dlat + dlng * dlng);
  if (dist === 0) return [from, to];
  const amplitude = dist * ARC_AMPLITUDE_FACTOR;

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const lat = from[0] + dlat * t;
    const lng = from[1] + dlng * t;
    const offset = Math.sin(t * Math.PI) * amplitude;
    const nx = -dlng / dist;
    const ny = dlat / dist;
    positions.push([lat + nx * offset, lng + ny * offset]);
  }
  return positions;
}

/**
 * Interpolate a position along an arc path at parameter t (0..1).
 * Used by MapArcAnimator for smooth projectile animation.
 */
export function interpolateArcPosition(
  path: [number, number][],
  t: number,
): [number, number] {
  const idx = t * (path.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.min(lower + 1, path.length - 1);
  const frac = idx - lower;
  return [
    path[lower][0] + (path[upper][0] - path[lower][0]) * frac,
    path[lower][1] + (path[upper][1] - path[lower][1]) * frac,
  ];
}
