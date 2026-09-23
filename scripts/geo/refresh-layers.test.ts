import { describe, it, expect, afterEach, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  validateLayerFile, wikidataPlantsToFeatures, cableGeoToFeatures, overpassTowersToFeatures,
  radioBrowserToFeatures, capTowersPerCountry, fetchOverpassCountryTowers,
  isSuspiciousDrop, mergeCountryTowers, assessRadioTowerHealth, runRadioTowers,
  OVERPASS_PRIMARY_URL, OVERPASS_FALLBACK_URL,
  type CountryFetchResult,
} from './refresh-layers';
import { STATIC_LAYERS, GeoLayerSchema, type GeoLayer, type CountryProvenance } from '../../src/lib/geo-layer-schema';

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

    /** Decodes the `data=<urlencoded overpass query>` body a mocked fetch call was made with. */
    const queryFromCall = (fetchMock: ReturnType<typeof vi.fn>, callIndex: number): string => {
      const body = fetchMock.mock.calls[callIndex][1].body as string;
      return decodeURIComponent(body.slice('data='.length));
    };

    it('falls back to the selector without admin_level=2 when the strict selector measures zero areas (e.g. Palestine: boundary=disputed, no admin_level tag)', async () => {
      const zeroAreaBody = { elements: [{ type: 'count', id: 0, tags: { nodes: '0', ways: '0', relations: '0', areas: '0', total: '0' } }] };
      const nodeElements = [{ type: 'node', id: 7, lat: 31.9, lon: 35.2, tags: { 'communication:radio': 'fm' } }];
      const matchedAreaBody = { elements: [{ type: 'count', id: 0, tags: { areas: '1', total: '1' } }, ...nodeElements] };
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(jsonRes(zeroAreaBody))
        .mockResolvedValueOnce(jsonRes(matchedAreaBody));
      vi.stubGlobal('fetch', fetchMock);
      const sleeps: number[] = [];
      const fakeSleep = async (ms: number) => { sleeps.push(ms); };

      const elements = await fetchOverpassCountryTowers('PS', fakeSleep);
      expect(elements).toEqual(nodeElements);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(sleeps).toEqual([]); // area-empty fallback is not the 429/504/runtime-error retry path — no sleep
      expect(queryFromCall(fetchMock, 0)).toContain('[admin_level=2]');
      expect(queryFromCall(fetchMock, 1)).not.toContain('[admin_level=2]');
      expect(queryFromCall(fetchMock, 1)).toContain('["ISO3166-1"="PS"]');
    });

    it('throws when the area still measures zero after the admin_level=2 fallback, instead of returning zero towers silently', async () => {
      const zeroAreaBody = { elements: [{ type: 'count', id: 0, tags: { areas: '0', total: '0' } }] };
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(jsonRes(zeroAreaBody))
        .mockResolvedValueOnce(jsonRes(zeroAreaBody));
      vi.stubGlobal('fetch', fetchMock);
      const fakeSleep = async () => {};

      await expect(fetchOverpassCountryTowers('XX', fakeSleep)).rejects.toThrow(/no area/i);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('retries a 429 against the fallback mirror host, not the primary host again', async () => {
      const goodElements = [{ type: 'node', id: 1, lat: 47.2, lon: 27.9, tags: { 'communication:radio': 'fm' } }];
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(jsonRes({}, 429))
        .mockResolvedValueOnce(jsonRes({ elements: goodElements }));
      vi.stubGlobal('fetch', fetchMock);
      const fakeSleep = async () => {};

      const elements = await fetchOverpassCountryTowers('IR', fakeSleep);
      expect(elements).toEqual(goodElements);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[0][0]).toBe(OVERPASS_PRIMARY_URL);
      expect(fetchMock.mock.calls[1][0]).toBe(OVERPASS_FALLBACK_URL);
    });

    it('throws after the mirror retry also fails, without ever hitting a third host', async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(jsonRes({}, 504))
        .mockResolvedValueOnce(jsonRes({}, 504));
      vi.stubGlobal('fetch', fetchMock);
      const fakeSleep = async () => {};

      await expect(fetchOverpassCountryTowers('IR', fakeSleep)).rejects.toThrow(/after retry/i);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[1][0]).toBe(OVERPASS_FALLBACK_URL);
    });
  });
});

describe('isSuspiciousDrop', () => {
  it('is never true below a previous count of 10', () => {
    expect(isSuspiciousDrop(9, 0)).toBe(false);
    expect(isSuspiciousDrop(0, 0)).toBe(false);
    expect(isSuspiciousDrop(9, 1)).toBe(false);
  });
  it('is true under 20% of a previous count of 100, false at exactly 20%', () => {
    expect(isSuspiciousDrop(100, 19)).toBe(true);
    expect(isSuspiciousDrop(100, 20)).toBe(false);
    expect(isSuspiciousDrop(100, 21)).toBe(false);
  });
  it('boundary at exactly a previous count of 10', () => {
    expect(isSuspiciousDrop(10, 1)).toBe(true); // 1 < 2
    expect(isSuspiciousDrop(10, 2)).toBe(false); // 2 == 20%, not < 20%
  });
});

