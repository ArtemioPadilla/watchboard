#!/usr/bin/env tsx
/**
 * refresh-layers.ts — regenerates public/geo/layers/*.geojson from their
 * public sources, stamping `_provenance` (plan E5.H3). Modelled on
 * OSIRIS's ArcGIS loader, but run at build/maintenance time so the site
 * ships frozen, attributed data instead of querying a server per visit.
 *
 * Usage:
 *   npx tsx scripts/geo/refresh-layers.ts                 # all layers
 *   npx tsx scripts/geo/refresh-layers.ts --layer nuclear-plants
 *   npx tsx scripts/geo/refresh-layers.ts --check          # validate files, no network
 *   npx tsx scripts/geo/refresh-layers.ts --check --layer radio-towers  # validate one file only
 *
 * radio-towers env vars:
 *   RADIO_TOWERS_ACCEPT_DROP=CC,CC  # comma-separated ISO2 codes: skip the
 *     suspicious-drop check (new count < 20% of previous) for these codes on
 *     this run only. For a *verified* drop — towers actually destroyed, an
 *     area query legitimately shrinking — that would otherwise keep getting
 *     rejected as "suspicious" and stuck on stale data indefinitely. Wired to
 *     the `accept_drop` workflow_dispatch input in refresh-radio-layers.yml.
 *     Logs a ::notice:: line per code used; see parseAcceptDropEnv.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GeoLayerSchema, RADIO_TOWERS_MAX_AGE_DAYS, type GeoLayer, type CountryProvenance } from '../../src/lib/geo-layer-schema';
// Node-only loader (see scripts/lib/load-trackers-node.ts): src/lib/tracker-registry.ts
// uses import.meta.glob, which is Vite-only and throws under plain `tsx` execution.
import { loadAllTrackers } from '../lib/load-trackers-node';
import { loadRadioOverrides, applyRadioOverrides } from '../../src/lib/radio-overrides';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT_DIR = resolve(ROOT, 'public/geo/layers');

type Adapter = { id: string; run: (now: string) => Promise<GeoLayer> };


/** Pure: Wikidata SPARQL bindings → point features, deduped by QID, rows without a parsable point dropped. */
export function wikidataPlantsToFeatures(rows: any[]): GeoLayer['features'] {
  const seen = new Set<string>();
  return rows.flatMap(r => {
    const qid = String(r.plant?.value ?? '').split('/').pop() ?? '';
    const m = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(r.coord?.value ?? '');
    if (!qid || !m || seen.has(qid)) return [];
    seen.add(qid);
    return [{
      type: 'Feature' as const,
      id: qid,
      properties: {
        name: r.plantLabel?.value ?? qid,
        country: r.countryLabel?.value ?? null,
        capacityMW: r.capacity?.value ? Number(r.capacity.value) : null,
        status: r.statusLabel?.value ?? null,
        opened: r.opened?.value ? String(r.opened.value).slice(0, 10) : null,
        wikidata: `https://www.wikidata.org/wiki/${qid}`,
      },
      geometry: { type: 'Point' as const, coordinates: [Number(m[1]), Number(m[2])] },
    }];
  });
}

/** Pure: submarinecablemap.com cable-geo payload → line features (landing points and other geometries dropped). */
export function cableGeoToFeatures(fc: any): GeoLayer['features'] {
  if (!Array.isArray(fc?.features)) throw new Error('unexpected cable payload');
  return fc.features
    .filter((f: any) => f?.geometry?.type === 'MultiLineString' || f?.geometry?.type === 'LineString')
    .map((f: any) => ({
      type: 'Feature' as const,
      id: f.properties?.id ?? f.id,
      properties: { name: f.properties?.name ?? null, color: f.properties?.color ?? null, slug: f.properties?.slug ?? null },
      geometry: f.geometry,
    }));
}

/** Pure: Overpass node elements tagged communication:radio → point features, deduped by id, elements without lat/lon dropped. `countryCode` (when supplied) is the ISO code of the area query that produced the elements. */
export function overpassTowersToFeatures(elements: any[], countryCode?: string): GeoLayer['features'] {
  const seen = new Set<string>();
  return elements.flatMap((el) => {
    if (el?.type !== 'node' || typeof el.lat !== 'number' || typeof el.lon !== 'number') return [];
    const id = String(el.id);
    if (seen.has(id)) return [];
    seen.add(id);
    const tags = el.tags ?? {};
    return [{
      type: 'Feature' as const,
      id,
      properties: {
        osmId: id,
        name: tags.name ?? null,
        heightM: tags.height ? Number.parseFloat(tags.height) || null : null,
        radioBand: String(tags['communication:radio'] ?? ''),
        countryCode: countryCode ?? null,
      },
      geometry: { type: 'Point' as const, coordinates: [el.lon, el.lat] },
    }];
  });
}

/**
 * Pure: caps towers at `cap` per `properties.countryCode`, never mixing
 * countries into one another's slice. Within a country, named towers sort
 * before unnamed ones, then by `heightM` descending, then `osmId` ascending
 * (deterministic tie-break). Country groups appear in first-seen order.
 */
export function capTowersPerCountry(features: GeoLayer['features'], cap: number): GeoLayer['features'] {
  const groups = new Map<string, GeoLayer['features']>();
  for (const f of features) {
    const cc = String((f.properties as any)?.countryCode ?? '');
    if (!groups.has(cc)) groups.set(cc, []);
    groups.get(cc)!.push(f);
  }
  const compare = (a: GeoLayer['features'][number], b: GeoLayer['features'][number]) => {
    const ap = a.properties as any;
    const bp = b.properties as any;
    const aNamed = ap.name != null;
    const bNamed = bp.name != null;
    if (aNamed !== bNamed) return aNamed ? -1 : 1;
    const aHeight = typeof ap.heightM === 'number' ? ap.heightM : -Infinity;
    const bHeight = typeof bp.heightM === 'number' ? bp.heightM : -Infinity;
    if (aHeight !== bHeight) return bHeight - aHeight;
    return Number(ap.osmId) - Number(bp.osmId);
  };
  const result: GeoLayer['features'] = [];
  for (const feats of groups.values()) {
    result.push(...[...feats].sort(compare).slice(0, cap));
  }
  return result;
}

