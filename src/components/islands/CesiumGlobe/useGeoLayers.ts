/**
 * useGeoLayers.ts — Cesium renderers for the E5 layers:
 *  - useFrontline: DeepStateMAP polygons (feed, 30 min TTL, behind
 *    PUBLIC_ENABLE_DEEPSTATE until permission is recorded).
 *  - useGdacs: GDACS Orange/Red alert pins from /_hourly/gdacs.json.
 *  - useStaticGeoLayer: a provenance-stamped GeoJSON from public/geo/layers.
 *
 * All three go through live-source.ts (status, stale-on-error) and clear
 * their entities when disabled. They never throw into React: a bad payload
 * surfaces as status 'error' on the toggle.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Cartesian2, Cartesian3, Color, PolygonHierarchy, VerticalOrigin, HorizontalOrigin, LabelStyle, NearFarScalar,
  DistanceDisplayCondition, type Viewer as CesiumViewer, type Entity,
} from 'cesium';
import { useLiveSource } from '../../../lib/use-live-source';
import type { LiveStatus } from '../../../lib/live-source';
import { DEEPSTATE_URL, parseDeepStateResponse, type Frontline } from '../../../lib/deepstate';
import type { GdacsFile } from '../../../../scripts/lib/gdacs';
import { GeoLayerSchema, staticLayerMeta, type GeoLayer } from '../../../lib/geo-layer-schema';
import { getLiveLayer } from '../../../lib/live-layers';

function basePath(): string {
  const raw = (import.meta as any).env?.BASE_URL ?? '/';
  return raw.endsWith('/') ? raw : `${raw}/`;
}

export const DEEPSTATE_ENABLED = String((import.meta as any).env?.PUBLIC_ENABLE_DEEPSTATE ?? '') === 'true';

interface LayerResult { count: number; status: LiveStatus; updatedAt: number | null; error?: string; label?: string }

function useEntityCleanup(viewer: CesiumViewer | null, ref: React.MutableRefObject<Entity[]>) {
  useEffect(() => () => {
    if (viewer && !viewer.isDestroyed()) ref.current.forEach(e => { try { viewer.entities.remove(e); } catch { /* ok */ } });
    ref.current = [];
  }, [viewer, ref]);
}

export function useFrontline(viewer: CesiumViewer | null, enabled: boolean): LayerResult {
  const entitiesRef = useRef<Entity[]>([]);
  const [count, setCount] = useState(0);
  const spec = useMemo(() => ({
    key: 'deepstate:frontline',
    url: DEEPSTATE_URL,
    ttlMs: getLiveLayer('deepstate-frontline')?.kind === 'feed' ? (getLiveLayer('deepstate-frontline') as any).ttlMs : 30 * 60_000,
    parse: parseDeepStateResponse,
    isEmpty: (f: Frontline) => f.polygons.length === 0,
  }), []);
  const active = enabled && DEEPSTATE_ENABLED;
  const { data, status, updatedAt, error } = useLiveSource<Frontline>(spec, { enabled: active && !!viewer });

  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;
    const clear = () => { entitiesRef.current.forEach(e => { try { viewer.entities.remove(e); } catch { /* ok */ } }); entitiesRef.current = []; };
    if (!active || !data) { clear(); setCount(0); return; }
    clear();
    for (const p of data.polygons) {
      const outer = p.rings[0];
      if (!outer || outer.length < 3) continue;
      const holes = p.rings.slice(1).map(r => new PolygonHierarchy(Cartesian3.fromDegreesArray(r.flat())));
      entitiesRef.current.push(viewer.entities.add({
        name: `${p.label} (DeepStateMAP ${data.datetime})`,
        polygon: {
          hierarchy: new PolygonHierarchy(Cartesian3.fromDegreesArray(outer.flat()), holes),
          material: Color.fromCssColorString(p.fill).withAlpha(Math.min(0.5, p.fillOpacity + 0.1)),
          outline: true,
          outlineColor: Color.fromCssColorString(p.stroke).withAlpha(0.9),
          height: 0,
        },
      }));
    }
    setCount(data.polygons.length);
    return clear;
  }, [viewer, active, data]);
  useEntityCleanup(viewer, entitiesRef);

  return { count, status: active ? status : 'disabled', updatedAt, error, label: data?.datetime };
}

const GDACS_COLORS: Record<string, string> = { Red: '#ff1744', Orange: '#ff9100' };
const GDACS_GLYPH: Record<string, string> = { EQ: '◉', TC: '๑', FL: '≋', VO: '▲', WF: '✦', DR: '☼', TS: '≈', OTHER: '●' };

