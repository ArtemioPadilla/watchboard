/**
 * gazetteer.ts — geolocate a headline from Watchboard's own data.
 *
 * The 5,800+ map points, each tracker's `map.center`/`city` and the
 * country table already name every place the trackers care about. A
 * gazetteer built from them resolves "Explosión en Kharkiv esta madrugada"
 * to a coordinate without any external service, so a light-scan candidate
 * can reach the globe and the alerts panel with a pin before triage
 * (plan E6.H1). No match means `undefined`, never a default centre.
 *
 * Pure and browser-safe: building from disk lives in
 * scripts/lib/gazetteer-node.ts.
 */
import { COUNTRY_ALIASES, COUNTRY_CENTROIDS, COUNTRY_NAMES } from './country-names';

export type GazetteerKind = 'point' | 'center' | 'country';

export interface GazetteerEntry {
  name: string;
  normalized: string;
  lat: number;
  lon: number;
  trackers: string[];
  kind: GazetteerKind;
  aliases: string[];
}

export interface Gazetteer {
  version: 1;
  generatedAt: string;
  entries: GazetteerEntry[];
}

export interface GeoparseResult {
  lat: number;
  lon: number;
  place: string;
  confidence: number;
  method: 'gazetteer';
  kind: GazetteerKind;
}

export interface GazetteerTrackerInput {
  slug: string;
  country?: string;
  city?: string;
  state?: string;
  map?: { center?: { lat: number; lon: number } };
  points?: { label: string; lat: number; lon: number }[];
}

/** Shortest name we will ever match; "Kyiv" is 4, "Gaza" is 4. */
export const MIN_NAME_LENGTH = 4;
/** Longest label we still treat as a place name (in words). */
const MAX_NAME_WORDS = 5;

/**
 * Generic words that appear as map-point labels but are not places on
 * their own ("Centro", "Norte", "Airport"). Compared after normalisation.
 */
export const GAZETTEER_STOPWORDS = new Set<string>([
  'centro', 'center', 'centre', 'norte', 'north', 'sur', 'south', 'este', 'east', 'oeste', 'west',
  'ciudad', 'city', 'capital', 'frontera', 'border', 'puerto', 'port', 'airport', 'aeropuerto',
  'base', 'camp', 'campo', 'zona', 'zone', 'area', 'region', 'district', 'distrito', 'provincia', 'province',
  'unknown', 'desconocido', 'various', 'nationwide', 'national', 'nacional', 'global', 'world', 'mundo',
  'strike', 'attack', 'ataque', 'explosion', 'explosión', 'hospital', 'school', 'escuela', 'university',
  'court', 'parliament', 'palace', 'palacio', 'plaza', 'square', 'bridge', 'puente', 'river', 'rio', 'lake',
  'island', 'isla', 'strait', 'gulf', 'sea', 'ocean', 'mar', 'vessel', 'ship', 'cargo', 'tanker',
  'headquarters', 'ministry', 'embassy', 'embajada', 'station', 'estación', 'plant', 'refinery', 'dam',
]);

/**
 * Ordinary words of the four site languages that also occur as map-point
 * labels or aliases; never matched on their own.
 */
export const COMMON_WORDS = new Set<string>([
  'este', 'esta', 'esto', 'para', 'pero', 'como', 'todo', 'toda', 'nada', 'cada', 'sobre', 'entre', 'desde', 'hasta', 'donde', 'cuando', 'mucho', 'poco',
  'with', 'from', 'that', 'this', 'they', 'them', 'have', 'will', 'were', 'been', 'more', 'most', 'some', 'into', 'over', 'after', 'before', 'about', 'their', 'there', 'where', 'while',
  'avec', 'dans', 'pour', 'mais', 'tout', 'tous', 'plus', 'sans', 'sous', 'vers', 'chez', 'entre', 'apres', 'avant', 'comme', 'elle', 'nous', 'vous', 'leur',
  'como', 'para', 'pelo', 'pela', 'mais', 'muito', 'pouco', 'onde', 'quando', 'sobre', 'entre', 'desde', 'todos', 'todas',
  'south', 'north', 'east', 'west', 'central', 'union', 'state', 'states', 'city', 'general', 'national', 'international', 'republic', 'kingdom',
]);

