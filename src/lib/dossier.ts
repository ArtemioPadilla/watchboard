/**
 * dossier.ts — "what is here?" for a point on the globe or the map.
 *
 * Right-click (or long-press) anywhere and the page answers with the
 * country, a few facts about it, the Watchboard trackers that cover it and
 * the nearest curated events. Modelled on OSIRIS's region-dossier route,
 * but run in the browser against public endpoints with caching and a
 * 1 req/s limiter so a public static site stays inside Nominatim's usage
 * policy. Every provider is optional: when one fails, the dossier still
 * renders what the others returned and names what is missing in
 * `degraded`.
 *
 * All network and storage access is injectable so the composition is unit
 * tested without the network; the live tests (RUN_LIVE_TESTS=1) hit the
 * real endpoints.
 */
import { createRateLimiter, type RateLimiter } from './rate-limiter';
import { countryName } from './country-names';

export interface GeoPlace {
  countryCode: string | null;   // ISO 3166-1 alpha-2, upper case
  country: string | null;
  state: string | null;
  city: string | null;
  displayName: string | null;
}

export interface CountryFacts {
  code: string;
  name: string;
  capital: string | null;
  population: number | null;
  headOfState: string | null;
  headOfGovernment: string | null;
  flagUrl: string | null;
  wikipediaUrl: string | null;
}

export interface DossierTracker {
  slug: string;
  name: string;
  country?: string;
  geoPath?: string[];
  region?: string;
  lastUpdated?: string;
  activity?: number;
}

export interface GeoIndexPoint {
  slug: string;
  id: string;
  label: string;
  date: string;
  lat: number;
  lon: number;
}

export interface NearbyEvent extends GeoIndexPoint {
  distanceKm: number;
}

export type DossierProvider = 'geocode' | 'facts' | 'extract';

export interface Dossier {
  lat: number;
  lon: number;
  place: GeoPlace | null;
  facts: CountryFacts | null;
  trackers: DossierTracker[];
  nearby: NearbyEvent[];
  degraded: DossierProvider[];
  fetchedAt: number;
  /** First paragraph of the country's English Wikipedia article, or null. */
  extract: string | null;
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface DossierDeps {
  fetchImpl?: typeof fetch;
  /** 24 h cache for reverse geocoding (sessionStorage in the browser). */
  geocodeCache?: KeyValueStore | null;
  /** 7 d cache for country facts (localStorage in the browser). */
  factsCache?: KeyValueStore | null;
  now?: () => number;
  limiter?: RateLimiter;
  /** Sent as the `email` parameter Nominatim asks large sites to include. */
  contact?: string;
  wikidataLimiter?: RateLimiter;
  extractCache?: KeyValueStore | null;
}

export const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse';
export const WIKIDATA_SPARQL_URL = 'https://query.wikidata.org/sparql';
export const GEOCODE_TTL_MS = 24 * 3_600_000;
export const FACTS_TTL_MS = 7 * 24 * 3_600_000;
export const WIKIPEDIA_SUMMARY_URL = 'https://en.wikipedia.org/api/rest_v1/page/summary';
/** Nominatim zoom 10 = city level; zoom 5 only ever returned the state. */
export const NOMINATIM_ZOOM = '10';
export const NEARBY_RADIUS_KM = 300;
export const NEARBY_LIMIT = 5;

/** Shared limiter: one Nominatim request per second per page. */
const defaultLimiter = createRateLimiter(1100);
// Wikidata's query service asks for well-behaved clients too; one request
// per second is far below their limits and stops a click storm.
const defaultWikidataLimiter = createRateLimiter(1000);

function memoryStore(): KeyValueStore {
  const m = new Map<string, string>();
  return { getItem: k => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); } };
}

function safeStore(kind: 'session' | 'local'): KeyValueStore | null {
  try {
    const s = typeof window !== 'undefined' ? (kind === 'session' ? window.sessionStorage : window.localStorage) : null;
    if (!s) return null;
    // Some contexts throw on access; probe once.
    s.getItem('__probe');
    return s;
  } catch {
    return null;
  }
}

function readCache<T>(store: KeyValueStore | null | undefined, key: string, ttl: number, now: number): T | null {
  if (!store) return null;
  try {
    const raw = store.getItem(key);
    if (!raw) return null;
    const { t, v } = JSON.parse(raw) as { t: number; v: T };
    return now - t < ttl ? v : null;
  } catch {
    return null;
  }
}

function writeCache(store: KeyValueStore | null | undefined, key: string, value: unknown, now: number): void {
  if (!store) return;
  try { store.setItem(key, JSON.stringify({ t: now, v: value })); } catch { /* quota or private mode */ }
}