/** Wikidata: every item that is an instance of "nuclear power plant" (Q134447) with coordinates. */
const nuclearPlants: Adapter = {
  id: 'nuclear-plants',
  async run(now) {
    const query = `SELECT ?plant ?plantLabel ?countryLabel ?coord ?capacity ?statusLabel ?opened WHERE {
  ?plant wdt:P31 wd:Q134447 ; wdt:P625 ?coord .
  OPTIONAL { ?plant wdt:P17 ?country }
  OPTIONAL { ?plant wdt:P2109 ?capacity }
  OPTIONAL { ?plant wdt:P5817 ?status }
  OPTIONAL { ?plant wdt:P1619 ?opened }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
} LIMIT 1500`;
    const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { Accept: 'application/sparql-results+json', 'User-Agent': 'Watchboard/geo-refresh (https://watchboard.dev)' } });
    if (!res.ok) throw new Error(`Wikidata HTTP ${res.status}`);
    const rows: any[] = (await res.json()).results.bindings;
    const features = wikidataPlantsToFeatures(rows);
    return {
      type: 'FeatureCollection',
      _provenance: {
        id: 'nuclear-plants', source: 'Wikidata', url: 'https://query.wikidata.org/', license: 'CC0 1.0',
        attribution: 'Nuclear power plants: Wikidata (CC0)', retrievedAt: now,
        transform: 'SPARQL: instances of Q134447 with P625; label, country, P2109 capacity, P5817 status, P1619 opened',
        featureCount: features.length,
      },
      features,
    };
  },
};

/** TeleGeography's public cable geometry, as served by submarinecablemap.com. */
const submarineCables: Adapter = {
  id: 'submarine-cables',
  async run(now) {
    const url = 'https://www.submarinecablemap.com/api/v3/cable/cable-geo.json';
    const res = await fetch(url, { headers: { 'User-Agent': 'Watchboard/geo-refresh (https://watchboard.dev)' } });
    if (!res.ok) throw new Error(`submarinecablemap HTTP ${res.status}`);
    const fc = await res.json();
    const features = cableGeoToFeatures(fc);
    return {
      type: 'FeatureCollection',
      _provenance: {
        id: 'submarine-cables', source: 'TeleGeography Submarine Cable Map', url,
        license: 'CC BY-NC-SA 3.0', attribution: 'Submarine cables © TeleGeography (submarinecablemap.com), CC BY-NC-SA 3.0', retrievedAt: now,
        transform: 'Line geometries and name/color only; landing points dropped',
        featureCount: features.length,
      },
      features,
    };
  },
};

/** Ten maritime chokepoints, curated (coordinates from public reference works). */
const CHOKEPOINTS = [
  ['Strait of Hormuz', 56.50, 26.57, 'Persian Gulf ↔ Gulf of Oman; ~20% of global oil trade'],
  ['Bab-el-Mandeb', 43.33, 12.58, 'Red Sea ↔ Gulf of Aden; Suez route'],
  ['Suez Canal', 32.35, 30.45, 'Mediterranean ↔ Red Sea'],
  ['Strait of Malacca', 100.90, 2.50, 'Indian Ocean ↔ South China Sea'],
  ['Taiwan Strait', 119.80, 24.30, 'East China Sea ↔ South China Sea'],
  ['Bosporus', 29.05, 41.12, 'Black Sea ↔ Sea of Marmara'],
  ['Dardanelles', 26.40, 40.20, 'Sea of Marmara ↔ Aegean'],
  ['Strait of Gibraltar', -5.60, 35.95, 'Atlantic ↔ Mediterranean'],
  ['Panama Canal', -79.80, 9.10, 'Atlantic ↔ Pacific'],
  ['Danish Straits', 10.80, 55.90, 'Baltic ↔ North Sea'],
] as const;

const chokepoints: Adapter = {
  id: 'maritime-chokepoints',
  async run(now) {
    const features = CHOKEPOINTS.map(([name, lon, lat, note], i) => ({
      type: 'Feature' as const,
      id: `cp-${i + 1}`,
      properties: { name, note },
      geometry: { type: 'Point' as const, coordinates: [lon, lat] },
    }));
    return {
      type: 'FeatureCollection',
      _provenance: {
        id: 'maritime-chokepoints', source: 'Watchboard curated (EIA "World Oil Transit Chokepoints", CIA World Factbook)',
        url: 'https://www.eia.gov/international/analysis/special-topics/World_Oil_Transit_Chokepoints',
        license: 'MIT (Watchboard curated data)', attribution: 'Chokepoints: Watchboard curated, after EIA/CIA reference works', retrievedAt: now,
        transform: 'Hand-curated centre points',
        featureCount: features.length,
      },
      features,
    };
  },
};

