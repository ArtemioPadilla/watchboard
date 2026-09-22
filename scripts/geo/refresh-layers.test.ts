import { describe, it, expect, afterEach, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateLayerFile, wikidataPlantsToFeatures, cableGeoToFeatures, overpassTowersToFeatures, radioBrowserToFeatures, capTowersPerCountry, fetchOverpassCountryTowers } from './refresh-layers';
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
  it('overpassTowersToFeatures maps nodes with communication:radio, drops nodes without lat/lon, dedupes ids', () => {
    const node = (id: number, lat: number, lon: number, tags: Record<string, string>) => ({ type: 'node', id, lat, lon, tags });
    const feats = overpassTowersToFeatures([
      node(1, 47.2, 27.9, { name: 'Cetireni', height: '235', 'communication:radio': 'fm' }),
      node(1, 47.2, 27.9, { name: 'Cetireni', height: '235', 'communication:radio': 'fm' }), // duplicate id
      node(2, 50.1, 30.5, { 'communication:radio': 'am;shortwave' }), // no name
      { type: 'way', id: 3, tags: { 'communication:radio': 'fm' } }, // no lat/lon, wrong type
      { type: 'node', id: 4, tags: { 'communication:radio': 'fm' } }, // node type, but missing lat/lon
    ]);
    expect(feats).toHaveLength(2);
    expect(feats[0]).toMatchObject({
      id: '1',
      properties: { osmId: '1', name: 'Cetireni', heightM: 235, radioBand: 'fm' },
      geometry: { type: 'Point', coordinates: [27.9, 47.2] },
    });
    expect(feats[1].properties).toMatchObject({ osmId: '2', name: null, heightM: null, radioBand: 'am;shortwave' });
  });

  it('overpassTowersToFeatures tags features with the supplied country code, defaulting to null', () => {
    const node = (id: number, lat: number, lon: number) => ({ type: 'node', id, lat, lon, tags: { 'communication:radio': 'fm' } });
    const tagged = overpassTowersToFeatures([node(1, 35.7, 51.4)], 'IR');
    expect(tagged[0].properties).toMatchObject({ countryCode: 'IR' });
    const untagged = overpassTowersToFeatures([node(2, 35.7, 51.4)]);
    expect(untagged[0].properties).toMatchObject({ countryCode: null });
  });

  it('capTowersPerCountry keeps named-first then tallest per country, never mixing countries, cap applied per country', () => {
    const tower = (id: string, cc: string, name: string | null, heightM: number | null) => ({
      type: 'Feature' as const,
      id,
      properties: { osmId: id, name, heightM, radioBand: 'fm', countryCode: cc },
      geometry: { type: 'Point' as const, coordinates: [0, 0] },
    });
    const features = [
      tower('10', 'IR', null, 50),
      tower('2', 'IR', 'Named A', 100),
      tower('3', 'IR', 'Named B', 200),
      tower('20', 'UA', null, 300),
      tower('21', 'UA', 'Named C', 10),
    ];
    const result = capTowersPerCountry(features, 2);
    expect(result.map((f) => f.id)).toEqual(['3', '2', '21', '20']);
    expect(result.slice(0, 2).every((f) => (f.properties as any).countryCode === 'IR')).toBe(true);
    expect(result.slice(2, 4).every((f) => (f.properties as any).countryCode === 'UA')).toBe(true);
  });

  it('capTowersPerCountry breaks ties by osmId ascending', () => {
    const tower = (id: string) => ({
      type: 'Feature' as const,
      id,
      properties: { osmId: id, name: 'Same', heightM: 100, radioBand: 'fm', countryCode: 'IR' },
      geometry: { type: 'Point' as const, coordinates: [0, 0] },
    });
    const result = capTowersPerCountry([tower('5'), tower('2'), tower('9')], 2);
    expect(result.map((f) => f.id)).toEqual(['2', '5']);
  });

  it('radioBrowserToFeatures keeps HTTPS MP3/AAC stations with geo coordinates, drops the rest, dedupes by uuid', () => {
    const row = (uuid: string, overrides: Record<string, unknown> = {}) => ({
      stationuuid: uuid, name: `Station ${uuid}`, url_resolved: `https://stream.example/${uuid}`,
      countrycode: 'UA', country: 'Ukraine', language: 'ukrainian', votes: 10, codec: 'MP3',
      lastcheckok: 1, geo_lat: 50.1, geo_long: 30.5,
      ...overrides,
    });
    const feats = radioBrowserToFeatures([
      row('a'),
      row('a'), // duplicate uuid
      row('b', { url_resolved: 'http://stream.example/b' }), // not https
      row('c', { geo_lat: null, geo_long: null }), // no geo
      row('d', { codec: 'OGG' }), // unsupported codec
      row('e', { lastcheckok: 0 }), // marked broken
      row('f', { name: '101.5 Kiss FM' }),
    ]);
    expect(feats.map(f => f.id)).toEqual(['a', 'f']);
    expect(feats[0].properties).toMatchObject({ stationUuid: 'a', streamUrl: 'https://stream.example/a', codec: 'MP3', votes: 10, freqLabel: null });
    expect(feats[1].properties).toMatchObject({ freqLabel: '101.5 FM' });
  });

  describe('fetchOverpassCountryTowers', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    const jsonRes = (body: any, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

    it('treats an HTTP 200 "runtime error" remark (Overpass\'s own [timeout:…] exceeded) as retryable, and throws if it recurs — never returning it as zero towers', async () => {
      const timeoutBody = { remark: 'runtime error: Query timed out in "query" at line 1 after 120 s.', elements: [] };
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(jsonRes(timeoutBody))
        .mockResolvedValueOnce(jsonRes(timeoutBody));
      vi.stubGlobal('fetch', fetchMock);
      const sleeps: number[] = [];
      const fakeSleep = async (ms: number) => { sleeps.push(ms); };

      await expect(fetchOverpassCountryTowers('IR', fakeSleep)).rejects.toThrow(/runtime error/i);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(sleeps).toEqual([30_000]);
    });

    it('retries once on a runtime-error remark and returns the elements when the retry succeeds', async () => {
      const timeoutBody = { remark: 'runtime error: Query timed out in "query" at line 1 after 120 s.', elements: [] };
      const goodElements = [{ type: 'node', id: 1, lat: 47.2, lon: 27.9, tags: { 'communication:radio': 'fm' } }];
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(jsonRes(timeoutBody))
        .mockResolvedValueOnce(jsonRes({ elements: goodElements }));
      vi.stubGlobal('fetch', fetchMock);
      const sleeps: number[] = [];
      const fakeSleep = async (ms: number) => { sleeps.push(ms); };

      const elements = await fetchOverpassCountryTowers('IR', fakeSleep);
      expect(elements).toEqual(goodElements);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(sleeps).toEqual([30_000]);
    });
  });
});
