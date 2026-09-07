import { describe, it, expect } from 'vitest';
import {
  reverseGeocode, countryFacts, trackersForCountry, eventsNear, buildDossier, haversineKm, geocodeKey,
  parseNominatim, parseWikidataFacts, parseWikipediaSummary, wikipediaTitle, wikipediaExtract, countryFactsQuery,
  _internal, NOMINATIM_URL, WIKIDATA_SPARQL_URL, WIKIPEDIA_SUMMARY_URL,
} from './dossier';
import { createRateLimiter } from './rate-limiter';

// jsonv2 at zoom 10 (city level): address carries city, state and country.
const NOMINATIM_OK = { display_name: 'Baghdad, Baghdad Governorate, Iraq', address: { city: 'Baghdad', state: 'Baghdad Governorate', country: 'Iraq', country_code: 'iq' } };
const WIKI_OK = { title: 'Iraq', extract: 'Iraq is a country in West Asia.' };
const WD_OK = { results: { bindings: [{ countryLabel: { value: 'Iraq' }, capitalLabel: { value: 'Baghdad' }, population: { value: '43533592' }, headOfStateLabel: { value: 'Abdul Latif Rashid' }, flag: { value: 'https://commons/flag.svg' }, article: { value: 'https://en.wikipedia.org/wiki/Iraq' } }] } };

function fetchFor(map: Record<string, { status: number; body?: unknown }>, calls: string[] = []) {
  const impl = (async (url: string) => {
    calls.push(url);
    const hit = Object.entries(map).find(([prefix]) => url.startsWith(prefix));
    if (!hit) return { ok: false, status: 404, json: async () => ({}) } as Response;
    const { status, body } = hit[1];
    return { ok: status < 400, status, json: async () => body } as Response;
  }) as unknown as typeof fetch;
  return { impl, calls };
}
const noWait = createRateLimiter(0, { now: () => 0, sleep: async () => {} });
const TRACKERS = [
  { slug: 'iraq-history', name: 'Iraq', country: 'IQ', lastUpdated: '2026-09-01', activity: 10 },
  { slug: 'iran-conflict', name: 'Iran conflict', country: 'IR', geoPath: ['IR', 'IQ'], lastUpdated: '2026-09-06', activity: 80 },
  { slug: 'mexico-history', name: 'Mexico', country: 'MX' },
];
const POINTS = [
  { slug: 'iraq-history', id: 'a', label: 'Green Zone', date: '2026-03-01', lat: 33.31, lon: 44.37 },
  { slug: 'iran-conflict', id: 'b', label: 'Basra', date: '2026-03-02', lat: 30.5, lon: 47.8 },
  { slug: 'mexico-history', id: 'c', label: 'CDMX', date: '2026-03-03', lat: 19.4, lon: -99.1 },
];

describe('parsers', () => {
  it('parses Nominatim and Wikidata payloads and tolerates junk', () => {
    expect(parseNominatim(NOMINATIM_OK)).toEqual({ countryCode: 'IQ', country: 'Iraq', state: 'Baghdad Governorate', city: 'Baghdad', displayName: 'Baghdad, Baghdad Governorate, Iraq' });
    expect(parseNominatim({})).toBeNull();
    expect(parseNominatim({ address: { country_code: 'xyz' } })?.countryCode).toBeNull();
    expect(parseWikidataFacts(WD_OK, 'IQ')).toMatchObject({ code: 'IQ', name: 'Iraq', capital: 'Baghdad', population: 43533592, headOfState: 'Abdul Latif Rashid' });
    expect(parseWikidataFacts({ results: { bindings: [] } }, 'IQ')).toBeNull();
    expect(parseWikidataFacts(null, 'IQ')).toBeNull();
  });
});

describe('reverseGeocode', () => {
  it('calls Nominatim with zoom 10, caches by 0.1° cell for 24 h', async () => {
    const store = _internal.memoryStore();
    let t = 1_000_000;
    const f = fetchFor({ [NOMINATIM_URL]: { status: 200, body: NOMINATIM_OK } });
    const deps = { fetchImpl: f.impl, geocodeCache: store, now: () => t, limiter: noWait };
    const a = await reverseGeocode(33.31, 44.37, deps);
    const b = await reverseGeocode(33.34, 44.36, deps); // same 0.1° cell
    expect(a.countryCode).toBe('IQ');
    expect(b).toEqual(a);
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]).toContain('zoom=10');
    expect(f.calls[0]).toContain('format=jsonv2');
    t += 25 * 3_600_000;
    await reverseGeocode(33.31, 44.37, deps);
    expect(f.calls).toHaveLength(2);
    expect(geocodeKey(33.31, 44.37)).toBe('wb:geocode:33.3,44.4');
  });

  it('goes through the rate limiter and throws on HTTP errors', async () => {
    const starts: number[] = [];
    let t = 0;
    const limiter = createRateLimiter(1000, { now: () => t, sleep: async ms => { t += ms; } });
    const f = fetchFor({ [NOMINATIM_URL]: { status: 200, body: NOMINATIM_OK } });
    const wrapped = (async (u: string, i?: RequestInit) => { starts.push(t); return f.impl(u, i); }) as typeof fetch;
    const deps = { fetchImpl: wrapped, geocodeCache: null, now: () => t, limiter };
    await Promise.all([reverseGeocode(10, 10, deps), reverseGeocode(20, 20, deps)]);
    expect(starts).toEqual([0, 1000]);
    const bad = fetchFor({ [NOMINATIM_URL]: { status: 429 } });
    await expect(reverseGeocode(1, 1, { fetchImpl: bad.impl, geocodeCache: null, limiter: noWait })).rejects.toThrow('429');
  });
});