/** Union of `map.radioCountryCodes` from every tracker that opted into the "radio-towers" layer. */
function radioTowerCountryCodes(): string[] {
  const codes = new Set<string>();
  for (const t of loadAllTrackers()) {
    if (!t.map?.staticLayers?.includes('radio-towers')) continue;
    for (const c of t.map.radioCountryCodes ?? []) codes.add(c);
  }
  return [...codes];
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** True when an Overpass response body is a 200 carrying a server-side timeout, e.g. `{"remark":"runtime error: Query timed out in ... after 120 s.","elements":[]}`. Overpass answers these with HTTP 200, so status alone can't detect them. */
function isOverpassRuntimeError(body: any): boolean {
  return typeof body?.remark === 'string' && body.remark.includes('runtime error');
}

/**
 * Builds the combined query: resolve the country's ISO3166-1 area, count it
 * (`.a out count;`, so a caller can tell "area matched, zero towers" apart
 * from "area didn't match at all" in the same request), then the tower
 * nodes within it. `strict` includes `[admin_level=2]`; some ISO codes
 * (e.g. Palestine: `boundary=disputed`, no `admin_level` tag) only resolve
 * without it.
 */
function buildTowerAreaQuery(cc: string, strict: boolean): string {
  const areaFilter = strict ? `["ISO3166-1"="${cc}"][admin_level=2]` : `["ISO3166-1"="${cc}"]`;
  return `[out:json][timeout:120];area${areaFilter}->.a;.a out count;node["man_made"~"^(tower|mast)$"]["communication:radio"]["communication:radio"!~"^no$"](area.a);out body;`;
}

/**
 * Splits an Overpass response's `elements` into the `.a out count;` result
 * and the actual node elements. `areaCount` is `null` (not `0`) when no
 * `type: "count"` element is present — e.g. a query that never asked for a
 * count — so callers only treat an explicit, measured zero as "no area
 * matched", never the absence of the question.
 */
function splitAreaCountAndNodes(elements: any[]): { areaCount: number | null; nodes: any[] } {
  let areaCount: number | null = null;
  const nodes: any[] = [];
  for (const el of elements) {
    if (el?.type === 'count') areaCount = Number(el.tags?.areas ?? el.tags?.total ?? 0);
    else nodes.push(el);
  }
  return { areaCount, nodes };
}

/**
 * One Overpass area+count+nodes query for a country's ISO 3166-1 code.
 * Retries once after 30s when the response is HTTP 429/504, *or* HTTP 200
 * with a `remark` reporting a server-side "runtime error" (Overpass's own
 * [timeout:…] budget exceeded) — that shape is a failure disguised as
 * success and must not be read as "zero towers". If it still fails after
 * the retry, throws (the caller then fails the whole adapter, leaving the
 * previous file untouched).
 *
 * Separately: `["ISO3166-1"="<cc>"][admin_level=2]` can match *zero areas*
 * with a clean HTTP 200 — the query succeeds, it just resolved nothing (e.g.
 * Palestine's OSM relation is `boundary=disputed` without an `admin_level`
 * tag). That is a failed lookup, not "the country has zero towers", so when
 * the strict selector's measured area count is 0, this retries once more
 * with the country code alone (no `admin_level` filter); if that also
 * measures zero areas, it throws instead of silently returning `[]`.
 *
 * The retry targets a fallback mirror (`OVERPASS_FALLBACK_URL`), not the
 * primary host again — a 429/504/runtime-error is often the primary host
 * itself being overloaded, so retrying the same host tends to repeat the
 * failure. `opts` overrides both URLs for tests.
 *
 * Every request carries `AbortSignal.timeout(150_000)` — Overpass's own
 * query budget is `[timeout:120]`, so 150s gives it 30s of slack to answer
 * before Node gives up on a hung connection; an abort is treated exactly
 * like a 429/504 (retryable, once, against the mirror), not a hard failure.
 *
 * `opts.hasBudget`, when supplied, is checked before the mirror retry *and*
 * before the non-strict (area-empty) fallback attempt — both add real wall
 * time (a 30s sleep, another round trip), and if the run's own time budget
 * is already spent there is no point starting either: better to fail this
 * country immediately and leave its previous data in place than to spend
 * the run's last minutes on one country's retry chain.
 *
 * `sleepFn` is injectable so tests don't wait 30s.
 */
export const OVERPASS_PRIMARY_URL = 'https://overpass-api.de/api/interpreter';
// Verified live 2026-09-22. overpass.kumi.systems and overpass.private.coffee
// were tried and failed — do not swap in either of those.
export const OVERPASS_FALLBACK_URL = 'https://maps.mail.ru/osm/tools/overpass/api/interpreter';
const OVERPASS_FETCH_TIMEOUT_MS = 150_000;

export interface OverpassUrlOpts {
  primaryUrl?: string;
  fallbackUrl?: string;
  /** True while the run's own wall-clock budget still has room. Defaults to always-true (unconstrained) when omitted. */
  hasBudget?: () => boolean;
}

function isAbortError(e: unknown): boolean {
  const name = (e as { name?: string } | undefined)?.name;
  return name === 'AbortError' || name === 'TimeoutError';
}

export async function fetchOverpassCountryTowers(cc: string, sleepFn: (ms: number) => Promise<void> = sleep, opts: OverpassUrlOpts = {}): Promise<any[]> {
  const primaryUrl = opts.primaryUrl ?? OVERPASS_PRIMARY_URL;
  const fallbackUrl = opts.fallbackUrl ?? OVERPASS_FALLBACK_URL;
  const hasBudget = opts.hasBudget ?? (() => true);
  const doFetch = (query: string, url: string) => fetch(url, {
    method: 'POST',
    headers: { 'User-Agent': 'Watchboard/geo-refresh (https://watchboard.dev)', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(OVERPASS_FETCH_TIMEOUT_MS),
  });

  // One attempt for a given query against a given host: returns the area
  // count + node elements, or a retryable reason string when the response
  // is a 429/504, a disguised-as-200 Overpass runtime error, or the request
  // itself timed out / was aborted.
  const attempt = async (query: string, url: string): Promise<{ areaCount: number | null; nodes: any[] } | { retryReason: string }> => {
    let res: Response;
    try {
      res = await doFetch(query, url);
    } catch (e) {
      if (isAbortError(e)) return { retryReason: `timeout after ${OVERPASS_FETCH_TIMEOUT_MS / 1000}s` };
      throw e;
    }
    if (res.status === 429 || res.status === 504) return { retryReason: `HTTP ${res.status}` };
    if (!res.ok) throw new Error(`Overpass HTTP ${res.status} for ${cc}`);
    const body = await res.json();
    if (isOverpassRuntimeError(body)) return { retryReason: `runtime error: ${body.remark}` };
    return splitAreaCountAndNodes(body.elements ?? []);
  };

  // One area selector (strict or fallback), with the 429/504/runtime-error/
  // timeout retry-once-against-the-mirror behavior above — independent of
  // the area-empty fallback below. Skips the mirror retry (no 30s sleep,
  // no second request) when the run's time budget is already spent.
  const runSelector = async (strict: boolean): Promise<{ areaCount: number | null; nodes: any[] }> => {
    const query = buildTowerAreaQuery(cc, strict);
    let result = await attempt(query, primaryUrl);
    if ('retryReason' in result) {
      if (!hasBudget()) throw new Error(`Overpass failed for ${cc} (${result.retryReason}); skipping mirror retry — time budget exhausted`);
      await sleepFn(30_000);
      result = await attempt(query, fallbackUrl);
      if ('retryReason' in result) throw new Error(`Overpass failed for ${cc} after retry (${result.retryReason})`);
    }
    return result;
  };

  let { areaCount, nodes } = await runSelector(true);
  if (areaCount === 0) {
    if (!hasBudget()) throw new Error(`Overpass matched no area for ISO3166-1=${cc} with admin_level=2; skipping the non-strict fallback — time budget exhausted`);
    ({ areaCount, nodes } = await runSelector(false));
    if (areaCount === 0) throw new Error(`Overpass matched no area for ISO3166-1=${cc} (tried with and without admin_level=2) — a code that matches no area is a failed lookup, not zero towers`);
  }
  return nodes;
}

/** True when a country's new tower count looks like a bad fetch rather than a real drop: the previous count was at least 10 and the new count is under 20% of it. Below 10, small absolute swings (e.g. 3 → 1) are not evidence of anything. */
export function isSuspiciousDrop(prevCount: number, nextCount: number): boolean {
  return prevCount >= 10 && nextCount < prevCount * 0.2;
}

export type CountryFetchResult =
  | { ok: true; features: GeoLayer['features'] }
  | { ok: false; reason: string };

// Declared here (not down by runRadioTowers) so mergeCountryTowers's
// suspicious-drop comparison and runRadioTowers's capTowersPerCountry call
// share one constant.
const RADIO_TOWERS_CAP = 800;

/**
 * Extracts the ISO 3166-1 codes a legacy (pre-`_provenance.countries`)
 * `radio-towers.geojson` actually queried, from its
 * `transform: "... (ISO3166-1: AF, PK, ...) for nodes ..."` string. The
 * legacy adapter was all-or-nothing — every code it queried either produced
 * the whole file or the run failed outright — so every code in this list
 * was fetched successfully at the file's top-level `retrievedAt`, including
 * ones that matched zero towers (e.g. PS, IL, BF, NE, YE): a code being
 * *listed* is what proves it was tried, not how many features it produced.
 * Returns an empty set when the transform doesn't match the expected shape.
 */
export function parseLegacyTransformCodes(transform: string | undefined): Set<string> {
  const m = /ISO3166-1:\s*([A-Z, ]+)\)/.exec(transform ?? '');
  if (!m) return new Set();
  return new Set(m[1].split(',').map((s) => s.trim()).filter(Boolean));
}

/**
 * Per-country merge: a country's new data replaces the old only when the
 * fetch succeeded *and* the new count isn't a suspicious drop (or the code
 * is listed in `acceptDropCodes` — the `RADIO_TOWERS_ACCEPT_DROP` escape
 * hatch for a genuine, verified drop, e.g. towers actually destroyed).
 * Every other case — fetch failure, suspicious drop, or the code missing
 * from `results` entirely because the time budget ran out before reaching
 * it — keeps that country's previous features and previous `retrievedAt`
 * (or `null` if it has never succeeded) and is marked `stale`. A country's
 * data is never dropped because of a failed fetch; the worst case is
 * "unchanged from last time", never "gone".
 *
 * `previous` features are NOT deduped against fresh results here (see
 * `dedupeByOsmId` in `runRadioTowers`, which runs on the full merged set —
 * a duplicate OSM id split across a fresh country and a stale carried-over
 * country still needs first-country-wins treatment).
 */
export function mergeCountryTowers(args: {
  previous: GeoLayer | null;
  results: Map<string, CountryFetchResult>;
  codes: string[];
  now: string;
  /** RADIO_TOWERS_ACCEPT_DROP escape hatch: codes to skip the suspicious-drop check for. See parseAcceptDropEnv. */
  acceptDropCodes?: Set<string>;
}): { features: GeoLayer['features']; countries: Record<string, CountryProvenance>; staleReasons: Record<string, string>; acceptedDrops: string[] } {
  const { previous, results, codes, now, acceptDropCodes } = args;
  const prevCountries = (previous?._provenance.countries ?? {}) as Record<string, CountryProvenance>;
  // Migration: a previous file written before _provenance.countries existed
  // has no per-country record at all. Without this, every country in that
  // file would look "never retrieved" (null) the first time this code runs
  // against it, turning the very first post-migration run red even though
  // the underlying data is only as old as the whole file's retrievedAt.
  const legacyPrevious = previous != null && previous._provenance.countries == null;
  const legacyCodes = legacyPrevious ? parseLegacyTransformCodes(previous!._provenance.transform) : new Set<string>();
  const prevFeaturesByCountry = new Map<string, GeoLayer['features']>();
  for (const f of previous?.features ?? []) {
    const cc = String((f.properties as any)?.countryCode ?? '');
    if (!prevFeaturesByCountry.has(cc)) prevFeaturesByCountry.set(cc, []);
    prevFeaturesByCountry.get(cc)!.push(f);
  }

  const features: GeoLayer['features'] = [];
  const countries: Record<string, CountryProvenance> = {};
  const staleReasons: Record<string, string> = {};
  const acceptedDrops: string[] = [];

  const keepStale = (cc: string, reason: string) => {
    const prevFeats = prevFeaturesByCountry.get(cc) ?? [];
    let prevRetrievedAt: string | null;
    if (prevCountries[cc]) {
      prevRetrievedAt = prevCountries[cc].retrievedAt;
    } else if (legacyPrevious && legacyCodes.has(cc)) {
      // This code was queried by the legacy (all-or-nothing) adapter —
      // being listed in its transform is what proves it was fetched
      // successfully, regardless of how many features it produced.
      prevRetrievedAt = previous!._provenance.retrievedAt;
    } else {
      prevRetrievedAt = null;
    }
    features.push(...prevFeats);
    countries[cc] = { retrievedAt: prevRetrievedAt, count: prevFeats.length, status: 'stale' };
    staleReasons[cc] = reason;
  };

  for (const cc of codes) {
    const result = results.get(cc);
    if (!result) {
      keepStale(cc, 'time budget exhausted');
      continue;
    }
    if (!result.ok) {
      keepStale(cc, result.reason);
      continue;
    }
    const prevFeats = prevFeaturesByCountry.get(cc) ?? [];
    const prevCount = prevCountries[cc]?.count ?? prevFeats.length;
    // nextCount is PRE-dedup (result.features.length, straight off this
    // country's own fetch) while prevCount is POST-dedup (recomputed after
    // dedupeByOsmId + capTowersPerCountry in the run that produced it, see
    // runRadioTowers) — not perfectly apples-to-apples, but cross-country
    // duplicates are rare enough at borders that this approximation is fine.
    const nextCount = result.features.length;
    // prevCount is always post-cap (see runRadioTowers), so cap nextCount
    // the same way before comparing — apples-to-apples by construction,
    // rather than an uncapped raw fetch size against a capped baseline.
    const nextCountForDrop = Math.min(nextCount, RADIO_TOWERS_CAP);
    if (isSuspiciousDrop(prevCount, nextCountForDrop)) {
      if (acceptDropCodes?.has(cc)) {
        acceptedDrops.push(cc);
      } else {
        keepStale(cc, `suspicious drop: ${prevCount} → ${nextCountForDrop} (< 20% of previous)`);
        continue;
      }
    }
    features.push(...result.features);
    countries[cc] = { retrievedAt: now, count: nextCount, status: 'fresh' };
  }

  return { features, countries, staleReasons, acceptedDrops };
}

const RADIO_TOWERS_MAX_AGE_MS = RADIO_TOWERS_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
const RADIO_TOWERS_MAX_STALE_RATIO = 0.2;

/**
 * Health rule: unhealthy if any country has never succeeded (`retrievedAt`
 * `null`) or is older than 35 days, or if more than 20% of countries are
 * `stale` in this run. `problems` names every offending country so the
 * `::error::` line in main() is actionable, not just "something's wrong".
 */
export function assessRadioTowerHealth(countries: Record<string, CountryProvenance>, now: string): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  const codes = Object.keys(countries).sort();
  const nowMs = new Date(now).getTime();
  let staleCount = 0;
  for (const cc of codes) {
    const c = countries[cc];
    if (c.status === 'stale') staleCount++;
    if (c.retrievedAt === null) {
      problems.push(`${cc}: never retrieved`);
      continue;
    }
    const ageMs = nowMs - new Date(c.retrievedAt).getTime();
    if (ageMs > RADIO_TOWERS_MAX_AGE_MS) {
      problems.push(`${cc}: stale for ${Math.floor(ageMs / (24 * 60 * 60 * 1000))} days`);
    }
  }
  if (codes.length > 0) {
    const staleRatio = staleCount / codes.length;
    if (staleRatio > RADIO_TOWERS_MAX_STALE_RATIO) {
      problems.push(`${staleCount}/${codes.length} countries stale (${Math.round(staleRatio * 100)}%)`);
    }
  }
  return { ok: problems.length === 0, problems };
}

