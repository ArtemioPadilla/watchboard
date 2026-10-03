import { describe, it, expect } from 'vitest';
import { computeEmptyScopes } from './empty-scopes-node';
import { GeoLayerSchema } from './geo-layer-schema';

const towers = (countries: Record<string, number>) => GeoLayerSchema.parse({
  type: 'FeatureCollection',
  _provenance: { id: 'radio-towers', source: 'OpenStreetMap', url: 'https://overpass-api.de/', license: 'ODbL-1.0', attribution: '© OpenStreetMap contributors', retrievedAt: '2026-09-24T00:00:00Z', featureCount: 0,
    countries: Object.fromEntries(Object.entries(countries).map(([cc, n]) => [cc, { count: n, status: 'fresh', retrievedAt: '2026-09-24T00:00:00Z' }])) },
  features: [],
});

describe('computeEmptyScopes', () => {
  it('marks radio-towers when every tracker country is a fresh zero', () => {
    expect(computeEmptyScopes(['radio-towers', 'radio-stations'], ['IL', 'PS'], id => (id === 'radio-towers' ? towers({ IL: 0, PS: 0 }) : null))).toEqual({ 'radio-towers': ['IL', 'PS'] });
  });
  it('is empty when the file is missing or a country has towers', () => {
    expect(computeEmptyScopes(['radio-towers'], ['IL'], () => null)).toEqual({});
    expect(computeEmptyScopes(['radio-towers'], ['ML', 'BF'], () => towers({ ML: 74, BF: 0 }))).toEqual({});
  });
});
