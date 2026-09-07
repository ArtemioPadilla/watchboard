/**
 * useGeoLayersData.ts — data-only hooks for the E5 layers used by the 2D
 * map (the globe renders through CesiumGlobe/useGeoLayers.ts). Same
 * cache keys, so a page with both surfaces fetches once.
 */
import { useMemo } from 'react';
import { useLiveSource } from '../../lib/use-live-source';
import { DEEPSTATE_URL, parseDeepStateResponse, type Frontline } from '../../lib/deepstate';
import type { GdacsFile } from '../../../scripts/lib/gdacs';
import { GeoLayerSchema, type GeoLayer } from '../../lib/geo-layer-schema';

function basePath(): string {
  const raw = (import.meta as any).env?.BASE_URL ?? '/';
  return raw.endsWith('/') ? raw : `${raw}/`;
}

export const DEEPSTATE_ENABLED = String((import.meta as any).env?.PUBLIC_ENABLE_DEEPSTATE ?? '') === 'true';

export function useFrontlineData(enabled: boolean) {
  const spec = useMemo(() => ({ key: 'deepstate:frontline', url: DEEPSTATE_URL, ttlMs: 30 * 60_000, parse: parseDeepStateResponse, isEmpty: (f: Frontline) => f.polygons.length === 0 }), []);
  return useLiveSource<Frontline>(spec, { enabled: enabled && DEEPSTATE_ENABLED });
}

export function useGdacsData(enabled: boolean) {
  const spec = useMemo(() => ({
    key: 'gdacs:file', url: `${basePath()}_hourly/gdacs.json`, ttlMs: 15 * 60_000,
    parse: async (res: Response): Promise<GdacsFile> => { const j = (await res.json()) as GdacsFile; if (j?.version !== 1 || !Array.isArray(j.alerts)) throw new Error('gdacs.json: unexpected shape'); return j; },
    isEmpty: () => false,
  }), []);
  return useLiveSource<GdacsFile>(spec, { enabled });
}

export function useStaticGeoLayerData(id: string | null, enabled: boolean) {
  const spec = useMemo(() => (id ? {
    key: `static-geo:${id}`, url: `${basePath()}geo/layers/${id}.geojson`, ttlMs: 24 * 60 * 60_000,
    parse: async (res: Response): Promise<GeoLayer> => GeoLayerSchema.parse(await res.json()),
    isEmpty: (l: GeoLayer) => l.features.length === 0,
  } : null), [id]);
  return useLiveSource<GeoLayer>(spec, { enabled: enabled && !!id });
}