const RADIO_TOWERS_BUDGET_MS = 20 * 60 * 1000;
const RADIO_TOWERS_GAP_MS = 5_000;

/**
 * Global OSM-id dedup across every country's contribution to the merged set
 * (fresh results and stale carried-over features alike) — first occurrence
 * wins. `mergeCountryTowers` iterates `codes` in order and pushes each
 * country's features exactly once, so "first occurrence in the array" is
 * exactly "first country in `codes` order": a node returned by two
 * countries' area queries (plausible at contested/shared borders, e.g.
 * SD/SS, IN/PK, MD/UA, IR/IQ) is kept only for whichever country comes
 * first in `codes`, instead of being counted — and capped against — twice.
 */
export function dedupeByOsmId(features: GeoLayer['features']): GeoLayer['features'] {
  const seen = new Set<string>();
  const result: GeoLayer['features'] = [];
  for (const f of features) {
    const id = String(f.id);
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(f);
  }
  return result;
}

/**
 * `RADIO_TOWERS_ACCEPT_DROP` escape hatch: a comma-separated list of ISO2
 * codes (env var, wired to the `accept_drop` workflow_dispatch input) whose
 * suspicious-drop check should be skipped for one run — for a *verified*
 * drop (towers actually destroyed, an area query legitimately shrinking)
 * that would otherwise keep getting silently rejected as "suspicious" run
 * after run. Case-insensitive, trimmed, empty/unset → no codes.
 */
