/**
 * Centralized data loader — reads tracker data files, merges partitioned events,
 * validates everything through Zod schemas, and returns typed data object.
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
  isFutureDate,
} from './schemas';

// ── Eagerly load all tracker data at build time ──
const dataModules = import.meta.glob<{ default: unknown }>(
  '../../trackers/*/data/*.json',
  { eager: true },
);

const eventModules = import.meta.glob<{ default: unknown }>(
  '../../trackers/*/data/events/*.json',
  { eager: true },
);

// ── Helper: get a data file for a specific tracker ──
function getTrackerData(slug: string, filename: string): unknown {
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

function loadTimeline(slug: string, eraLabel?: string) {
  const timelineRaw = getTrackerData(slug, 'timeline.json');
  const eras = z.array(TimelineEraSchema).parse(timelineRaw ?? []);

  // Collect partitioned daily events for this tracker
  const prefix = `../../trackers/${slug}/data/events/`;
  const dailyEvents = Object.keys(eventModules)
    .filter(p => p.startsWith(prefix))
    .sort()
    .flatMap((path) => {
      const mod = eventModules[path];
      const raw = 'default' in mod ? mod.default : mod;
      const events = z.array(TimelineEventSchema).parse(raw);

      const match = path.match(/(\d{4})-(\d{2})-(\d{2})\.json$/);
      if (match) {
        const monLabel = MONTH_NAMES[match[2]];
        const day = String(Number(match[3]));
        if (monLabel) {
          for (const ev of events) {
            if (/^\d{4}$/.test(ev.year)) {
              ev.year = `${monLabel} ${day}`;
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
}

export function loadTrackerData(slug: string, eraLabel?: string): TrackerData {
  const kpis = z.array(KpiSchema).parse(getTrackerData(slug, 'kpis.json') ?? []);
  const timeline = loadTimeline(slug, eraLabel);
  const mapPoints = z.array(MapPointSchema).parse(getTrackerData(slug, 'map-points.json') ?? []);
  const mapLines = z.array(MapLineSchema).parse(getTrackerData(slug, 'map-lines.json') ?? []);

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

  const strikeTargets = z.array(StrikeItemSchema).parse(getTrackerData(slug, 'strike-targets.json') ?? []);
  const retaliationData = z.array(StrikeItemSchema).parse(getTrackerData(slug, 'retaliation.json') ?? []);
  const assetsData = z.array(AssetSchema).parse(getTrackerData(slug, 'assets.json') ?? []);
  const casualties = z.array(CasualtyRowSchema).parse(getTrackerData(slug, 'casualties.json') ?? []);
  const econ = z.array(EconItemSchema).parse(getTrackerData(slug, 'econ.json') ?? []);
  const claims = z.array(ClaimSchema).parse(getTrackerData(slug, 'claims.json') ?? []);
  const political = z.array(PolItemSchema).parse(getTrackerData(slug, 'political.json') ?? []);
  const meta = MetaSchema.parse(getTrackerData(slug, 'meta.json'));

  return { kpis, timeline, mapPoints, mapLines, strikeTargets, retaliationData, assetsData, casualties, econ, claims, political, meta };
}