/**
 * Words that mark a map-point label as an event title or an institution
 * rather than a place. Compared per word after normalisation.
 */
export const NON_PLACE_WORDS = new Set<string>([
  'strike', 'strikes', 'struck', 'attack', 'attacks', 'ataque', 'explosion', 'blast', 'raid', 'talks', 'summit', 'ceasefire', 'election', 'elections',
  'protest', 'protests', 'march', 'rally', 'vessel', 'cargo', 'tanker', 'ship', 'court', 'ministry', 'embassy', 'headquarters', 'company', 'corporation',
  'institute', 'university', 'hospital', 'school', 'center', 'centre', 'agency', 'commission', 'council', 'parliament', 'assembly', 'office', 'bank',
  'launch', 'launched', 'landing', 'test', 'tests', 'drill', 'exercise', 'deal', 'meeting', 'visit', 'report', 'verdict', 'trial', 'arrest', 'detention',
]);

/** Lowercase, strip diacritics and punctuation, collapse whitespace. */
export function normalizeName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/[^a-z0-9' -]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Turn a map-point label into a candidate place name: drop the trailing
 * "(Day 99)"/"(2024)" and anything after an em dash or " - " separator
 * ("Kuwait International Airport — IRGC Strike (Day 96)" → "Kuwait
 * International Airport"). Returns null for labels that are not names.
 */
export function placeNameFromLabel(label: string): string | null {
  let s = label.replace(/\s*\([^)]*\)\s*$/, '');
  s = s.split(/\s+[—–]\s+|\s+-\s+|:\s+/)[0];
  s = s.replace(/^(the|el|la|los|las|le|les|o|a|os|as)\s+/i, '').trim();
  if (!s) return null;
  const norm = normalizeName(s);
  if (norm.length < MIN_NAME_LENGTH) return null;
  const words = norm.split(' ');
  if (words.length > MAX_NAME_WORDS) return null;
  if (GAZETTEER_STOPWORDS.has(norm) || COMMON_WORDS.has(norm)) return null;
  if (/^\d/.test(norm)) return null;
  // Event titles and institutions ("US Supreme Court", "Cargo Vessel Struck",
  // "Ceasefire Talks") are not places: any non-place word disqualifies the label.
  if (words.some(w => NON_PLACE_WORDS.has(w))) return null;
  return s;
}

function upsert(map: Map<string, GazetteerEntry>, e: GazetteerEntry): void {
  const key = `${e.kind}|${e.normalized}|${e.trackers[0] ?? ''}`;
  const existing = map.get(key);
  if (!existing) { map.set(key, e); return; }
  for (const a of e.aliases) if (!existing.aliases.includes(a)) existing.aliases.push(a);
}

/**
 * Build the gazetteer from tracker inputs. Same name in two trackers stays
 * as two entries (ambiguity is preserved; `geoparse` prefers the matched
 * tracker). Country entries carry every alias in COUNTRY_ALIASES.
 */
export function buildGazetteer(trackers: GazetteerTrackerInput[], now: Date = new Date()): Gazetteer {
  const map = new Map<string, GazetteerEntry>();
  const countriesSeen = new Set<string>();
  for (const t of trackers) {
    for (const p of t.points ?? []) {
      if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue;
      const name = placeNameFromLabel(p.label);
      if (!name) continue;
      upsert(map, { name, normalized: normalizeName(name), lat: p.lat, lon: p.lon, trackers: [t.slug], kind: 'point', aliases: [] });
    }
    const c = t.map?.center;
    if (c && Number.isFinite(c.lat) && Number.isFinite(c.lon)) {
      for (const local of [t.city, t.state]) {
        if (!local) continue;
        const norm = normalizeName(local);
        if (norm.length < MIN_NAME_LENGTH || GAZETTEER_STOPWORDS.has(norm)) continue;
        upsert(map, { name: local, normalized: norm, lat: c.lat, lon: c.lon, trackers: [t.slug], kind: 'center', aliases: [] });
      }
    }
    if (t.country) countriesSeen.add(t.country.toUpperCase());
  }
  // Countries: every code we know, so a headline about a country without a
  // tracker still geolocates (at low confidence).
  for (const code of Object.keys(COUNTRY_NAMES)) {
    const centroid = COUNTRY_CENTROIDS[code];
    if (!centroid) continue;
    const display = COUNTRY_NAMES[code];
    const aliases = [...new Set([display, ...(COUNTRY_ALIASES[code] ?? [])])];
    const slugs = trackers.filter((t) => t.country?.toUpperCase() === code).map((t) => t.slug);
    upsert(map, { name: display, normalized: normalizeName(display), lat: centroid.lat, lon: centroid.lon, trackers: slugs, kind: 'country', aliases });
  }
  const entries = [...map.values()].sort((a, b) => b.normalized.length - a.normalized.length || a.normalized.localeCompare(b.normalized));
  return { version: 1, generatedAt: now.toISOString(), entries };
}

interface Compiled {
  entry: GazetteerEntry;
  /** Normalised alias that produced this candidate. */
  alias: string;
}

const compiledCache = new WeakMap<Gazetteer, Compiled[]>();

function compile(gz: Gazetteer): Compiled[] {
  let c = compiledCache.get(gz);
  if (c) return c;
  c = [];
  for (const entry of gz.entries) {
    const names = new Set<string>([entry.normalized, ...entry.aliases.map(normalizeName)]);
    for (const alias of names) {
      if (alias.length < MIN_NAME_LENGTH || GAZETTEER_STOPWORDS.has(alias) || COMMON_WORDS.has(alias)) continue;
      c.push({ entry, alias });
    }
  }
  // Longest alias first so "Kuwait International Airport" beats "Kuwait".
  c.sort((a, b) => b.alias.length - a.alias.length || a.alias.localeCompare(b.alias));
  compiledCache.set(gz, c);
  return c;
}

const KIND_CONFIDENCE: Record<GazetteerKind, number> = { point: 0.9, center: 0.85, country: 0.6 };

function containsWord(haystack: string, needle: string): boolean {
  let i = haystack.indexOf(needle);
  while (i !== -1) {
    const before = i === 0 ? ' ' : haystack[i - 1];
    const after = i + needle.length >= haystack.length ? ' ' : haystack[i + needle.length];
    if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after)) return true;
    i = haystack.indexOf(needle, i + 1);
  }
  return false;
}