export function parseAcceptDropEnv(value: string | undefined): Set<string> {
  if (!value) return new Set();
  return new Set(value.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean));
}

/**
 * Top-level `_provenance.retrievedAt` for the merged file. `now` only when
 * *every* country is fresh — if any country is stale, stamping `now` would
 * claim the whole file was retrieved today even though part of it might be
 * weeks old, which is exactly the kind of thing the `/sources` table and
 * the globe's layer label exist to prevent. Falls back to the oldest
 * non-null country `retrievedAt` instead. A file that got past main()'s
 * "no features" guard always has at least one country with data, and any
 * country with data has a non-null `retrievedAt` (see `mergeCountryTowers`),
 * so `now` is only used as a defensive fallback for the (should-be
 * impossible) case of no countries or no non-null retrievedAt at all.
 */
export function radioTowersTopLevelRetrievedAt(countries: Record<string, CountryProvenance>, now: string): string {
  const values = Object.values(countries);
  if (values.length === 0 || values.every((c) => c.status === 'fresh')) return now;
  const nonNull = values.map((c) => c.retrievedAt).filter((v): v is string => v != null);
  if (nonNull.length === 0) return now;
  return nonNull.reduce((oldest, cur) => (cur < oldest ? cur : oldest));
}

export interface RadioTowersRunDeps {
  codes: string[];
  previous: GeoLayer | null;
  fetchFn?: (cc: string, sleepFn?: (ms: number) => Promise<void>, opts?: OverpassUrlOpts) => Promise<any[]>;
  sleepFn?: (ms: number) => Promise<void>;
  /** Wall clock in ms, injectable so the 20-minute budget never makes a test wait. */
  clock?: () => number;
  budgetMs?: number;
  gapMs?: number;
  /** RADIO_TOWERS_ACCEPT_DROP escape hatch codes — see parseAcceptDropEnv. */
  acceptDropCodes?: Set<string>;
  /** Sink for one `::warning::radio-towers <CC> stale: <reason>` line per stale country. Printed unconditionally (green or red run) — defaults to console.warn. */
  warnFn?: (msg: string) => void;
  /** Sink for `::notice::` lines when RADIO_TOWERS_ACCEPT_DROP overrides a suspicious drop. Defaults to console.log. */
  noticeFn?: (msg: string) => void;
}

