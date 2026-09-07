import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateLayerFile, wikidataPlantsToFeatures, cableGeoToFeatures } from './refresh-layers';
import { STATIC_LAYERS, GeoLayerSchema } from '../../src/lib/geo-layer-schema';

const DIR = resolve(__dirname, '../../public/geo/layers');

describe('static geo layers', () => {
  for (const meta of STATIC_LAYERS) {
    it(`${meta.id}.geojson exists, validates and carries provenance`, () => {
      const p = resolve(DIR, `${meta.id}.geojson`);
      expect(existsSync(p), `${p} missing — run npx tsx scripts/geo/refresh-layers.ts`).toBe(true);
      const layer = validateLayerFile(p);
      expect(layer._provenance.id).toBe(meta.id);
      expect(layer.features.length).toBeGreaterThan(0);
      expect(layer._provenance.license.length).toBeGreaterThan(0);
      expect(layer._provenance.retrievedAt <= new Date().toISOString()).toBe(true);
    });
  }
  it('rejects a provenance featureCount that disagrees with the features', () => {
    const bad = { type: 'FeatureCollection', _provenance: { id: 'x', source: 's', url: 'https://a.b', license: 'l', attribution: 'a', retrievedAt: '2026-01-01T00:00:00Z', featureCount: 2 }, features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [1, 2] } }] };
    expect(GeoLayerSchema.safeParse(bad).success).toBe(false);
  });
});

describe('adapters (pure parsing)', () => {
  it('wikidataPlantsToFeatures maps bindings, dedupes QIDs and drops rows without a point', () => {
    const row = (qid: string, coord: string, extra: Record<string, { value: string }> = {}) => ({ plant: { value: `http://www.wikidata.org/entity/${qid}` }, plantLabel: { value: `Plant ${qid}` }, coord: { value: coord }, ...extra });
    const feats = wikidataPlantsToFeatures([
      row('Q1', 'Point(30.1 50.2)', { countryLabel: { value: 'Ukraine' }, capacity: { value: '6000' }, statusLabel: { value: 'operational' }, opened: { value: '1984-12-10T00:00:00Z' } }),
      row('Q1', 'Point(30.1 50.2)'),       // duplicate row from a second OPTIONAL
      row('Q2', 'not a point'),           // no coordinates
      { plant: { value: '' }, coord: { value: 'Point(1 2)' } },
    ]);
    expect(feats).toHaveLength(1);
    expect(feats[0]).toMatchObject({ id: 'Q1', geometry: { type: 'Point', coordinates: [30.1, 50.2] }, properties: { name: 'Plant Q1', country: 'Ukraine', capacityMW: 6000, status: 'operational', opened: '1984-12-10', wikidata: 'https://www.wikidata.org/wiki/Q1' } });
    expect(GeoLayerSchema.safeParse({ type: 'FeatureCollection', _provenance: { id: 'nuclear-plants', source: 's', url: 'https://q.w/', license: 'CC0', attribution: 'a', retrievedAt: '2026-01-01T00:00:00Z', featureCount: 1 }, features: feats }).success).toBe(true);
  });
  it('cableGeoToFeatures keeps line geometries only and rejects a foreign payload', () => {
    const fc = { type: 'FeatureCollection', features: [
      { type: 'Feature', properties: { id: 'c1', name: 'Cable One', color: '#abc', slug: 'cable-one' }, geometry: { type: 'MultiLineString', coordinates: [[[0, 0], [1, 1]]] } },
      { type: 'Feature', properties: { id: 'lp', name: 'Landing point' }, geometry: { type: 'Point', coordinates: [0, 0] } },
      { type: 'Feature', id: 'c2', properties: {}, geometry: { type: 'LineString', coordinates: [[0, 0], [2, 2]] } },
    ] };
    const feats = cableGeoToFeatures(fc);
    expect(feats.map(f => f.id)).toEqual(['c1', 'c2']);
    expect(feats[0].properties).toEqual({ name: 'Cable One', color: '#abc', slug: 'cable-one' });
    expect(feats[1].properties).toEqual({ name: null, color: null, slug: null });
    expect(() => cableGeoToFeatures({ nope: true })).toThrow(/unexpected cable payload/);
  });
});
