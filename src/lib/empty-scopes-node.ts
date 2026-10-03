// Build time only: uses node:fs. Never import from an island.
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { GeoLayerSchema, emptyScopeReason, staticLayerMeta, type GeoLayer } from './geo-layer-schema';

// One parse per layer per build, not one per tracker page (22 trackers carry radio-towers).
const cache = new Map<string, GeoLayer | null>();

const readCommitted = (id: string): GeoLayer | null => {
  if (cache.has(id)) return cache.get(id)!;
  let layer: GeoLayer | null = null;
  const p = resolve('public/geo/layers', `${id}.geojson`);
  if (existsSync(p)) {
    try {
      const r = GeoLayerSchema.safeParse(JSON.parse(readFileSync(p, 'utf8')));
      layer = r.success ? r.data : null;
    } catch {
      layer = null;
    }
  }
  cache.set(id, layer);
  return layer;
};

/** Build-time copy of the runtime empty-state rule, so a toggle says "none tagged" before its layer is fetched. */
export function computeEmptyScopes(staticLayers: string[] | undefined, codes: string[] | undefined, readLayer: (id: string) => GeoLayer | null = readCommitted): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const id of staticLayers ?? []) {
    const meta = staticLayerMeta(id);
    if (!meta?.emptyStateKey) continue; // don't read files for layers that can't be "empty"
    const reason = emptyScopeReason(readLayer(id), codes, meta);
    if (reason) out[id] = reason;
  }
  return out;
}