export interface RadioTowersRunResult {
  layer: GeoLayer;
  /** Per-country stale reasons from mergeCountryTowers, kept alongside the layer since they aren't part of the persisted schema (operational detail, not data) — GeoLayerSchema.parse would silently strip them if smuggled onto the layer object itself. Consumed by runAndWriteRadioTowers to fold into the ::error:: line on an unhealthy run. */
  staleReasons: Record<string, string>;
}

/**
 * The per-country fetch loop, pulled out of the `Adapter` so the budget
 * clock, sleep and fetch function are all injectable for tests. Stops
 * *starting* new country queries once `budgetMs` of wall time has elapsed
 * since the loop began; codes not yet reached are simply absent from
 * `results`, so `mergeCountryTowers` marks them stale with "time budget
 * exhausted" and keeps their previous data — the run still produces a file,
 * just a partially-refreshed one. Also passes a live `hasBudget()` check
 * into `fetchFn` so a single country's own retry chain (mirror retry,
 * area-empty fallback) can bail early once the budget is already spent,
 * rather than a `runRadioTowers`-level budget that only stops *starting*
 * new countries but lets an in-flight one run arbitrarily long.
 *
 * Applies `dedupeByOsmId` across the whole merged set (fresh and stale
 * carried-over features together, first country in `codes` order wins)
 * before `capTowersPerCountry`, so a node claimed by two countries' area
 * queries at a shared border is never double-counted or double-capped.
 *
 * Country counts in the returned provenance are recomputed after dedup and
 * `capTowersPerCountry` so `_provenance.countries[cc].count` always matches
 * the features actually shipped for that country (not the pre-cap,
 * pre-dedup fetch size) — otherwise a country with a very active OSM
 * community, or one sharing border nodes with a neighbor, could report a
 * count larger than what a reader (or the health check's next run) can
 * actually see in the file.
 *
 * Prints one `::warning::radio-towers <CC> stale: <reason>` line per stale
 * country (unconditionally — a green run can still have individually stale
 * countries under the 20% ratio) and one `::notice::` line per country
 * whose suspicious-drop check was overridden by `RADIO_TOWERS_ACCEPT_DROP`.
 */
export async function runRadioTowers(now: string, deps: RadioTowersRunDeps): Promise<RadioTowersRunResult> {
  const {
    codes, previous,
    fetchFn = fetchOverpassCountryTowers,
    sleepFn = sleep,
    clock = Date.now,
    budgetMs = RADIO_TOWERS_BUDGET_MS,
    gapMs = RADIO_TOWERS_GAP_MS,
    acceptDropCodes,
    warnFn = console.warn,
    noticeFn = console.log,
  } = deps;

  const start = clock();
  const results = new Map<string, CountryFetchResult>();
  for (let i = 0; i < codes.length; i++) {
    if (clock() - start >= budgetMs) break; // remaining codes stay out of `results` → stale, "time budget exhausted"
    if (i > 0) await sleepFn(gapMs);
    const cc = codes[i];
    try {
      const elements = await fetchFn(cc, sleepFn, { hasBudget: () => clock() - start < budgetMs });
      results.set(cc, { ok: true, features: overpassTowersToFeatures(elements, cc) });
    } catch (e) {
      results.set(cc, { ok: false, reason: (e as Error).message });
    }
  }

  const merged = mergeCountryTowers({ previous, results, codes, now, acceptDropCodes });

  for (const cc of merged.acceptedDrops) {
    noticeFn(`::notice::radio-towers accepted a large drop for ${cc} (RADIO_TOWERS_ACCEPT_DROP)`);
  }
  for (const cc of Object.keys(merged.staleReasons).sort()) {
    warnFn(`::warning::radio-towers ${cc} stale: ${merged.staleReasons[cc]}`);
  }

  const deduped = dedupeByOsmId(merged.features);
  const features = capTowersPerCountry(deduped, RADIO_TOWERS_CAP);

  const cappedCounts = new Map<string, number>();
  for (const f of features) {
    const cc = String((f.properties as any)?.countryCode ?? '');
    cappedCounts.set(cc, (cappedCounts.get(cc) ?? 0) + 1);
  }
  const countries: Record<string, CountryProvenance> = {};
  for (const [cc, prov] of Object.entries(merged.countries)) {
    countries[cc] = { ...prov, count: cappedCounts.get(cc) ?? 0 };
  }

  const topRetrievedAt = radioTowersTopLevelRetrievedAt(countries, now);

  const layer: GeoLayer = {
    type: 'FeatureCollection',
    _provenance: {
      id: 'radio-towers', source: 'OpenStreetMap (Overpass API)', url: 'https://overpass-api.de/api/interpreter',
      license: 'ODbL 1.0', attribution: 'Radio towers: © OpenStreetMap contributors, ODbL', retrievedAt: topRetrievedAt,
      transform: `Per-country Overpass area queries (ISO3166-1: ${codes.join(', ')}) for nodes tagged man_made=tower|mast with communication:radio set, capped at ${RADIO_TOWERS_CAP} towers per country (named first, then heightM descending, then osmId ascending). A country whose fetch failed, whose new count looked suspiciously low, or that fell outside the 20-minute time budget keeps its previous data — see _provenance.countries for per-country freshness.`,
      featureCount: features.length,
      countries,
    },
    features,
  };

  return { layer, staleReasons: merged.staleReasons };
}