describe('countryFacts', () => {
  it('queries Wikidata once per code and caches for 7 days', async () => {
    const store = _internal.memoryStore();
    const f = fetchFor({ [WIKIDATA_SPARQL_URL]: { status: 200, body: WD_OK } });
    const deps = { fetchImpl: f.impl, factsCache: store, now: () => 5 };
    const a = await countryFacts('IQ', deps);
    const b = await countryFacts('IQ', deps);
    expect(a?.capital).toBe('Baghdad');
    expect(b).toEqual(a);
    expect(f.calls).toHaveLength(1);
    expect(decodeURIComponent(f.calls[0])).toContain('wdt:P297 "IQ"');
    expect(await countryFacts('bogus', deps)).toBeNull();
  });
});

describe('trackersForCountry / eventsNear', () => {
  it('matches country and geoPath, most active first', () => {
    expect(trackersForCountry('IQ', TRACKERS).map(t => t.slug)).toEqual(['iran-conflict', 'iraq-history']);
    expect(trackersForCountry('iq', TRACKERS)).toHaveLength(2);
    expect(trackersForCountry(null, TRACKERS)).toEqual([]);
    expect(trackersForCountry('BR', TRACKERS)).toEqual([]);
  });
  it('returns points inside the radius sorted by distance', () => {
    const near = eventsNear(33.3, 44.4, POINTS, 300, 5);
    expect(near.map(p => p.id)).toEqual(['a']);
    expect(near[0].distanceKm).toBeLessThan(5);
    expect(eventsNear(33.3, 44.4, POINTS, 500).map(p => p.id)).toEqual(['a', 'b']);
    expect(Math.round(haversineKm(0, 0, 0, 1))).toBe(111);
  });
});

describe('buildDossier', () => {
  it('composes place, facts, trackers and nearby events', async () => {
    const f = fetchFor({ [NOMINATIM_URL]: { status: 200, body: NOMINATIM_OK }, [WIKIDATA_SPARQL_URL]: { status: 200, body: WD_OK }, [WIKIPEDIA_SUMMARY_URL]: { status: 200, body: WIKI_OK } });
    const d = await buildDossier(33.31, 44.37, { trackers: TRACKERS, points: POINTS }, { fetchImpl: f.impl, geocodeCache: null, factsCache: null, extractCache: null, limiter: noWait, wikidataLimiter: noWait, now: () => 9 });
    expect(d.place?.countryCode).toBe('IQ');
    expect(d.facts?.capital).toBe('Baghdad');
    expect(d.extract).toBe('Iraq is a country in West Asia.');
    expect(d.trackers.map(t => t.slug)).toEqual(['iran-conflict', 'iraq-history']);
    expect(d.nearby[0].id).toBe('a');
    expect(d.degraded).toEqual([]);
    expect(d.fetchedAt).toBe(9);
  });

  it('degrades gracefully: geocoder down → named; no facts → named; known code → no geocode attempted', async () => {
    const f = fetchFor({ [NOMINATIM_URL]: { status: 503 }, [WIKIDATA_SPARQL_URL]: { status: 500 } });
    const d0 = await buildDossier(33.31, 44.37, { trackers: TRACKERS, points: POINTS }, { fetchImpl: f.impl, geocodeCache: null, factsCache: null, limiter: noWait, wikidataLimiter: noWait });
    expect(d0.degraded).toEqual(['geocode']);
    expect(d0.place).toBeNull();
    const d = await buildDossier(33.31, 44.37, { trackers: TRACKERS, points: POINTS, countryCode: 'IQ' }, { fetchImpl: f.impl, geocodeCache: null, factsCache: null, limiter: noWait, wikidataLimiter: noWait });
    expect(d.degraded).toEqual(['facts']);
    expect(d.place?.countryCode).toBe('IQ');
    expect(d.place?.country).toBe('Iraq');
    expect(d.trackers).toHaveLength(2);
    expect(d.nearby).toHaveLength(1);
  });

  it('with nothing resolvable still returns nearby events', async () => {
    const f = fetchFor({});
    const d = await buildDossier(33.31, 44.37, { trackers: TRACKERS, points: POINTS }, { fetchImpl: f.impl, geocodeCache: null, factsCache: null, limiter: noWait, wikidataLimiter: noWait });
    expect(d.place).toBeNull();
    expect(d.facts).toBeNull();
    expect(d.trackers).toEqual([]);
    expect(d.nearby).toHaveLength(1);
    expect(d.degraded).toEqual(['geocode']);
  });
});