describe('mergeCountryTowers', () => {
  const feat = (cc: string, id: string): GeoLayer['features'][number] => ({
    type: 'Feature', id, properties: { osmId: id, name: null, heightM: null, radioBand: 'fm', countryCode: cc },
    geometry: { type: 'Point', coordinates: [0, 0] },
  });
  const previousLayer = (countries: Record<string, CountryProvenance>, features: GeoLayer['features']): GeoLayer => ({
    type: 'FeatureCollection',
    _provenance: { id: 'radio-towers', source: 's', url: 'https://a.b/', license: 'l', attribution: 'a', retrievedAt: '2026-01-01T00:00:00Z', featureCount: features.length, countries },
    features,
  });

  it('replaces a fresh (successful, non-suspicious) country with new features and now as retrievedAt', () => {
    const previous = previousLayer(
      { IR: { retrievedAt: '2026-01-01T00:00:00Z', count: 1, status: 'fresh' } },
      [feat('IR', 'old-1')],
    );
    const results = new Map<string, CountryFetchResult>([['IR', { ok: true, features: [feat('IR', 'new-1'), feat('IR', 'new-2')] }]]);
    const merged = mergeCountryTowers({ previous, results, codes: ['IR'], now: '2026-02-01T00:00:00Z' });
    expect(merged.features.map(f => f.id)).toEqual(['new-1', 'new-2']);
    expect(merged.countries.IR).toEqual({ retrievedAt: '2026-02-01T00:00:00Z', count: 2, status: 'fresh' });
    expect(merged.staleReasons.IR).toBeUndefined();
  });

  it('a failed fetch keeps the previous features and previous retrievedAt, marked stale with the failure reason', () => {
    const previous = previousLayer(
      { IR: { retrievedAt: '2026-01-01T00:00:00Z', count: 1, status: 'fresh' } },
      [feat('IR', 'old-1')],
    );
    const results = new Map<string, CountryFetchResult>([['IR', { ok: false, reason: 'Overpass HTTP 504 for IR' }]]);
    const merged = mergeCountryTowers({ previous, results, codes: ['IR'], now: '2026-02-01T00:00:00Z' });
    expect(merged.features.map(f => f.id)).toEqual(['old-1']);
    expect(merged.countries.IR).toEqual({ retrievedAt: '2026-01-01T00:00:00Z', count: 1, status: 'stale' });
    expect(merged.staleReasons.IR).toBe('Overpass HTTP 504 for IR');
  });

  it('a country that has never succeeded gets retrievedAt: null and 0 features when its fetch fails', () => {
    const results = new Map<string, CountryFetchResult>([['XX', { ok: false, reason: 'Overpass matched no area' }]]);
    const merged = mergeCountryTowers({ previous: null, results, codes: ['XX'], now: '2026-02-01T00:00:00Z' });
    expect(merged.features).toEqual([]);
    expect(merged.countries.XX).toEqual({ retrievedAt: null, count: 0, status: 'stale' });
    expect(merged.staleReasons.XX).toBe('Overpass matched no area');
  });

  it('a suspicious drop (new count < 20% of previous, previous >= 10) is treated as a failure and keeps the old data', () => {
    const oldFeatures = Array.from({ length: 12 }, (_, i) => feat('IR', `old-${i}`));
    const previous = previousLayer(
      { IR: { retrievedAt: '2026-01-01T00:00:00Z', count: 12, status: 'fresh' } },
      oldFeatures,
    );
    const results = new Map<string, CountryFetchResult>([['IR', { ok: true, features: [feat('IR', 'new-1')] }]]); // 1 < 20% of 12
    const merged = mergeCountryTowers({ previous, results, codes: ['IR'], now: '2026-02-01T00:00:00Z' });
    expect(merged.features).toHaveLength(12);
    expect(merged.countries.IR).toEqual({ retrievedAt: '2026-01-01T00:00:00Z', count: 12, status: 'stale' });
    expect(merged.staleReasons.IR).toMatch(/suspicious drop/);
  });

  it('a code missing from results (time budget exhausted) is stale with that reason, previous data kept', () => {
    const previous = previousLayer(
      { IR: { retrievedAt: '2026-01-01T00:00:00Z', count: 1, status: 'fresh' } },
      [feat('IR', 'old-1')],
    );
    const merged = mergeCountryTowers({ previous, results: new Map(), codes: ['IR'], now: '2026-02-01T00:00:00Z' });
    expect(merged.features.map(f => f.id)).toEqual(['old-1']);
    expect(merged.countries.IR.status).toBe('stale');
    expect(merged.staleReasons.IR).toBe('time budget exhausted');
  });
});

