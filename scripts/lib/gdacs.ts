/**
 * gdacs.ts — GDACS (Global Disaster Alert and Coordination System, EU/JRC)
 * RSS ingestion for the light scan (plan E5.H2).
 *
 * GDACS publishes geocoded alerts (earthquakes, floods, cyclones,
 * volcanoes, wildfires, droughts) with an alert level (Green/Orange/Red)
 * under CC BY 4.0, but without CORS, so the browser cannot read it. The
 * light scan runs every 15 minutes anyway: it fetches the feed, keeps
 * Orange and Red alerts of the last 7 days, writes a small JSON for the
 * globe/map layer, and turns each into a Candidate that already carries
 * its coordinates (feedOrigin 'gdacs', tier 1, geo from georss:point).
 *
 * Pure parsing (fast-xml-parser, same as hourly-scan.ts) so the fixture
 * test covers the field mapping.
 */
import { XMLParser } from 'fast-xml-parser';
import type { Candidate } from '../hourly-types';

export type GdacsEventType = 'EQ' | 'TC' | 'FL' | 'VO' | 'WF' | 'DR' | 'TS' | 'OTHER';
export type GdacsLevel = 'Green' | 'Orange' | 'Red';

export interface GdacsAlert {
  id: string;            // guid, e.g. EQ1563876
  eventId: string;
  eventType: GdacsEventType;
  level: GdacsLevel;
  title: string;
  url: string;
  country: string | null;
  iso3: string | null;
  lat: number;
  lon: number;
  /** Human severity text, e.g. "Magnitude 5.6M, Depth:38.5km". */
  severity: string | null;
  severityValue: number | null;
  severityUnit: string | null;
  population: string | null;
  fromDate: string;      // ISO
  toDate: string;        // ISO
  published: string;     // ISO (pubDate)
  modified: string;      // ISO (gdacs:datemodified)
  isCurrent: boolean;
}

export interface GdacsFile {
  version: 1;
  generated: string;
  source: 'GDACS';
  license: 'CC BY 4.0';
  attribution: string;
  windowDays: number;
  alerts: GdacsAlert[];
}

export const GDACS_RSS_URL = 'https://www.gdacs.org/xml/rss.xml';
export const GDACS_WINDOW_DAYS = 7;
export const GDACS_MAX_ALERTS = 100;
export const GDACS_ATTRIBUTION = 'GDACS · European Commission Joint Research Centre · CC BY 4.0';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', textNodeName: '#text' });

const TYPES = new Set<GdacsEventType>(['EQ', 'TC', 'FL', 'VO', 'WF', 'DR', 'TS']);

function text(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'string') return v.trim() || null;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object' && '#text' in (v as any)) return text((v as any)['#text']);
  return null;
}

function iso(v: unknown): string | null {
  const s = text(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function level(v: unknown): GdacsLevel | null {
  const s = text(v);
  if (s === 'Green' || s === 'Orange' || s === 'Red') return s;
  return null;
}

/** Parses the GDACS RSS body into alerts; malformed items are skipped. */
export function parseGdacsRss(xml: string): GdacsAlert[] {
  let doc: any;
  try { doc = parser.parse(xml); } catch { return []; }
  const raw = doc?.rss?.channel?.item;
  const items: any[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const out: GdacsAlert[] = [];
  for (const it of items) {
    const guid = text(it.guid) ?? text(it['gdacs:eventid']);
    const point = text(it['georss:point']) ?? (it['geo:Point'] ? `${text(it['geo:Point']['geo:lat'])} ${text(it['geo:Point']['geo:long'])}` : null);
    const lv = level(it['gdacs:alertlevel']);
    const url = text(it.link);
    const title = text(it.title);
    if (!guid || !point || !lv || !url || !title) continue;
    const [latS, lonS] = point.split(/\s+/);
    const lat = Number(latS), lon = Number(lonS);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    const typeRaw = (text(it['gdacs:eventtype']) ?? '').toUpperCase();
    const sev = it['gdacs:severity'];
    const pop = it['gdacs:population'];
    const from = iso(it['gdacs:fromdate']) ?? iso(it.pubDate);
    const published = iso(it.pubDate) ?? from;
    if (!from || !published) continue;
    out.push({
      id: guid,
      eventId: text(it['gdacs:eventid']) ?? guid,
      eventType: TYPES.has(typeRaw as GdacsEventType) ? (typeRaw as GdacsEventType) : 'OTHER',
      level: lv,
      title,
      url,
      country: text(it['gdacs:country']),
      iso3: text(it['gdacs:iso3']),
      lat, lon,
      severity: text(sev),
      severityValue: sev && sev['@_value'] != null && Number.isFinite(Number(sev['@_value'])) ? Number(sev['@_value']) : null,
      severityUnit: sev?.['@_unit'] ?? null,
      population: text(pop),
      fromDate: from,
      toDate: iso(it['gdacs:todate']) ?? from,
      published,
      modified: iso(it['gdacs:datemodified']) ?? published,
      isCurrent: text(it['gdacs:iscurrent']) !== 'false',
    });
  }
  return out;
}

/** Orange/Red alerts of the last `windowDays`, newest first, capped. */
export function buildGdacsFile(alerts: GdacsAlert[], now: Date = new Date(), windowDays = GDACS_WINDOW_DAYS): GdacsFile {
  const cutoff = now.getTime() - windowDays * 86_400_000;
  const kept = alerts
    .filter(a => a.level !== 'Green')
    .filter(a => Date.parse(a.modified) >= cutoff || Date.parse(a.published) >= cutoff)
    .sort((a, b) => Date.parse(b.modified) - Date.parse(a.modified))
    .slice(0, GDACS_MAX_ALERTS);
  return { version: 1, generated: now.toISOString(), source: 'GDACS', license: 'CC BY 4.0', attribution: GDACS_ATTRIBUTION, windowDays, alerts: kept };
}

const TYPE_WORD: Record<GdacsEventType, string> = { EQ: 'earthquake', TC: 'tropical cyclone', FL: 'flood', VO: 'volcano', WF: 'wildfire', DR: 'drought', TS: 'tsunami', OTHER: 'disaster' };

/** Candidates for the scoring pipeline: geo attached, tier 1 (UN/EU system). */
export function gdacsToCandidates(alerts: GdacsAlert[]): (Candidate & { geo: { lat: number; lon: number; place?: string; method: 'georss' } })[] {
  return alerts
    .filter(a => a.level !== 'Green')
    .map(a => ({
      title: `GDACS ${a.level} ${TYPE_WORD[a.eventType]} alert${a.country ? ` · ${a.country}` : ''}: ${a.title}`,
      url: a.url,
      source: 'gdacs',
      timestamp: a.published,
      matchedTracker: null,
      feedOrigin: 'gdacs' as const,
      sourceTier: 1 as const,
      geo: { lat: a.lat, lon: a.lon, ...(a.country ? { place: a.country } : {}), method: 'georss' as const },
    }));
}