describe('E4 review fixes', () => {
  it('requests Nominatim at city zoom', async () => {
    const { impl, calls } = fetchFor({ [NOMINATIM_URL]: { status: 200, body: NOMINATIM_OK } });
    await reverseGeocode(33.3, 44.4, { fetchImpl: impl, geocodeCache: null, limiter: noWait });
    expect(calls[0]).toContain('zoom=10');
  });

  it('a known country code spends no geocoding request and is never overridden', async () => {
    const wrong = { display_name: 'Somewhere, France', address: { country: 'France', country_code: 'fr' } };
    const { impl, calls } = fetchFor({ [NOMINATIM_URL]: { status: 200, body: wrong }, [WIKIDATA_SPARQL_URL]: { status: 200, body: WD_OK }, [WIKIPEDIA_SUMMARY_URL]: { status: 200, body: WIKI_OK } });
    const d = await buildDossier(0, 179.9, { trackers: TRACKERS, points: POINTS, countryCode: 'iq' }, { fetchImpl: impl, geocodeCache: null, factsCache: null, extractCache: null, limiter: noWait, wikidataLimiter: noWait });
    expect(calls.some(u => u.startsWith(NOMINATIM_URL))).toBe(false);
    expect(d.place?.countryCode).toBe('IQ');
    expect(d.degraded).not.toContain('geocode');
    expect(d.trackers.map(t => t.slug)).toEqual(['iran-conflict', 'iraq-history']);
  });

  it('merges Wikidata rows deterministically instead of trusting the first row', () => {
    const rows = { results: { bindings: [
      { countryLabel: { value: 'Iraq' }, flag: { value: 'https://commons/flag-a.svg' } },
      { countryLabel: { value: 'Iraq' }, capitalLabel: { value: 'Baghdad' }, headOfStateLabel: { value: 'Abdul Latif Rashid' } },
      { countryLabel: { value: 'Iraq' }, capitalLabel: { value: 'Other Capital' }, population: { value: '43533592' } },
    ] } };
    const f = parseWikidataFacts(rows, 'IQ')!;
    expect(f).toMatchObject({ capital: 'Baghdad', headOfState: 'Abdul Latif Rashid', population: 43533592, flagUrl: 'https://commons/flag-a.svg' });
    expect(countryFactsQuery('IQ')).toContain('LIMIT 20');
  });

  it('rate-limits Wikidata through the injected limiter', async () => {
    const scheduled: number[] = [];
    const limiter = { schedule: async <T,>(fn: () => Promise<T>) => { scheduled.push(1); return fn(); } };
    const { impl } = fetchFor({ [WIKIDATA_SPARQL_URL]: { status: 200, body: WD_OK } });
    await countryFacts('IQ', { fetchImpl: impl, factsCache: null, wikidataLimiter: limiter as never });
    expect(scheduled).toHaveLength(1);
  });

  it('fetches the Wikipedia extract and degrades when it fails', async () => {
    expect(wikipediaTitle('https://en.wikipedia.org/wiki/Iraq')).toBe('Iraq');
    expect(wikipediaTitle('https://es.wikipedia.org/wiki/Irak')).toBeNull();
    expect(parseWikipediaSummary({ extract: '  ' })).toBeNull();
    const ok = fetchFor({ [WIKIPEDIA_SUMMARY_URL]: { status: 200, body: WIKI_OK } });
    expect(await wikipediaExtract('https://en.wikipedia.org/wiki/Iraq', { fetchImpl: ok.impl, extractCache: null })).toBe('Iraq is a country in West Asia.');
    expect(ok.calls[0]).toBe(`${WIKIPEDIA_SUMMARY_URL}/Iraq`);
    const down = fetchFor({ [NOMINATIM_URL]: { status: 200, body: NOMINATIM_OK }, [WIKIDATA_SPARQL_URL]: { status: 200, body: WD_OK }, [WIKIPEDIA_SUMMARY_URL]: { status: 503 } });
    const d = await buildDossier(33.3, 44.4, { trackers: TRACKERS, points: POINTS }, { fetchImpl: down.impl, geocodeCache: null, factsCache: null, extractCache: null, limiter: noWait, wikidataLimiter: noWait });
    expect(d.extract).toBeNull();
    expect(d.degraded).toEqual(['extract']);
    expect(d.facts?.capital).toBe('Baghdad');
  });
});