describe('assessRadioTowerHealth', () => {
  const now = '2026-06-01T00:00:00Z';
  it('a country stale for 36 days is unhealthy', () => {
    const health = assessRadioTowerHealth({ IR: { retrievedAt: '2026-04-26T00:00:00Z', count: 5, status: 'stale' } }, now);
    expect(health.ok).toBe(false);
    expect(health.problems.some(p => p.includes('IR'))).toBe(true);
  });
  it('a country retrievedAt: null is unhealthy', () => {
    const health = assessRadioTowerHealth({ IR: { retrievedAt: null, count: 0, status: 'stale' } }, now);
    expect(health.ok).toBe(false);
    expect(health.problems.some(p => p.includes('never retrieved'))).toBe(true);
  });
  it('1 of 5 countries stale (20%) is healthy', () => {
    const fresh = (): CountryProvenance => ({ retrievedAt: now, count: 5, status: 'fresh' });
    const countries: Record<string, CountryProvenance> = { A: fresh(), B: fresh(), C: fresh(), D: fresh(), E: { retrievedAt: now, count: 5, status: 'stale' } };
    expect(assessRadioTowerHealth(countries, now).ok).toBe(true);
  });
  it('2 of 5 countries stale (40%) is unhealthy', () => {
    const fresh = (): CountryProvenance => ({ retrievedAt: now, count: 5, status: 'fresh' });
    const stale = (): CountryProvenance => ({ retrievedAt: now, count: 5, status: 'stale' });
    const countries: Record<string, CountryProvenance> = { A: fresh(), B: fresh(), C: fresh(), D: stale(), E: stale() };
    const health = assessRadioTowerHealth(countries, now);
    expect(health.ok).toBe(false);
    expect(health.problems.some(p => p.includes('2/5'))).toBe(true);
  });
  it('a fully fresh, recent set of countries is healthy', () => {
    const countries: Record<string, CountryProvenance> = { A: { retrievedAt: now, count: 5, status: 'fresh' } };
    expect(assessRadioTowerHealth(countries, now)).toEqual({ ok: true, problems: [] });
  });
});

describe('runRadioTowers (budget + orchestration)', () => {
  it('stops starting new countries once the injectable clock reports the budget elapsed, leaving the rest stale', async () => {
    const codes = ['A', 'B', 'C'];
    let calls = 0;
    let clockMs = 0;
    const fetchFn = async () => {
      calls++;
      clockMs += 2000; // each fetch "takes" time
      return [{ type: 'node', id: calls, lat: 1, lon: 1, tags: { 'communication:radio': 'fm' } }];
    };
    const layer = await runRadioTowers('2026-02-01T00:00:00Z', {
      codes,
      previous: null,
      fetchFn,
      sleepFn: async () => {},
      clock: () => clockMs,
      budgetMs: 1500, // enough for one country's fetch, not a second
      gapMs: 0,
    });
    expect(calls).toBe(1);
    expect(layer._provenance.countries?.A.status).toBe('fresh');
    expect(layer._provenance.countries?.B.status).toBe('stale');
    expect(layer._provenance.countries?.C.status).toBe('stale');
  });

  it('a country whose fetch throws is recorded as a failed result and kept stale, other countries unaffected', async () => {
    const fetchFn = async (cc: string) => {
      if (cc === 'BAD') throw new Error('Overpass HTTP 504 for BAD');
      return [{ type: 'node', id: 1, lat: 1, lon: 1, tags: { 'communication:radio': 'fm' } }];
    };
    const layer = await runRadioTowers('2026-02-01T00:00:00Z', {
      codes: ['GOOD', 'BAD'],
      previous: null,
      fetchFn,
      sleepFn: async () => {},
      clock: () => 0,
      gapMs: 0,
    });
    expect(layer._provenance.countries?.GOOD.status).toBe('fresh');
    expect(layer._provenance.countries?.BAD).toEqual({ retrievedAt: null, count: 0, status: 'stale' });
  });

  it('recomputes per-country counts after capTowersPerCountry so provenance matches what is actually shipped', async () => {
    const fetchFn = async () => Array.from({ length: 5 }, (_, i) => ({ type: 'node', id: i + 1, lat: 1, lon: 1, tags: { 'communication:radio': 'fm', name: `T${i}` } }));
    const layer = await runRadioTowers('2026-02-01T00:00:00Z', {
      codes: ['IR'],
      previous: null,
      fetchFn,
      sleepFn: async () => {},
      clock: () => 0,
      gapMs: 0,
    });
    // cap isn't exercised at 5 features (well under 800), so count should equal actual features for IR
    expect(layer.features).toHaveLength(5);
    expect(layer._provenance.countries?.IR.count).toBe(5);
    expect(GeoLayerSchema.safeParse(layer).success).toBe(true);
  });
});
