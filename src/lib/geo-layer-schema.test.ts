import { describe, it, expect } from 'vitest';
import { GeoLayerSchema, GeoLayerProvenanceSchema, STATIC_LAYERS, staticLayerMeta } from './geo-layer-schema';

const prov = { id: 'x-y', source: 's', url: 'https://a.b/', license: 'CC0', attribution: 'a', retrievedAt: '2026-01-01T00:00:00Z', featureCount: 1 };
const feature = { type: 'Feature', properties: { name: 'n' }, geometry: { type: 'Point', coordinates: [1, 2] } };

describe('GeoLayerSchema', () => {
  it('accepts a well-formed layer and every geometry kind', () => {
    for (const geometry of [
      { type: 'Point', coordinates: [1, 2] },
      { type: 'LineString', coordinates: [[1, 2], [3, 4]] },
      { type: 'MultiLineString', coordinates: [[[1, 2], [3, 4]]] },
      { type: 'Polygon', coordinates: [[[1, 2], [3, 4], [5, 6], [1, 2]]] },
      { type: 'MultiPolygon', coordinates: [[[[1, 2], [3, 4], [5, 6], [1, 2]]]] },
    ]) {
      expect(GeoLayerSchema.safeParse({ type: 'FeatureCollection', _provenance: prov, features: [{ ...feature, geometry }] }).success).toBe(true);
    }
  });
  it('rejects a bad provenance: id charset, url, empty license, retrievedAt format', () => {
    expect(GeoLayerProvenanceSchema.safeParse({ ...prov, id: 'Bad_Id' }).success).toBe(false);
    expect(GeoLayerProvenanceSchema.safeParse({ ...prov, url: 'not a url' }).success).toBe(false);
    expect(GeoLayerProvenanceSchema.safeParse({ ...prov, license: '' }).success).toBe(false);
    expect(GeoLayerProvenanceSchema.safeParse({ ...prov, retrievedAt: '2026-01-01' }).success).toBe(false);
  });
  it('rejects a featureCount that disagrees and an unknown geometry type', () => {
    expect(GeoLayerSchema.safeParse({ type: 'FeatureCollection', _provenance: { ...prov, featureCount: 2 }, features: [feature] }).success).toBe(false);
    expect(GeoLayerSchema.safeParse({ type: 'FeatureCollection', _provenance: prov, features: [{ ...feature, geometry: { type: 'Circle', coordinates: [1, 2] } }] }).success).toBe(false);
  });
});

describe('STATIC_LAYERS', () => {
  it('ids are unique, labels are i18n keys and staticLayerMeta resolves them', () => {
    const ids = STATIC_LAYERS.map(l => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const l of STATIC_LAYERS) {
      expect(l.label.startsWith('layers.')).toBe(true);
      expect(staticLayerMeta(l.id)).toBe(l);
    }
    expect(staticLayerMeta('nope')).toBeUndefined();
  });
});
