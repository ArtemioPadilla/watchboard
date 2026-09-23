import { describe, it, expect, afterEach, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  validateLayerFile, wikidataPlantsToFeatures, cableGeoToFeatures, overpassTowersToFeatures,
  radioBrowserToFeatures, capTowersPerCountry, fetchOverpassCountryTowers,
  isSuspiciousDrop, mergeCountryTowers, assessRadioTowerHealth, runRadioTowers, dedupeByOsmId,
  radioTowersTopLevelRetrievedAt, parseAcceptDropEnv, parseLegacyTransformCodes, runAndWriteRadioTowers,
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

    it('attaches a 150s AbortSignal.timeout to every request', async () => {
      const fetchMock = vi.fn().mockResolvedValueOnce(jsonRes({ elements: [] })); // areaCount null (no count element) -> resolves with []
      vi.stubGlobal('fetch', fetchMock);
      await fetchOverpassCountryTowers('XX', async () => {});
      const opts = fetchMock.mock.calls[0][1] as RequestInit;
      expect(opts.signal).toBeInstanceOf(AbortSignal);
    });

    it('treats a fetch abort (150s timeout) as retryable, retrying against the mirror', async () => {
      const abortErr = Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
      const goodElements = [{ type: 'node', id: 1, lat: 47.2, lon: 27.9, tags: { 'communication:radio': 'fm' } }];
      const fetchMock = vi.fn()
        .mockRejectedValueOnce(abortErr)
        .mockResolvedValueOnce(jsonRes({ elements: goodElements }));
      vi.stubGlobal('fetch', fetchMock);
      const sleeps: number[] = [];
      const fakeSleep = async (ms: number) => { sleeps.push(ms); };

      const elements = await fetchOverpassCountryTowers('IR', fakeSleep);
      expect(elements).toEqual(goodElements);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[1][0]).toBe(OVERPASS_FALLBACK_URL);
      expect(sleeps).toEqual([30_000]);
    });

    it('throws when the abort recurs on the mirror retry too (DOMException TimeoutError shape)', async () => {
      const timeoutErr = Object.assign(new Error('signal timed out'), { name: 'TimeoutError' });
      const fetchMock = vi.fn().mockRejectedValue(timeoutErr);
      vi.stubGlobal('fetch', fetchMock);
      const fakeSleep = async () => {};

      await expect(fetchOverpassCountryTowers('IR', fakeSleep)).rejects.toThrow(/after retry/i);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('a non-abort network error is not retried (rethrown immediately)', async () => {
      const networkErr = new Error('getaddrinfo ENOTFOUND overpass-api.de');
      const fetchMock = vi.fn().mockRejectedValueOnce(networkErr);
      vi.stubGlobal('fetch', fetchMock);
      const fakeSleep = async () => {};

      await expect(fetchOverpassCountryTowers('IR', fakeSleep)).rejects.toThrow(/ENOTFOUND/);
      expect(fetchMock).toHaveBeenCalledTimes(1); // no retry, no mirror
    });

    it('skips the mirror retry when the run budget is already spent, failing immediately instead of sleeping 30s for nothing', async () => {
      const fetchMock = vi.fn().mockResolvedValueOnce(jsonRes({}, 429));
      vi.stubGlobal('fetch', fetchMock);
      const sleeps: number[] = [];
      const fakeSleep = async (ms: number) => { sleeps.push(ms); };

      await expect(fetchOverpassCountryTowers('IR', fakeSleep, { hasBudget: () => false })).rejects.toThrow(/budget exhausted/i);
      expect(fetchMock).toHaveBeenCalledTimes(1); // no mirror retry attempted
      expect(sleeps).toEqual([]); // no 30s sleep for a retry we're not going to make
    });

    it('skips the non-strict area-empty fallback when the run budget is already spent', async () => {
      const zeroAreaBody = { elements: [{ type: 'count', id: 0, tags: { areas: '0', total: '0' } }] };
      const fetchMock = vi.fn().mockResolvedValueOnce(jsonRes(zeroAreaBody));
      vi.stubGlobal('fetch', fetchMock);
      const fakeSleep = async () => {};

      await expect(fetchOverpassCountryTowers('PS', fakeSleep, { hasBudget: () => false })).rejects.toThrow(/budget exhausted/i);
      expect(fetchMock).toHaveBeenCalledTimes(1); // no non-strict retry attempted
    });

    it('proceeds normally (mirror retry, non-strict fallback) when hasBudget returns true', async () => {
      const goodElements = [{ type: 'node', id: 1, lat: 47.2, lon: 27.9, tags: { 'communication:radio': 'fm' } }];
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(jsonRes({}, 429))
        .mockResolvedValueOnce(jsonRes({ elements: goodElements }));
      vi.stubGlobal('fetch', fetchMock);
      const fakeSleep = async () => {};

      const elements = await fetchOverpassCountryTowers('IR', fakeSleep, { hasBudget: () => true });
      expect(elements).toEqual(goodElements);
      expect(fetchMock).toHaveBeenCalledTimes(2);
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

  it('caps the new count to RADIO_TOWERS_CAP before the suspicious-drop comparison, so a raw fetch above the cap cannot dodge the check by looking artificially large', () => {
    // prevCount 5000 (hypothetical, e.g. a legacy/uncapped record) → 20% threshold is 1000.
    // A raw new count of 2000 alone would clear that threshold. Capped to 800, it doesn't.
    const previous = previousLayer(
      { IR: { retrievedAt: '2026-01-01T00:00:00Z', count: 5000, status: 'fresh' } },
      [],
    );
    const results = new Map<string, CountryFetchResult>([
      ['IR', { ok: true, features: Array.from({ length: 2000 }, (_, i) => feat('IR', `new-${i}`)) }],
    ]);
    const merged = mergeCountryTowers({ previous, results, codes: ['IR'], now: '2026-02-01T00:00:00Z' });
    expect(merged.countries.IR.status).toBe('stale');
    expect(merged.staleReasons.IR).toMatch(/suspicious drop: 5000 → 800/);
  });

  describe('migration: previous layer predates _provenance.countries', () => {
    // Corrected ruling: the legacy adapter was all-or-nothing, so every code
    // it queried (listed in its transform's "ISO3166-1: ..." clause) was
    // fetched successfully at the file's top-level retrievedAt — including
    // codes that matched zero towers (e.g. PS, IL). Being *listed* is what
    // proves the code was tried; feature count doesn't factor in.
    const legacyPreviousLayer = (features: GeoLayer['features'], listedCodes: string[]): GeoLayer => ({
      type: 'FeatureCollection',
      _provenance: {
        id: 'radio-towers', source: 's', url: 'https://a.b/', license: 'l', attribution: 'a', retrievedAt: '2026-01-10T00:00:00Z', featureCount: features.length,
        transform: `Per-country Overpass area queries (ISO3166-1: ${listedCodes.join(', ')}) for nodes tagged man_made=tower|mast with communication:radio set, deduped by OSM id`,
      },
      features,
    });

    it('a code listed in the legacy transform inherits the top-level retrievedAt, even with zero previous features (e.g. PS/IL never had towers under the old adapter)', () => {
      const previous = legacyPreviousLayer([feat('IR', 'old-1')], ['IR', 'PS']);
      const results = new Map<string, CountryFetchResult>([['PS', { ok: false, reason: 'Overpass matched no area' }]]);
      const merged = mergeCountryTowers({ previous, results, codes: ['PS'], now: '2026-02-01T00:00:00Z' });
      expect(merged.countries.PS).toEqual({ retrievedAt: '2026-01-10T00:00:00Z', count: 0, status: 'stale' });
    });

    it('a code listed in the legacy transform with features inherits the top-level retrievedAt too', () => {
      const previous = legacyPreviousLayer([feat('IR', 'old-1'), feat('IR', 'old-2')], ['IR']);
      const results = new Map<string, CountryFetchResult>([['IR', { ok: false, reason: 'Overpass HTTP 504 for IR' }]]);
      const merged = mergeCountryTowers({ previous, results, codes: ['IR'], now: '2026-02-01T00:00:00Z' });
      expect(merged.countries.IR).toEqual({ retrievedAt: '2026-01-10T00:00:00Z', count: 2, status: 'stale' });
    });

    it('a code NOT listed in the legacy transform (added to codes since the legacy file) gets retrievedAt: null', () => {
      const previous = legacyPreviousLayer([feat('IR', 'old-1')], ['IR']); // IQ was never queried by the legacy adapter
      const results = new Map<string, CountryFetchResult>([['IQ', { ok: false, reason: 'Overpass matched no area' }]]);
      const merged = mergeCountryTowers({ previous, results, codes: ['IQ'], now: '2026-02-01T00:00:00Z' });
      expect(merged.countries.IQ).toEqual({ retrievedAt: null, count: 0, status: 'stale' });
    });
  });

  describe('RADIO_TOWERS_ACCEPT_DROP escape hatch (acceptDropCodes)', () => {
    it('a code in acceptDropCodes skips the suspicious-drop check and is recorded as an accepted drop, still fresh', () => {
      const oldFeatures = Array.from({ length: 12 }, (_, i) => feat('IR', `old-${i}`));
      const previous = previousLayer({ IR: { retrievedAt: '2026-01-01T00:00:00Z', count: 12, status: 'fresh' } }, oldFeatures);
      const results = new Map<string, CountryFetchResult>([['IR', { ok: true, features: [feat('IR', 'new-1')] }]]); // 1 < 20% of 12
      const merged = mergeCountryTowers({ previous, results, codes: ['IR'], now: '2026-02-01T00:00:00Z', acceptDropCodes: new Set(['IR']) });
      expect(merged.countries.IR).toEqual({ retrievedAt: '2026-02-01T00:00:00Z', count: 1, status: 'fresh' });
      expect(merged.staleReasons.IR).toBeUndefined();
      expect(merged.acceptedDrops).toEqual(['IR']);
    });

    it('a code NOT in acceptDropCodes still triggers the suspicious-drop check as normal', () => {
      const oldFeatures = Array.from({ length: 12 }, (_, i) => feat('IR', `old-${i}`));
      const previous = previousLayer({ IR: { retrievedAt: '2026-01-01T00:00:00Z', count: 12, status: 'fresh' } }, oldFeatures);
      const results = new Map<string, CountryFetchResult>([['IR', { ok: true, features: [feat('IR', 'new-1')] }]]);
      const merged = mergeCountryTowers({ previous, results, codes: ['IR'], now: '2026-02-01T00:00:00Z', acceptDropCodes: new Set(['UA']) });
      expect(merged.countries.IR.status).toBe('stale');
      expect(merged.acceptedDrops).toEqual([]);
    });
  });
});

describe('dedupeByOsmId', () => {
  const feat = (cc: string, id: string): GeoLayer['features'][number] => ({
    type: 'Feature', id, properties: { osmId: id, name: null, heightM: null, radioBand: 'fm', countryCode: cc },
    geometry: { type: 'Point', coordinates: [0, 0] },
  });
  it('keeps only the first occurrence of a duplicated id, regardless of which country it is tagged with', () => {
    const result = dedupeByOsmId([feat('IN', '99'), feat('PK', '99'), feat('PK', '5')]);
    expect(result.map(f => [f.id, (f.properties as any).countryCode])).toEqual([['99', 'IN'], ['5', 'PK']]);
  });
  it('passes through features with no duplicates unchanged', () => {
    const input = [feat('IR', '1'), feat('IR', '2')];
    expect(dedupeByOsmId(input)).toEqual(input);
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
    const { layer } = await runRadioTowers('2026-02-01T00:00:00Z', {
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
    const { layer } = await runRadioTowers('2026-02-01T00:00:00Z', {
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
    const { layer } = await runRadioTowers('2026-02-01T00:00:00Z', {
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

  it('dedupes an OSM id returned by two countries\' fresh results, first country in codes order wins', async () => {
    const fetchFn = async (cc: string) => {
      // Both IN and PK report a node with the same OSM id, e.g. a shared-border tower.
      if (cc === 'IN') return [{ type: 'node', id: 99, lat: 1, lon: 1, tags: { 'communication:radio': 'fm', name: 'Shared' } }];
      return [{ type: 'node', id: 99, lat: 1, lon: 1, tags: { 'communication:radio': 'fm', name: 'Shared (PK side)' } }];
    };
    const { layer } = await runRadioTowers('2026-02-01T00:00:00Z', {
      codes: ['IN', 'PK'],
      previous: null,
      fetchFn,
      sleepFn: async () => {},
      clock: () => 0,
      gapMs: 0,
    });
    const shared = layer.features.filter((f: GeoLayer['features'][number]) => String(f.id) === '99');
    expect(shared).toHaveLength(1);
    expect((shared[0].properties as any).countryCode).toBe('IN'); // IN comes first in codes
    expect(layer._provenance.countries?.IN.count).toBe(1);
    expect(layer._provenance.countries?.PK.count).toBe(0);
  });

  it('dedupes an OSM id shared between a fresh country and a stale carried-over country', async () => {
    const previous: GeoLayer = {
      type: 'FeatureCollection',
      _provenance: {
        id: 'radio-towers', source: 's', url: 'https://a.b/', license: 'l', attribution: 'a', retrievedAt: '2026-01-01T00:00:00Z', featureCount: 1,
        countries: { MD: { retrievedAt: '2026-01-01T00:00:00Z', count: 1, status: 'fresh' } },
      },
      features: [{ type: 'Feature', id: '50', properties: { osmId: '50', name: null, heightM: null, radioBand: 'fm', countryCode: 'MD' }, geometry: { type: 'Point', coordinates: [0, 0] } }],
    };
    const fetchFn = async (cc: string) => {
      if (cc === 'MD') throw new Error('Overpass HTTP 504 for MD'); // MD stays stale, carries over id 50
      return [{ type: 'node', id: 50, lat: 1, lon: 1, tags: { 'communication:radio': 'fm' } }]; // UA freshly reports the same id
    };
    const { layer } = await runRadioTowers('2026-02-01T00:00:00Z', {
      codes: ['MD', 'UA'], // MD first in codes order, so its carried-over id 50 wins
      previous,
      fetchFn,
      sleepFn: async () => {},
      clock: () => 0,
      gapMs: 0,
    });
    const shared = layer.features.filter((f: GeoLayer['features'][number]) => String(f.id) === '50');
    expect(shared).toHaveLength(1);
    expect((shared[0].properties as any).countryCode).toBe('MD');
    expect(layer._provenance.countries?.MD.status).toBe('stale');
    expect(layer._provenance.countries?.MD.count).toBe(1);
    expect(layer._provenance.countries?.UA.count).toBe(0);
  });

  it('warns once per stale country (green or red run) with the original failure reason, via the injectable warnFn', async () => {
    const fetchFn = async (cc: string) => {
      if (cc === 'BAD') throw new Error('Overpass HTTP 504 for BAD');
      return [{ type: 'node', id: 1, lat: 1, lon: 1, tags: { 'communication:radio': 'fm' } }];
    };
    const warnings: string[] = [];
    const { staleReasons } = await runRadioTowers('2026-02-01T00:00:00Z', {
      codes: ['GOOD', 'BAD'],
      previous: null,
      fetchFn,
      sleepFn: async () => {},
      clock: () => 0,
      gapMs: 0,
      warnFn: (m) => warnings.push(m),
    });
    expect(staleReasons).toEqual({ BAD: 'Overpass HTTP 504 for BAD' });
    expect(warnings).toEqual(['::warning::radio-towers BAD stale: Overpass HTTP 504 for BAD']);
  });

  it('logs a ::notice:: per country whose suspicious drop was overridden by acceptDropCodes, and keeps it fresh', async () => {
    const previous: GeoLayer = {
      type: 'FeatureCollection',
      _provenance: { id: 'radio-towers', source: 's', url: 'https://a.b/', license: 'l', attribution: 'a', retrievedAt: '2026-01-01T00:00:00Z', featureCount: 12, countries: { IR: { retrievedAt: '2026-01-01T00:00:00Z', count: 12, status: 'fresh' } } },
      features: Array.from({ length: 12 }, (_, i) => ({ type: 'Feature' as const, id: `old-${i}`, properties: { osmId: `old-${i}`, name: null, heightM: null, radioBand: 'fm', countryCode: 'IR' }, geometry: { type: 'Point' as const, coordinates: [0, 0] } })),
    };
    const fetchFn = async () => [{ type: 'node', id: 'new-1', lat: 1, lon: 1, tags: { 'communication:radio': 'fm' } }]; // 1 < 20% of 12 — would normally be a suspicious drop
    const notices: string[] = [];
    const { layer, staleReasons } = await runRadioTowers('2026-02-01T00:00:00Z', {
      codes: ['IR'],
      previous,
      fetchFn,
      sleepFn: async () => {},
      clock: () => 0,
      gapMs: 0,
      acceptDropCodes: new Set(['IR']),
      noticeFn: (m) => notices.push(m),
    });
    expect(layer._provenance.countries?.IR).toEqual({ retrievedAt: '2026-02-01T00:00:00Z', count: 1, status: 'fresh' });
    expect(staleReasons.IR).toBeUndefined();
    expect(notices).toEqual(['::notice::radio-towers accepted a large drop for IR (RADIO_TOWERS_ACCEPT_DROP)']);
  });

  it('sets the top-level retrievedAt to now when every country is fresh, and to the oldest stale country\'s retrievedAt otherwise', async () => {
    const allFreshFetch = async () => [{ type: 'node', id: 1, lat: 1, lon: 1, tags: { 'communication:radio': 'fm' } }];
    const { layer: allFresh } = await runRadioTowers('2026-02-01T00:00:00Z', {
      codes: ['IR'], previous: null, fetchFn: allFreshFetch, sleepFn: async () => {}, clock: () => 0, gapMs: 0,
    });
    expect(allFresh._provenance.retrievedAt).toBe('2026-02-01T00:00:00Z');

    const previous: GeoLayer = {
      type: 'FeatureCollection',
      _provenance: { id: 'radio-towers', source: 's', url: 'https://a.b/', license: 'l', attribution: 'a', retrievedAt: '2026-01-01T00:00:00Z', featureCount: 1, countries: { OLD: { retrievedAt: '2026-01-01T00:00:00Z', count: 1, status: 'fresh' } } },
      features: [{ type: 'Feature', id: 'x', properties: { osmId: 'x', name: null, heightM: null, radioBand: 'fm', countryCode: 'OLD' }, geometry: { type: 'Point', coordinates: [0, 0] } }],
    };
    const mixedFetch = async (cc: string) => {
      if (cc === 'OLD') throw new Error('Overpass HTTP 504 for OLD'); // stays stale at its old retrievedAt
      return [{ type: 'node', id: 2, lat: 1, lon: 1, tags: { 'communication:radio': 'fm' } }]; // fresh, now
    };
    const { layer: mixed } = await runRadioTowers('2026-02-01T00:00:00Z', {
      codes: ['OLD', 'NEW'], previous, fetchFn: mixedFetch, sleepFn: async () => {}, clock: () => 0, gapMs: 0,
    });
    expect(mixed._provenance.retrievedAt).toBe('2026-01-01T00:00:00Z'); // oldest, not "now"
  });
});

describe('radioTowersTopLevelRetrievedAt', () => {
  const now = '2026-02-01T00:00:00Z';
  it('returns now when every country is fresh', () => {
    expect(radioTowersTopLevelRetrievedAt({ A: { retrievedAt: now, count: 1, status: 'fresh' } }, now)).toBe(now);
  });
  it('returns now for an empty countries map', () => {
    expect(radioTowersTopLevelRetrievedAt({}, now)).toBe(now);
  });
  it('returns the oldest non-null retrievedAt when any country is stale', () => {
    const countries: Record<string, CountryProvenance> = {
      A: { retrievedAt: now, count: 1, status: 'fresh' },
      B: { retrievedAt: '2026-01-10T00:00:00Z', count: 1, status: 'stale' },
      C: { retrievedAt: '2026-01-05T00:00:00Z', count: 1, status: 'stale' }, // oldest
    };
    expect(radioTowersTopLevelRetrievedAt(countries, now)).toBe('2026-01-05T00:00:00Z');
  });
  it('falls back to now when no country has ever succeeded (defensive; should not occur for a written file)', () => {
    expect(radioTowersTopLevelRetrievedAt({ A: { retrievedAt: null, count: 0, status: 'stale' } }, now)).toBe(now);
  });
});

describe('parseAcceptDropEnv', () => {
  it('parses a comma-separated, trimmed, uppercased list', () => {
    expect(parseAcceptDropEnv('ir, iq ,ua')).toEqual(new Set(['IR', 'IQ', 'UA']));
  });
  it('returns an empty set for undefined or empty input', () => {
    expect(parseAcceptDropEnv(undefined)).toEqual(new Set());
    expect(parseAcceptDropEnv('')).toEqual(new Set());
    expect(parseAcceptDropEnv('  ,, ')).toEqual(new Set());
  });
});

describe('parseLegacyTransformCodes', () => {
  it('extracts codes from the real committed transform shape', () => {
    const transform = 'Per-country Overpass area queries (ISO3166-1: AF, PK, CD, PS, IL) for nodes tagged man_made=tower|mast with communication:radio set, deduped by OSM id';
    expect(parseLegacyTransformCodes(transform)).toEqual(new Set(['AF', 'PK', 'CD', 'PS', 'IL']));
  });
  it('returns an empty set when the shape does not match', () => {
    expect(parseLegacyTransformCodes(undefined)).toEqual(new Set());
    expect(parseLegacyTransformCodes('something unrelated')).toEqual(new Set());
  });
});

describe('runAndWriteRadioTowers (write+health cycle, factored out of main())', () => {
  const okLayer = (): GeoLayer => ({
    type: 'FeatureCollection',
    _provenance: {
      id: 'radio-towers', source: 's', url: 'https://a.b/', license: 'l', attribution: 'a', retrievedAt: '2026-02-01T00:00:00Z', featureCount: 1,
      countries: { IR: { retrievedAt: '2026-02-01T00:00:00Z', count: 1, status: 'fresh' } },
    },
    features: [{ type: 'Feature', id: '1', properties: { osmId: '1', name: null, heightM: null, radioBand: 'fm', countryCode: 'IR' }, geometry: { type: 'Point', coordinates: [0, 0] } }],
  });

  it('writes the file and returns { ok: true } for a healthy run', async () => {
    const written: Record<string, string> = {};
    const result = await runAndWriteRadioTowers('2026-02-01T00:00:00Z', {
      codes: ['IR'],
      runFn: async () => ({ layer: okLayer(), staleReasons: {} }),
      writeFileFn: (path, data) => { written[path] = data; },
      logFn: () => {}, warnFn: () => {}, noticeFn: () => {}, errorFn: () => {},
    });
    expect(result).toEqual({ ok: true });
    expect(Object.keys(written)).toHaveLength(1);
  });

  it('writes the file and returns { ok: false }, folding staleReasons into the ::error:: line, when the merged layer is unhealthy', async () => {
    const staleLayer: GeoLayer = {
      type: 'FeatureCollection',
      _provenance: {
        id: 'radio-towers', source: 's', url: 'https://a.b/', license: 'l', attribution: 'a', retrievedAt: '2026-01-01T00:00:00Z', featureCount: 1,
        countries: {
          IR: { retrievedAt: '2026-02-01T00:00:00Z', count: 1, status: 'fresh' },
          IQ: { retrievedAt: null, count: 0, status: 'stale' }, // never retrieved -> unhealthy
        },
      },
      features: [{ type: 'Feature', id: '1', properties: { osmId: '1', name: null, heightM: null, radioBand: 'fm', countryCode: 'IR' }, geometry: { type: 'Point', coordinates: [0, 0] } }],
    };
    const written: Record<string, string> = {};
    const errors: string[] = [];
    const result = await runAndWriteRadioTowers('2026-02-01T00:00:00Z', {
      codes: ['IR', 'IQ'],
      runFn: async () => ({ layer: staleLayer, staleReasons: { IQ: 'Overpass matched no area' } }),
      writeFileFn: (path, data) => { written[path] = data; },
      logFn: () => {}, warnFn: () => {}, noticeFn: () => {},
      errorFn: (m) => errors.push(m),
    });
    expect(result).toEqual({ ok: false });
    // The write still happened — per-country merge means a bad run still ships a strictly-better file.
    expect(Object.keys(written)).toHaveLength(1);
    expect(written[Object.keys(written)[0]]).toContain('"IQ"');
    expect(errors.some((e) => e.includes('::error::radio-towers unhealthy') && e.includes('IQ: never retrieved') && e.includes('IQ: Overpass matched no area'))).toBe(true);
  });

  it('returns { ok: false } without writing when there are no codes to fetch', async () => {
    const written: Record<string, string> = {};
    const errors: string[] = [];
    const result = await runAndWriteRadioTowers('2026-02-01T00:00:00Z', {
      codes: [],
      writeFileFn: (path, data) => { written[path] = data; },
      logFn: () => {}, warnFn: () => {}, noticeFn: () => {},
      errorFn: (m) => errors.push(m),
    });
    expect(result).toEqual({ ok: false });
    expect(Object.keys(written)).toHaveLength(0);
    expect(errors.some((e) => e.includes('no tracker has'))).toBe(true);
  });

  it('returns { ok: false } without writing when the merged layer has zero features', async () => {
    const emptyLayer: GeoLayer = {
      type: 'FeatureCollection',
      _provenance: { id: 'radio-towers', source: 's', url: 'https://a.b/', license: 'l', attribution: 'a', retrievedAt: '2026-02-01T00:00:00Z', featureCount: 0, countries: {} },
      features: [],
    };
    const written: Record<string, string> = {};
    const result = await runAndWriteRadioTowers('2026-02-01T00:00:00Z', {
      codes: ['IR'],
      runFn: async () => ({ layer: emptyLayer, staleReasons: {} }),
      writeFileFn: (path, data) => { written[path] = data; },
      logFn: () => {}, warnFn: () => {}, noticeFn: () => {}, errorFn: () => {},
    });
    expect(result).toEqual({ ok: false });
    expect(Object.keys(written)).toHaveLength(0);
  });
});