function readPreviousLayer(id: string): GeoLayer | null {
  const p = resolve(OUT_DIR, `${id}.geojson`);
  if (!existsSync(p)) return null;
  try {
    return validateLayerFile(p);
  } catch (e) {
    console.warn(`[geo] previous ${id}.geojson failed to validate, treating as no prior data: ${(e as Error).message}`);
    return null;
  }
}

/**
 * Overpass: communication towers/masts (radio broadcast, not generic cell
 * masts — communication:radio must be set), one area query per country code
 * declared by every tracker with "radio-towers" in map.staticLayers. Queries
 * are spaced ≥5s apart. Per-country merge means a single country's failure
 * never takes down the whole layer — see `mergeCountryTowers` and
 * `runRadioTowers`. This `Adapter` wrapper is kept for `--check`'s id
 * iteration and as a plain, uninstrumented fallback; the real write+health
 * cycle main() actually runs is `runAndWriteRadioTowers` below.
 */
const radioTowers: Adapter = {
  id: 'radio-towers',
  async run(now) {
    const codes = radioTowerCountryCodes();
    if (codes.length === 0) throw new Error('no tracker has "radio-towers" in map.staticLayers');
    const previous = readPreviousLayer('radio-towers');
    const acceptDropCodes = parseAcceptDropEnv(process.env.RADIO_TOWERS_ACCEPT_DROP);
    const { layer } = await runRadioTowers(now, { codes, previous, acceptDropCodes });
    return layer;
  },
};

export interface RunAndWriteRadioTowersDeps {
  codes?: string[];
  /** Explicit previous layer (including `null` for "no prior data"). Omit entirely to read from disk. */
  previous?: GeoLayer | null;
  readPreviousFn?: (id: string) => GeoLayer | null;
  runFn?: (now: string, deps: RadioTowersRunDeps) => Promise<RadioTowersRunResult>;
  acceptDropCodes?: Set<string>;
  writeFileFn?: (path: string, data: string) => void;
  logFn?: (msg: string) => void;
  warnFn?: (msg: string) => void;
  noticeFn?: (msg: string) => void;
  errorFn?: (msg: string) => void;
  outDir?: string;
}

/**
 * The full radio-towers write+health cycle, pulled out of main()'s generic
 * per-adapter loop — unlike the other five layers, radio-towers is the one
 * with per-country health semantics, a stale-reasons summary, and an
 * ::error:: line that needs to write the file *and* still report failure.
 * Exported (and every side effect injectable) so a test can call it
 * directly and assert both halves of that contract: the file gets written
 * even when the run is unhealthy — per-country merge means a bad run still
 * ships a file that is strictly better than the one it replaces — and the
 * return value still reports `{ ok: false }` so main() exits non-zero.
 */
export async function runAndWriteRadioTowers(now: string, deps: RunAndWriteRadioTowersDeps = {}): Promise<{ ok: boolean }> {
  const {
    codes = radioTowerCountryCodes(),
    readPreviousFn = readPreviousLayer,
    runFn = runRadioTowers,
    acceptDropCodes = parseAcceptDropEnv(process.env.RADIO_TOWERS_ACCEPT_DROP),
    writeFileFn = writeFileSync,
    logFn = console.log,
    warnFn = console.warn,
    noticeFn = console.log,
    errorFn = console.error,
    outDir = OUT_DIR,
  } = deps;
  try {
    if (codes.length === 0) throw new Error('no tracker has "radio-towers" in map.staticLayers');
    const previous = 'previous' in deps ? deps.previous! : readPreviousFn('radio-towers');
    const { layer: rawLayer, staleReasons } = await runFn(now, { codes, previous, acceptDropCodes, warnFn, noticeFn });
    const layer = GeoLayerSchema.parse(rawLayer);
    if (layer.features.length === 0) throw new Error('adapter returned no features; refusing to overwrite');
    const out = resolve(outDir, 'radio-towers.geojson');
    writeFileFn(out, JSON.stringify(layer) + '\n');
    logFn(`[geo] wrote radio-towers: ${layer.features.length} features → ${out} (${(Buffer.byteLength(JSON.stringify(layer)) / 1024).toFixed(0)} KB)`);
    // Per-country merge means the file above is written even when unhealthy
    // — it's still strictly better than the one it replaced. Health is
    // assessed after the write, not instead of it.
    if (layer._provenance.countries) {
      const health = assessRadioTowerHealth(layer._provenance.countries, now);
      if (!health.ok) {
        const reasonText = Object.entries(staleReasons)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([cc, reason]) => `${cc}: ${reason}`)
          .join('; ');
        errorFn(`::error::radio-towers unhealthy: ${health.problems.join('; ')}${reasonText ? ` | reasons: ${reasonText}` : ''}`);
        return { ok: false };
      }
    }
    return { ok: true };
  } catch (e) {
    errorFn(`[geo] radio-towers failed: ${(e as Error).message}`);
    return { ok: false };
  }
}

// Two-part match (not a single regex): station names put the unit word
// ("FM"/"MHz") after other text, e.g. "101.5 Kiss FM" — a single regex
// requiring the unit immediately after the number misses that case.
const FREQ_NUM_RE = /\b(\d{2,3}(?:\.\d{1,2})?)\b/;
const FREQ_UNIT_RE = /\b(?:fm|mhz)\b/i;