/**
 * Resolve the first (longest) known place mentioned in `text`. Entries of
 * `matchedTracker` win over the same name elsewhere; a point beats a centre
 * beats a country when both are mentioned. Returns undefined when nothing
 * known appears.
 */
/**
 * Confidence of one candidate. Ownership by the matched tracker is the
 * primary signal: an owned entry of any kind outranks every foreign one, so
 * "Georgia" with matchedTracker 'georgia-crisis' is the country, not a US
 * state map point from another tracker. Among candidates of the same
 * ownership a point beats a centre beats a country.
 */
export function candidateConfidence(entry: GazetteerEntry, matchedTracker: string | null | undefined): number {
  const own = !!matchedTracker && entry.trackers.includes(matchedTracker);
  const base = KIND_CONFIDENCE[entry.kind];
  if (own) return Math.max(base, 0.8);
  // Foreign-tracker points and centres are real coordinates but weak
  // evidence about *this* headline: they drop below a country centroid, so a
  // plain "Mexico" resolves to the country, not to another tracker's
  // "Mexico" map point, when nobody owns the name.
  return entry.kind === 'country' ? base : base - 0.4;
}

export function geoparse(text: string, matchedTracker: string | null | undefined, gz: Gazetteer): GeoparseResult | undefined {
  const hay = ` ${normalizeName(text)} `;
  if (hay.trim().length < MIN_NAME_LENGTH) return undefined;
  let best: { c: Compiled; score: number } | null = null;
  for (const c of compile(gz)) {
    if (!containsWord(hay, c.alias)) continue;
    const own = !!matchedTracker && c.entry.trackers.includes(matchedTracker);
    const conf = candidateConfidence(c.entry, matchedTracker);
    // Rank: ownership, then confidence, then alias length (specificity).
    const score = (own ? 10_000 : 0) + conf * 1000 + c.alias.length;
    if (!best || score > best.score) best = { c, score };
  }
  if (!best) return undefined;
  const e = best.c.entry;
  const conf = candidateConfidence(e, matchedTracker);
  return { lat: e.lat, lon: e.lon, place: e.name, confidence: Math.round(conf * 100) / 100, method: 'gazetteer', kind: e.kind };
}
