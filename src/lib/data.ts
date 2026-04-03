/**
 * Centralized data loader — reads tracker data files, merges partitioned events,
 * validates everything through Zod schemas, and returns typed data object.
 * Supports locale parameter for i18n (tries data-{locale}/ first, falls back to data/).
 */
import { z } from 'zod';
import {
  KpiSchema,
  TimelineEraSchema,
  TimelineEventSchema,
  MapPointSchema,
  MapLineSchema,
  StrikeItemSchema,
  AssetSchema,
  CasualtyRowSchema,
  EconItemSchema,
  ClaimSchema,
  PolItemSchema,
  MetaSchema,
  DigestEntrySchema,
  MissionTrajectorySchema,
  isFutureDate,
} from './schemas';
import type { Locale } from '../i18n/translations';

// ── Eagerly load all tracker data at build time ──
const dataModules = import.meta.glob<{ default: unknown }>(
  '../../trackers/*/data/*.json',
  { eager: true },
);

const eventModules = import.meta.glob<{ default: unknown }>(
  '../../trackers/*/data/events/*.json',
  { eager: true },
);

// ── Locale-specific data (Spanish translations) ──
const esDataModules = import.meta.glob<{ default: unknown }>(
  '../../trackers/*/data-es/*.json',
  { eager: true },
);

const esEventModules = import.meta.glob<{ default: unknown }>(
  '../../trackers/*/data-es/events/*.json',
  { eager: true },
);

// ── Helper: get a data file for a specific tracker, with locale fallback ──
function getTrackerData(slug: string, filename: string, locale?: Locale): unknown {
  // Try locale-specific file first
  if (locale && locale !== 'en') {
    const localeKey = `../../trackers/${slug}/data-${locale}/${filename}`;
    const localeMod = esDataModules[localeKey];
    if (localeMod) {
      return 'default' in localeMod ? localeMod.default : localeMod;
    }
  }
  // Fall back to English
  const key = `../../trackers/${slug}/data/${filename}`;
  const mod = dataModules[key];
  if (!mod) return undefined;
  return 'default' in mod ? mod.default : mod;
}

// ── Timeline assembly ──
const MONTH_NAMES: Record<string, string> = {
  '01': 'Jan', '02': 'Feb', '03': 'Mar', '04': 'Apr', '05': 'May', '06': 'Jun',
  '07': 'Jul', '08': 'Aug', '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dec',
};

function loadTimeline(slug: string, eraLabel?: string, locale?: Locale) {
  const timelineRaw = getTrackerData(slug, 'timeline.json', locale);
  const eras = z.array(TimelineEraSchema).parse(timelineRaw ?? []);

  // Collect partitioned daily events for this tracker
  // Use locale-specific events if available, otherwise English
  const useEsEvents = locale && locale !== 'en';
  const evtModules = useEsEvents ? esEventModules : eventModules;
  const prefix = useEsEvents
    ? `../../trackers/${slug}/data-${locale}/events/`
    : `../../trackers/${slug}/data/events/`;

  // Also check English events as fallback
  const enPrefix = `../../trackers/${slug}/data/events/`;

  // Collect event file paths (prefer locale, fall back to English)
  const enPaths = Object.keys(eventModules).filter(p => p.startsWith(enPrefix));
  const localePaths = useEsEvents
    ? Object.keys(esEventModules).filter(p => p.startsWith(prefix))
    : [];

  // Build a map of date → module (locale overrides English)
  const dateModuleMap = new Map<string, { path: string; mod: any }>();
  for (const path of enPaths) {
    const dateMatch = path.match(/(\d{4}-\d{2}-\d{2})\.json$/);
    if (dateMatch) {
      dateModuleMap.set(dateMatch[1], { path, mod: eventModules[path] });
    }
  }
  for (const path of localePaths) {
    const dateMatch = path.match(/(\d{4}-\d{2}-\d{2})\.json$/);
    if (dateMatch) {
      dateModuleMap.set(dateMatch[1], { path, mod: esEventModules[path] });
    }
  }

  const dailyEvents = [...dateModuleMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([, { path, mod }]) => {
      const raw = 'default' in mod ? mod.default : mod;
      const events = z.array(TimelineEventSchema).parse(raw);

      const match = path.match(/(\d{4})-(\d{2})-(\d{2})\.json$/);
      if (match) {
        const fileYear = match[1];
        const monLabel = MONTH_NAMES[match[2]];
        const day = String(Number(match[3]));
        if (monLabel) {
          for (const ev of events) {
            if (/^\d{4}$/.test(ev.year)) {
              ev.year = `${monLabel} ${day}, ${fileYear}`;
            } else if (/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}$/i.test(ev.year)) {
              ev.year = `${ev.year}, ${fileYear}`;
            }
          }
        }
      }
      return events;
    });

  if (dailyEvents.length > 0) {
    eras.push({ era: eraLabel || 'Events', events: dailyEvents });
  }

  return eras;
}