/** Pure: radio-browser.info station rows → point features. Drops non-HTTPS streams, unsupported codecs, stations without geo coordinates or failing their last check; dedupes by stationuuid. */
export function radioBrowserToFeatures(rows: any[]): GeoLayer['features'] {
  const seen = new Set<string>();
  return rows.flatMap((r) => {
    const uuid = String(r.stationuuid ?? '');
    if (!uuid || seen.has(uuid)) return [];
    if (r.lastcheckok !== 1) return [];
    if (typeof r.geo_lat !== 'number' || typeof r.geo_long !== 'number') return [];
    const url = String(r.url_resolved ?? '');
    if (!url.startsWith('https://')) return [];
    const codec = String(r.codec ?? '').toUpperCase();
    if (codec !== 'MP3' && codec !== 'AAC') return [];
    seen.add(uuid);
    const name = String(r.name ?? '');
    const numMatch = FREQ_NUM_RE.exec(name);
    const freqLabel = numMatch && FREQ_UNIT_RE.test(name) ? `${numMatch[1]} FM` : null;
    return [{
      type: 'Feature' as const,
      id: uuid,
      properties: {
        stationUuid: uuid,
        name: r.name ?? uuid,
        country: r.country ?? null,
        countryCode: r.countrycode ?? null,
        language: r.language || null,
        freqLabel,
        streamUrl: url,
        codec,
        votes: typeof r.votes === 'number' ? r.votes : 0,
      },
      geometry: { type: 'Point' as const, coordinates: [r.geo_long, r.geo_lat] },
    }];
  });
}

/** Country codes every radio-enabled tracker asks radio-browser.info for. */
function radioCountryCodes(): string[] {
  const codes = new Set<string>();
  for (const t of loadAllTrackers()) {
    if (!t.map?.staticLayers?.includes('radio-stations')) continue;
    for (const c of t.map.radioCountryCodes ?? []) codes.add(c);
  }
  return [...codes];
}

const radioStations: Adapter = {
  id: 'radio-stations',
  async run(now) {
    const codes = radioCountryCodes();
    if (codes.length === 0) throw new Error('no tracker declares map.radioCountryCodes for "radio-stations"');
    const rows: any[] = [];
    for (const cc of codes) {
      const res = await fetch(`https://all.api.radio-browser.info/json/stations/bycountrycodeexact/${cc}?hidebroken=true&is_https=true`, {
        headers: { 'User-Agent': 'Watchboard/geo-refresh (https://watchboard.dev)' },
      });
      if (!res.ok) throw new Error(`radio-browser HTTP ${res.status} for ${cc}`);
      rows.push(...(await res.json()));
    }
    const features = applyRadioOverrides(radioBrowserToFeatures(rows), loadRadioOverrides());
    return {
      type: 'FeatureCollection',
      _provenance: {
        id: 'radio-stations', source: 'radio-browser.info', url: 'https://www.radio-browser.info/',
        license: 'PDDL 1.0 (directory); each stream is subject to its own broadcaster terms', attribution: 'Stations: radio-browser.info community directory (PDDL 1.0)', retrievedAt: now,
        transform: `Country codes from every tracker's map.radioCountryCodes (${codes.join(', ')}); HTTPS MP3/AAC streams with geo coordinates and a passing last check only`,
        featureCount: features.length,
      },
      features,
    };
  },
};

/** Worldwide station layer for the homepage globe: top 500 by votes, same HTTPS/MP3/AAC/geo filters as the per-tracker layer, no country scoping. */
const radioStationsGlobal: Adapter = {
  id: 'radio-stations-global',
  async run(now) {
    const url = 'https://all.api.radio-browser.info/json/stations/search?has_geo_info=true&is_https=true&hidebroken=true&order=votes&reverse=true&limit=500';
    const res = await fetch(url, { headers: { 'User-Agent': 'Watchboard/geo-refresh (https://watchboard.dev)' } });
    if (!res.ok) throw new Error(`radio-browser HTTP ${res.status}`);
    const rows: any[] = await res.json();
    const features = applyRadioOverrides(radioBrowserToFeatures(rows), loadRadioOverrides());
    return {
      type: 'FeatureCollection',
      _provenance: {
        id: 'radio-stations-global', source: 'radio-browser.info', url,
        license: 'PDDL 1.0 (directory); each stream is subject to its own broadcaster terms', attribution: 'Stations: radio-browser.info community directory (PDDL 1.0)', retrievedAt: now,
        transform: 'top 500 by votes worldwide, HTTPS MP3/AAC with geo coordinates',
        featureCount: features.length,
      },
      features,
    };
  },
};

const ADAPTERS: Adapter[] = [nuclearPlants, submarineCables, chokepoints, radioTowers, radioStations, radioStationsGlobal];

export function validateLayerFile(path: string): GeoLayer {
  return GeoLayerSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const only = args.includes('--layer') ? args[args.indexOf('--layer') + 1] : null;
  mkdirSync(OUT_DIR, { recursive: true });
  if (args.includes('--check')) {
    let bad = 0;
    for (const a of ADAPTERS) {
      if (only && a.id !== only) continue; // --check respects --layer, same as the fetch path
      const p = resolve(OUT_DIR, `${a.id}.geojson`);
      if (!existsSync(p)) { console.error(`[geo] missing ${p}`); bad++; continue; }
      try { const l = validateLayerFile(p); console.log(`[geo] ok ${a.id}: ${l.features.length} features, retrieved ${l._provenance.retrievedAt}`); }
      catch (e) { console.error(`[geo] invalid ${a.id}: ${(e as Error).message}`); bad++; }
    }
    process.exit(bad ? 1 : 0);
  }
  const now = new Date().toISOString();
  let failed = 0;
  for (const a of ADAPTERS) {
    if (only && a.id !== only) continue;
    // radio-towers has its own write+health cycle (per-country provenance,
    // stale-reasons summary, writes-even-when-unhealthy contract) — see
    // runAndWriteRadioTowers's own doc comment for why it isn't the generic
    // path below.
    if (a.id === 'radio-towers') {
      const { ok } = await runAndWriteRadioTowers(now);
      if (!ok) failed++;
      continue;
    }
    try {
      const layer = GeoLayerSchema.parse(await a.run(now));
      if (layer.features.length === 0) throw new Error('adapter returned no features; refusing to overwrite');
      const out = resolve(OUT_DIR, `${a.id}.geojson`);
      writeFileSync(out, JSON.stringify(layer) + '\n');
      console.log(`[geo] wrote ${a.id}: ${layer.features.length} features → ${out} (${(Buffer.byteLength(JSON.stringify(layer)) / 1024).toFixed(0)} KB)`);
    } catch (e) {
      console.error(`[geo] ${a.id} failed: ${(e as Error).message}`);
      failed++;
    }
  }
  process.exit(failed ? 1 : 0);
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