/** Cache key rounded to 0.1° (~11 km): the country does not change inside that. */
export function geocodeKey(lat: number, lon: number): string {
  return `wb:geocode:${(Math.round(lat * 10) / 10).toFixed(1)},${(Math.round(lon * 10) / 10).toFixed(1)}`;
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function parseNominatim(payload: unknown): GeoPlace | null {
  const a = (payload as any)?.address;
  if (!a || typeof a !== 'object') return null;
  const code = typeof a.country_code === 'string' ? a.country_code.toUpperCase() : null;
  return {
    countryCode: code && /^[A-Z]{2}$/.test(code) ? code : null,
    country: typeof a.country === 'string' ? a.country : (code ? countryName(code) : null),
    state: typeof a.state === 'string' ? a.state : typeof a.region === 'string' ? a.region : null,
    city: typeof a.city === 'string' ? a.city : typeof a.town === 'string' ? a.town : typeof a.village === 'string' ? a.village : null,
    displayName: typeof (payload as any).display_name === 'string' ? (payload as any).display_name : null,
  };
}

/**
 * Reverse geocodes with Nominatim at zoom 10 (city level; state and
 * country come back in the same address). The
 * browser sets its own User-Agent (Nominatim's docs ask for one, but the
 * header is forbidden to scripts); the Referer identifies the site.
 */
export async function reverseGeocode(lat: number, lon: number, deps: DossierDeps = {}): Promise<GeoPlace | null> {
  const now = deps.now ?? Date.now;
  const store = deps.geocodeCache === undefined ? safeStore('session') : deps.geocodeCache;
  const key = geocodeKey(lat, lon);
  const cached = readCache<GeoPlace>(store, key, GEOCODE_TTL_MS, now());
  if (cached) return cached;
  const limiter = deps.limiter ?? defaultLimiter;
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
  const params = new URLSearchParams({ format: 'jsonv2', lat: lat.toFixed(4), lon: lon.toFixed(4), zoom: NOMINATIM_ZOOM, 'accept-language': 'en' });
  if (deps.contact) params.set('email', deps.contact);
  const res = await limiter.schedule(() => fetchImpl(`${NOMINATIM_URL}?${params}`, { headers: { Accept: 'application/json' } }));
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
  const place = parseNominatim(await res.json());
  if (!place) throw new Error('Nominatim: no address in response');
  writeCache(store, key, place, now());
  return place;
}

export function countryFactsQuery(code: string): string {
  return `SELECT ?country ?countryLabel ?capitalLabel ?population ?headOfStateLabel ?headOfGovLabel ?flag ?article WHERE {
  ?country wdt:P297 "${code}" .
  OPTIONAL { ?country wdt:P36 ?capital . }
  OPTIONAL { ?country wdt:P1082 ?population . }
  OPTIONAL { ?country wdt:P35 ?headOfState . }
  OPTIONAL { ?country wdt:P6 ?headOfGov . }
  OPTIONAL { ?country wdt:P41 ?flag . }
  OPTIONAL { ?article schema:about ?country ; schema:isPartOf <https://en.wikipedia.org/> . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
} LIMIT 20`;
}

/**
 * Several independent OPTIONALs multiply rows (two capitals × two flags…),
 * so a single row can pair values from different statements. Merge across
 * rows in order: the first non-empty value per field wins, which is stable
 * for a given response.
 */
export function parseWikidataFacts(payload: unknown, code: string): CountryFacts | null {
  const rows = (payload as any)?.results?.bindings;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const v = (k: string): string | null => {
    for (const row of rows) {
      const val = row?.[k]?.value;
      if (typeof val === 'string' && val.trim()) return val;
    }
    return null;
  };
  const pop = v('population');
  return {
    code,
    name: v('countryLabel') ?? countryName(code),
    capital: v('capitalLabel'),
    population: pop !== null && Number.isFinite(Number(pop)) ? Math.round(Number(pop)) : null,
    headOfState: v('headOfStateLabel'),
    headOfGovernment: v('headOfGovLabel'),
    flagUrl: v('flag'),
    wikipediaUrl: v('article'),
  };
}

export async function countryFacts(code: string, deps: DossierDeps = {}): Promise<CountryFacts | null> {
  if (!/^[A-Z]{2}$/.test(code)) return null;
  const now = deps.now ?? Date.now;
  const store = deps.factsCache === undefined ? safeStore('local') : deps.factsCache;
  const key = `wb:facts:${code}`;
  const cached = readCache<CountryFacts>(store, key, FACTS_TTL_MS, now());
  if (cached) return cached;
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
  const limiter = deps.wikidataLimiter ?? defaultWikidataLimiter;
  const url = `${WIKIDATA_SPARQL_URL}?format=json&query=${encodeURIComponent(countryFactsQuery(code))}`;
  const res = await limiter.schedule(() => fetchImpl(url, { headers: { Accept: 'application/sparql-results+json' } }));
  if (!res.ok) throw new Error(`Wikidata HTTP ${res.status}`);
  const facts = parseWikidataFacts(await res.json(), code);
  if (facts) writeCache(store, key, facts, now());
  return facts;
}

/** Title of the English Wikipedia article from its URL, or null. */
export function wikipediaTitle(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = /^https:\/\/en\.wikipedia\.org\/wiki\/([^#?]+)/.exec(url);
  return m ? decodeURIComponent(m[1]) : null;
}

export function parseWikipediaSummary(payload: unknown): string | null {
  const ex = (payload as any)?.extract;
  return typeof ex === 'string' && ex.trim() ? ex.trim() : null;
}

/**
 * First paragraph of the country's Wikipedia article (REST summary
 * endpoint, CORS-enabled, CC BY-SA). Cached 7 days alongside the facts.
 */
export async function wikipediaExtract(articleUrl: string, deps: DossierDeps = {}): Promise<string | null> {
  const title = wikipediaTitle(articleUrl);
  if (!title) return null;
  const now = deps.now ?? Date.now;
  const store = deps.extractCache === undefined ? safeStore('local') : deps.extractCache;
  const key = `wb:extract:${title}`;
  const cached = readCache<string>(store, key, FACTS_TTL_MS, now());
  if (cached) return cached;
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
  const res = await fetchImpl(`${WIKIPEDIA_SUMMARY_URL}/${encodeURIComponent(title)}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Wikipedia HTTP ${res.status}`);
  const extract = parseWikipediaSummary(await res.json());
  if (extract) writeCache(store, key, extract, now());
  return extract;
}

/** Trackers whose `country` or `geoPath` names the country; most active first. */
export function trackersForCountry(code: string | null, trackers: DossierTracker[]): DossierTracker[] {
  if (!code) return [];
  const c = code.toUpperCase();
  return trackers
    .filter(t => (t.country && t.country.toUpperCase() === c) || (t.geoPath ?? []).some(seg => seg.toUpperCase() === c))
    .sort((a, b) => (b.activity ?? 0) - (a.activity ?? 0) || (b.lastUpdated ?? '').localeCompare(a.lastUpdated ?? ''));
}

export function eventsNear(lat: number, lon: number, points: GeoIndexPoint[], radiusKm = NEARBY_RADIUS_KM, limit = NEARBY_LIMIT): NearbyEvent[] {
  const out: NearbyEvent[] = [];
  for (const p of points) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue;
    // Cheap bbox reject before the trig.
    if (Math.abs(p.lat - lat) > radiusKm / 111 + 0.5) continue;
    const d = haversineKm(lat, lon, p.lat, p.lon);
    if (d <= radiusKm) out.push({ ...p, distanceKm: Math.round(d) });
  }
  return out.sort((a, b) => a.distanceKm - b.distanceKm || b.date.localeCompare(a.date)).slice(0, limit);
}

/**
 * Composes the dossier. Geocoding and facts are fetched in sequence
 * (facts need the country code) but each failure is isolated: the result
 * always comes back, with `degraded` naming what could not be fetched.
 */
export async function buildDossier(
  lat: number,
  lon: number,
  ctx: { trackers: DossierTracker[]; points: GeoIndexPoint[]; countryCode?: string | null },
  deps: DossierDeps = {},
): Promise<Dossier> {
  const now = deps.now ?? Date.now;
  const degraded: DossierProvider[] = [];
  let place: GeoPlace | null = null;
  const known = ctx.countryCode && /^[A-Za-z]{2}$/.test(ctx.countryCode) ? ctx.countryCode.toUpperCase() : null;
  if (known) {
    // A country-polygon click already knows the country: no geocoding
    // request is spent, and a bbox-centroid landing in the wrong place can
    // never override the code the reader actually clicked.
    place = { countryCode: known, country: countryName(known), state: null, city: null, displayName: null };
  } else {
    try {
      place = await reverseGeocode(lat, lon, deps);
    } catch {
      degraded.push('geocode');
    }
  }
  const code = known ?? place?.countryCode ?? null;
  let facts: CountryFacts | null = null;
  let extract: string | null = null;
  if (code) {
    try {
      facts = await countryFacts(code, deps);
      if (!facts) degraded.push('facts');
    } catch {
      degraded.push('facts');
    }
    if (facts?.wikipediaUrl) {
      try {
        extract = await wikipediaExtract(facts.wikipediaUrl, deps);
        if (!extract) degraded.push('extract');
      } catch {
        degraded.push('extract');
      }
    }
  }
  return {
    lat, lon, place, facts, extract,
    trackers: trackersForCountry(code, ctx.trackers),
    nearby: eventsNear(lat, lon, ctx.points),
    degraded,
    fetchedAt: now(),
  };
}

export const _internal = { memoryStore };
