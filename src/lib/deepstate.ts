/**
 * deepstate.ts — parser for the DeepStateMAP frontline export
 * (https://deepstatemap.live/api/history/last), plan E5.H1.
 *
 * The endpoint returns `{ id, datetime, map: FeatureCollection }` with
 * ~500 features: ~120 polygons (occupied / liberated / unknown status /
 * other territories) and ~400 points (unit positions, "direction of
 * attack" arrows). Only the polygons are the frontline; points are
 * dropped here. Names are trilingual ("Окуповано /// Occupied ///
 * geoJSON.status.occupied") and the status is read from the English
 * segment. Validated with Zod and size-capped so a changed upstream
 * cannot inject an arbitrary payload into the map.
 *
 * License: DeepState publishes no terms for the API; the layer ships
 * behind PUBLIC_ENABLE_DEEPSTATE until written permission is recorded in
 * docs/licenses/deepstate.md.
 */
import { z } from 'zod';

export const DEEPSTATE_URL = 'https://deepstatemap.live/api/history/last';
export const DEEPSTATE_MAX_BYTES = 2 * 1024 * 1024;
export const DEEPSTATE_MAX_FEATURES = 1000;

export type FrontlineStatus = 'occupied' | 'liberated' | 'unknown' | 'other';

export interface FrontlinePolygon {
  id: string;
  status: FrontlineStatus;
  label: string;
  fill: string;
  fillOpacity: number;
  stroke: string;
  /** [lon, lat] rings. */
  rings: [number, number][][];
}

export interface Frontline {
  id: string;
  /** DeepState's "DD.MM o HH:mm" string, kept verbatim. */
  datetime: string;
  polygons: FrontlinePolygon[];
  counts: Record<FrontlineStatus, number>;
}

const Pos = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]).rest(z.number());
const Ring = z.array(Pos).min(4);
const FeatureSchema = z.object({
  type: z.literal('Feature'),
  properties: z.object({
    name: z.string().default(''),
    fill: z.string().optional(),
    'fill-opacity': z.number().optional(),
    stroke: z.string().optional(),
  }).passthrough(),
  geometry: z.union([
    z.object({ type: z.literal('Polygon'), coordinates: z.array(Ring).min(1) }),
    z.object({ type: z.literal('MultiPolygon'), coordinates: z.array(z.array(Ring).min(1)).min(1) }),
    // Non-area geometries are accepted (and dropped later); Polygon and
    // MultiPolygon must satisfy the ring schema above.
    z.object({ type: z.enum(['Point', 'MultiPoint', 'LineString', 'MultiLineString', 'GeometryCollection']), coordinates: z.any() }),
  ]),
});
export const DeepStateResponseSchema = z.object({
  id: z.union([z.number(), z.string()]),
  datetime: z.string(),
  map: z.object({ type: z.literal('FeatureCollection'), features: z.array(FeatureSchema).max(DEEPSTATE_MAX_FEATURES) }),
});

const HEX = /^#[0-9a-fA-F]{6}$/;
const DEFAULT_COLORS: Record<FrontlineStatus, string> = { occupied: '#c62828', liberated: '#2e7d32', unknown: '#bcaaa4', other: '#757575' };

export function classifyName(name: string): { status: FrontlineStatus; label: string } {
  const parts = name.split('///').map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const english = parts[1] ?? parts[0] ?? '';
  const l = english.toLowerCase();
  if (l.startsWith('occupied')) return { status: 'occupied', label: english };
  if (l.startsWith('liberated')) return { status: 'liberated', label: english };
  if (l.startsWith('unknown')) return { status: 'unknown', label: english };
  return { status: 'other', label: english || 'Territory' };
}

/** Throws on a payload that does not look like DeepState's export. */
export function parseDeepState(payload: unknown): Frontline {
  const res = DeepStateResponseSchema.parse(payload);
  const polygons: FrontlinePolygon[] = [];
  const counts: Record<FrontlineStatus, number> = { occupied: 0, liberated: 0, unknown: 0, other: 0 };
  res.map.features.forEach((f, i) => {
    const g = f.geometry as { type: string; coordinates: unknown };
    let rings: [number, number][][] = [];
    if (g.type === 'Polygon') rings = (g.coordinates as number[][][]).map(r => r.map(p => [p[0], p[1]] as [number, number]));
    else if (g.type === 'MultiPolygon') rings = (g.coordinates as number[][][][]).flat().map(r => r.map(p => [p[0], p[1]] as [number, number]));
    else return; // points and lines are not frontline
    const { status, label } = classifyName(f.properties.name);
    counts[status] += 1;
    polygons.push({
      id: `ds-${res.id}-${i}`,
      status,
      label,
      fill: f.properties.fill && HEX.test(f.properties.fill) ? f.properties.fill : DEFAULT_COLORS[status],
      fillOpacity: typeof f.properties['fill-opacity'] === 'number' ? Math.min(1, Math.max(0, f.properties['fill-opacity'])) : 0.35,
      stroke: f.properties.stroke && HEX.test(f.properties.stroke) ? f.properties.stroke : DEFAULT_COLORS[status],
      rings,
    });
  });
  return { id: String(res.id), datetime: res.datetime, polygons, counts };
}

/** Reads the response with a byte cap before parsing. */
export async function parseDeepStateResponse(res: Response): Promise<Frontline> {
  const len = Number(res.headers.get('content-length') ?? 0);
  if (len > DEEPSTATE_MAX_BYTES) throw new Error(`DeepState payload too large (${len} bytes)`);
  const text = await res.text();
  if (text.length > DEEPSTATE_MAX_BYTES) throw new Error(`DeepState payload too large (${text.length} chars)`);
  return parseDeepState(JSON.parse(text));
}