// ── Main loader ──
export interface TrackerData {
  kpis: z.infer<typeof KpiSchema>[];
  timeline: z.infer<typeof TimelineEraSchema>[];
  mapPoints: z.infer<typeof MapPointSchema>[];
  mapLines: z.infer<typeof MapLineSchema>[];
  strikeTargets: z.infer<typeof StrikeItemSchema>[];
  retaliationData: z.infer<typeof StrikeItemSchema>[];
  assetsData: z.infer<typeof AssetSchema>[];
  casualties: z.infer<typeof CasualtyRowSchema>[];
  econ: z.infer<typeof EconItemSchema>[];
  claims: z.infer<typeof ClaimSchema>[];
  political: z.infer<typeof PolItemSchema>[];
  meta: z.infer<typeof MetaSchema>;
  digests: z.infer<typeof DigestEntrySchema>[];
  missionTrajectory: z.infer<typeof MissionTrajectorySchema> | null;
}

export function loadTrackerData(slug: string, eraLabel?: string, locale?: Locale): TrackerData {
  const kpis = z.array(KpiSchema).parse(getTrackerData(slug, 'kpis.json', locale) ?? []);
  const timeline = loadTimeline(slug, eraLabel, locale);
  const mapPoints = z.array(MapPointSchema).parse(getTrackerData(slug, 'map-points.json', locale) ?? []);
  const mapLines = z.array(MapLineSchema).parse(getTrackerData(slug, 'map-lines.json', locale) ?? []);

  // Warn on future-dated map data (soft guard — does not throw)
  for (const point of mapPoints) {
    if (isFutureDate(point.date)) {
      console.warn(`[${slug}] MapPoint "${point.id}" has future date: ${point.date}`);
    }
  }
  for (const line of mapLines) {
    if (isFutureDate(line.date)) {
      console.warn(`[${slug}] MapLine "${line.id}" has future date: ${line.date}`);
    }
  }

  // Cross-field validation: strike/retaliation lines must have weaponType + time
  for (const line of mapLines) {
    if ((line.cat === 'strike' || line.cat === 'retaliation') && (!line.weaponType || !line.time)) {
      throw new Error(
        `MapLine "${line.id}" (cat=${line.cat}) missing required fields: ` +
        `${!line.weaponType ? 'weaponType ' : ''}${!line.time ? 'time' : ''}`.trim(),
      );
    }
  }

  const strikeTargets = z.array(StrikeItemSchema).parse(getTrackerData(slug, 'strike-targets.json', locale) ?? []);
  const retaliationData = z.array(StrikeItemSchema).parse(getTrackerData(slug, 'retaliation.json', locale) ?? []);
  const assetsData = z.array(AssetSchema).parse(getTrackerData(slug, 'assets.json', locale) ?? []);
  const casualties = z.array(CasualtyRowSchema).parse(getTrackerData(slug, 'casualties.json', locale) ?? []);
  const econ = z.array(EconItemSchema).parse(getTrackerData(slug, 'econ.json', locale) ?? []);
  const claims = z.array(ClaimSchema).parse(getTrackerData(slug, 'claims.json', locale) ?? []);
  const political = z.array(PolItemSchema).parse(getTrackerData(slug, 'political.json', locale) ?? []);
  const meta = MetaSchema.parse(getTrackerData(slug, 'meta.json', locale));

  const digests = z.array(DigestEntrySchema).parse(getTrackerData(slug, 'digests.json', locale) ?? []);

  // Optional mission trajectory (only for space trackers)
  let missionTrajectory: z.infer<typeof MissionTrajectorySchema> | null = null;
  const trajRaw = getTrackerData(slug, 'mission-trajectory.json', locale) as any;
  if (trajRaw && trajRaw.waypoints) {
    // Normalize: generated file may use "name" instead of "label" for phases
    if (trajRaw.phases) {
      for (const p of trajRaw.phases) {
        if (!p.label && p.name) p.label = p.name;
      }
    }
    try { missionTrajectory = MissionTrajectorySchema.parse(trajRaw); } catch {}
  }

  return { kpis, timeline, mapPoints, mapLines, strikeTargets, retaliationData, assetsData, casualties, econ, claims, political, meta, digests, missionTrajectory };
}