export function useGdacs(viewer: CesiumViewer | null, enabled: boolean): LayerResult {
  const entitiesRef = useRef<Entity[]>([]);
  const [count, setCount] = useState(0);
  const spec = useMemo(() => ({
    key: 'gdacs:file',
    url: `${basePath()}_hourly/gdacs.json`,
    ttlMs: 15 * 60_000,
    parse: async (res: Response): Promise<GdacsFile> => {
      const j = (await res.json()) as GdacsFile;
      if (j?.version !== 1 || !Array.isArray(j.alerts)) throw new Error('gdacs.json: unexpected shape');
      return j;
    },
    isEmpty: () => false, // a quiet week is data
  }), []);
  const { data, status, updatedAt, error } = useLiveSource<GdacsFile>(spec, { enabled: enabled && !!viewer });

  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;
    const clear = () => { entitiesRef.current.forEach(e => { try { viewer.entities.remove(e); } catch { /* ok */ } }); entitiesRef.current = []; };
    if (!enabled || !data) { clear(); setCount(0); return; }
    clear();
    for (const a of data.alerts) {
      const color = Color.fromCssColorString(GDACS_COLORS[a.level] ?? '#ffffff');
      entitiesRef.current.push(viewer.entities.add({
        name: `GDACS ${a.level} ${a.eventType}: ${a.title}`,
        description: `${a.severity ?? ''}${a.population ? ` · ${a.population}` : ''}\n${a.url}`,
        position: Cartesian3.fromDegrees(a.lon, a.lat, 0),
        point: { pixelSize: a.level === 'Red' ? 12 : 9, color: color.withAlpha(0.9), outlineColor: Color.BLACK, outlineWidth: 1.5 },
        label: {
          text: `${GDACS_GLYPH[a.eventType] ?? '●'} ${a.eventType}${a.severityValue != null && a.severityUnit ? ` ${a.severityValue}${a.severityUnit}` : ''}`,
          font: "10px 'JetBrains Mono', monospace",
          fillColor: color, outlineColor: Color.BLACK, outlineWidth: 2, style: LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: VerticalOrigin.BOTTOM, horizontalOrigin: HorizontalOrigin.CENTER, pixelOffset: new Cartesian2(0, -12),
          scaleByDistance: new NearFarScalar(1e5, 1.0, 1e7, 0.5), distanceDisplayCondition: new DistanceDisplayCondition(0, 2.5e7),
        },
      }));
    }
    setCount(data.alerts.length);
    return clear;
  }, [viewer, enabled, data]);
  useEntityCleanup(viewer, entitiesRef);

  return { count, status: enabled ? status : 'disabled', updatedAt, error, label: data?.generated?.slice(0, 10) };
}

/** Points as billboards-free dots, lines as polylines; polygons as fills. */
export function useStaticGeoLayer(viewer: CesiumViewer | null, id: string | null, enabled: boolean): LayerResult {
  const entitiesRef = useRef<Entity[]>([]);
  const [count, setCount] = useState(0);
  const meta = id ? staticLayerMeta(id) : undefined;
  const spec = useMemo(() => (id ? {
    key: `static-geo:${id}`,
    url: `${basePath()}geo/layers/${id}.geojson`,
    ttlMs: 24 * 60 * 60_000,
    parse: async (res: Response): Promise<GeoLayer> => GeoLayerSchema.parse(await res.json()),
    isEmpty: (l: GeoLayer) => l.features.length === 0,
  } : null), [id]);
  const { data, status, updatedAt, error } = useLiveSource<GeoLayer>(spec, { enabled: enabled && !!viewer && !!id });

  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;
    const clear = () => { entitiesRef.current.forEach(e => { try { viewer.entities.remove(e); } catch { /* ok */ } }); entitiesRef.current = []; };
    if (!enabled || !data) { clear(); setCount(0); return; }
    clear();
    const color = Color.fromCssColorString(meta?.color ?? '#ffffff');
    for (const f of data.features) {
      const g = f.geometry;
      const name = String((f.properties as any)?.name ?? id);
      if (g.type === 'Point') {
        const [lon, lat] = g.coordinates as number[];
        entitiesRef.current.push(viewer.entities.add({
          name, description: JSON.stringify(f.properties),
          position: Cartesian3.fromDegrees(lon, lat, 0),
          point: { pixelSize: 6, color: color.withAlpha(0.85), outlineColor: Color.BLACK, outlineWidth: 1 },
          label: { text: name, font: "9px 'JetBrains Mono', monospace", fillColor: color, outlineColor: Color.BLACK, outlineWidth: 2, style: LabelStyle.FILL_AND_OUTLINE, verticalOrigin: VerticalOrigin.BOTTOM, pixelOffset: new Cartesian2(0, -8), distanceDisplayCondition: new DistanceDisplayCondition(0, 3e6) },
        }));
      } else if (g.type === 'LineString' || g.type === 'MultiLineString') {
        const lines = g.type === 'LineString' ? [g.coordinates as number[][]] : (g.coordinates as number[][][]);
        for (const line of lines) {
          if (line.length < 2) continue;
          entitiesRef.current.push(viewer.entities.add({
            name, polyline: { positions: Cartesian3.fromDegreesArray(line.flatMap(p => [p[0], p[1]])), width: 1.2, material: color.withAlpha(0.6), clampToGround: false },
          }));
        }
      } else if (g.type === 'Polygon' || g.type === 'MultiPolygon') {
        const polys = g.type === 'Polygon' ? [g.coordinates as number[][][]] : (g.coordinates as number[][][][]);
        for (const rings of polys) {
          if (!rings[0] || rings[0].length < 3) continue;
          entitiesRef.current.push(viewer.entities.add({
            name, polygon: { hierarchy: new PolygonHierarchy(Cartesian3.fromDegreesArray(rings[0].flatMap(p => [p[0], p[1]]))), material: color.withAlpha(0.25), outline: true, outlineColor: color },
          }));
        }
      }
    }
    setCount(data.features.length);
    return clear;
  }, [viewer, enabled, data, meta?.color, id]);
  useEntityCleanup(viewer, entitiesRef);

  return { count, status: enabled && id ? status : 'disabled', updatedAt, error, label: data?._provenance.retrievedAt.slice(0, 10) };
}
