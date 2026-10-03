import { describe, it, expect } from 'vitest';
import { GeoLayerSchema, GeoLayerProvenanceSchema, STATIC_LAYERS, staticLayerMeta, emptyScopeReason, partialEmptyScope, countryListLabel } from './geo-layer-schema';

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
  it('accepts an optional per-country provenance map and keeps it through parse (not stripped)', () => {
    const countries = {
      IR: { retrievedAt: '2026-01-01T00:00:00Z', count: 12, status: 'fresh' },
      IQ: { retrievedAt: null, count: 0, status: 'stale' },
    };
    const parsed = GeoLayerSchema.parse({ type: 'FeatureCollection', _provenance: { ...prov, countries }, features: [feature] });
    expect(parsed._provenance.countries).toEqual(countries);
  });
  it('rejects an unknown country status and an unknown key inside a country entry', () => {
    expect(GeoLayerSchema.safeParse({ type: 'FeatureCollection', _provenance: { ...prov, countries: { IR: { retrievedAt: null, count: 0, status: 'unknown' } } }, features: [feature] }).success).toBe(false);
    expect(GeoLayerSchema.safeParse({ type: 'FeatureCollection', _provenance: { ...prov, countries: { IR: { retrievedAt: null, count: 0, status: 'stale', extra: true } } }, features: [feature] }).success).toBe(false);
  });
  it('layers without countries still validate (existing committed files predate the field)', () => {
    expect(GeoLayerSchema.safeParse({ type: 'FeatureCollection', _provenance: prov, features: [feature] }).success).toBe(true);
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
  it('only radio-towers declares an empty-state text', () => {
    expect(STATIC_LAYERS.filter(l => l.emptyStateKey).map(l => [l.id, l.emptyStateKey])).toEqual([['radio-towers', 'layers.radioTowersNone']]);
  });
});

describe('emptyScopeReason', () => {
  const towers = staticLayerMeta('radio-towers');
  const layer = (countries: Record<string, { count: number; status: 'fresh' | 'stale' }>, features: Array<{ cc: string }> = []) => GeoLayerSchema.parse({
    type: 'FeatureCollection',
    _provenance: { ...prov, id: 'radio-towers', featureCount: features.length, countries: Object.fromEntries(Object.entries(countries).map(([cc, c]) => [cc, { ...c, retrievedAt: '2026-09-24T00:00:00Z' }])) },
    features: features.map(f => ({ ...feature, properties: { countryCode: f.cc } })),
  });

  it('names the codes when every tracker country is fresh with 0 towers', () => {
    expect(emptyScopeReason(layer({ IL: { count: 0, status: 'fresh' }, PS: { count: 0, status: 'fresh' }, UA: { count: 1, status: 'fresh' } }, [{ cc: 'UA' }]), ['PS', 'IL'], towers)).toEqual(['IL', 'PS']);
  });
  it('is null when any tracker country has features', () => {
    expect(emptyScopeReason(layer({ ML: { count: 1, status: 'fresh' }, BF: { count: 0, status: 'fresh' } }, [{ cc: 'ML' }]), ['ML', 'BF'], towers)).toBeNull();
  });
  it('is null when a zero country is stale (old data is not "none mapped")', () => {
    expect(emptyScopeReason(layer({ YE: { count: 0, status: 'stale' } }), ['YE'], towers)).toBeNull();
  });
  it('is null when a code has no provenance entry, for unscoped layers, and before data loads', () => {
    expect(emptyScopeReason(layer({}), ['YE'], towers)).toBeNull();
    expect(emptyScopeReason(layer({ YE: { count: 0, status: 'fresh' } }), ['YE'], staticLayerMeta('nuclear-plants'))).toBeNull();
    expect(emptyScopeReason(null, ['YE'], towers)).toBeNull();
    expect(emptyScopeReason(layer({}), [], towers)).toBeNull();
  });
  it('is null for a country-scoped layer without emptyStateKey (radio-stations)', () => {
    expect(emptyScopeReason(layer({ YE: { count: 0, status: 'fresh' } }), ['YE'], staticLayerMeta('radio-stations'))).toBeNull();
  });

  describe('partialEmptyScope (owner Q8: hint when only some countries are empty)', () => {
    it('names the fresh-zero codes when others have towers (sahel: ML has towers, BF/NE none)', () => {
      expect(partialEmptyScope(layer({ ML: { count: 1, status: 'fresh' }, NE: { count: 0, status: 'fresh' }, BF: { count: 0, status: 'fresh' } }, [{ cc: 'ML' }]), ['ML', 'NE', 'BF'], towers)).toEqual(['BF', 'NE']);
    });
    it('is null when every country is empty (that is emptyScopeReason) or none is', () => {
      expect(partialEmptyScope(layer({ IL: { count: 0, status: 'fresh' }, PS: { count: 0, status: 'fresh' } }), ['IL', 'PS'], towers)).toBeNull();
      expect(partialEmptyScope(layer({ ML: { count: 1, status: 'fresh' } }, [{ cc: 'ML' }]), ['ML'], towers)).toBeNull();
    });
    it('skips stale and missing zeros, and needs emptyStateKey and loaded data', () => {
      expect(partialEmptyScope(layer({ ML: { count: 1, status: 'fresh' }, BF: { count: 0, status: 'stale' } }, [{ cc: 'ML' }]), ['ML', 'BF', 'NE'], towers)).toBeNull();
      expect(partialEmptyScope(layer({ ML: { count: 1, status: 'fresh' }, BF: { count: 0, status: 'fresh' } }, [{ cc: 'ML' }]), ['ML', 'BF'], staticLayerMeta('radio-stations'))).toBeNull();
      expect(partialEmptyScope(null, ['ML', 'BF'], towers)).toBeNull();
    });
    it('does not name a country whose features are drawn even if its provenance says 0', () => {
      expect(partialEmptyScope(layer({ ML: { count: 1, status: 'fresh' }, BF: { count: 0, status: 'fresh' } }, [{ cc: 'ML' }, { cc: 'BF' }]), ['ML', 'BF'], towers)).toBeNull();
    });
  });
});

describe('countryListLabel', () => {
  it('uses localized country names, not ISO codes', () => {
    expect(countryListLabel(['IL', 'PS'], 'en')).toBe('Israel, Palestinian Territories');
    expect(countryListLabel(['YE'], 'es')).toBe('Yemen');
    expect(countryListLabel(['XX'], 'en')).toBe('XX');
  });
});
