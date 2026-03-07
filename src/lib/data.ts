/**
 * Centralized data loader — reads JSON files, merges partitioned events,
 * validates everything through Zod schemas, and exports typed arrays
 * for consumption by Astro pages and React islands.
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
} from './schemas';

// ── Static JSON imports (Vite-resolved at build time) ──

import kpisRaw from '../data/kpis.json';
import timelineRaw from '../data/timeline.json';
import mapPointsRaw from '../data/map-points.json';
import mapLinesRaw from '../data/map-lines.json';
import strikeTargetsRaw from '../data/strike-targets.json';
import retaliationRaw from '../data/retaliation.json';
import assetsRaw from '../data/assets.json';
import casualtiesRaw from '../data/casualties.json';
import econRaw from '../data/econ.json';
import claimsRaw from '../data/claims.json';
import politicalRaw from '../data/political.json';
import metaRaw from '../data/meta.json';

// ── Partitioned event files (Vite glob import) ──

const eventModules = import.meta.glob<{ default: unknown }>(
  '../data/events/*.json',
  { eager: true },
);

// ── Timeline assembly ──

function loadTimeline() {
  const eras = z.array(TimelineEraSchema).parse(timelineRaw);

  // Collect all partitioned daily events, sorted by filename (date order)
  const MONTH_NAMES: Record<string, string> = {
    '01': 'Jan', '02': 'Feb', '03': 'Mar', '04': 'Apr', '05': 'May', '06': 'Jun',
    '07': 'Jul', '08': 'Aug', '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dec',
  };
  const dailyEvents = Object.keys(eventModules)
    .sort()
    .flatMap((path) => {
      const mod = eventModules[path];
      const raw = 'default' in mod ? mod.default : mod;
      const events = z.array(TimelineEventSchema).parse(raw);

      // Derive date from filename (e.g. "../data/events/2026-03-05.json" → "Mar 5")
      const match = path.match(/(\d{4})-(\d{2})-(\d{2})\.json$/);
      if (match) {
        const monLabel = MONTH_NAMES[match[2]];
        const day = String(Number(match[3])); // strip leading zero
        if (monLabel) {
          for (const ev of events) {
            // Fix bare-year entries the AI updater sometimes produces
            if (/^\d{4}$/.test(ev.year)) {
              ev.year = `${monLabel} ${day}`;
            }
          }
        }
      }

      return events;
    });

  if (dailyEvents.length > 0) {
    const crisisEra = { era: 'Crisis & War 2026', events: dailyEvents };
    eras.push(crisisEra);
  }

  return eras;
}

// ── Validated exports ──

export const kpis = z.array(KpiSchema).parse(kpisRaw);
export const timeline = loadTimeline();
export const mapPoints = z.array(MapPointSchema).parse(mapPointsRaw);
export const mapLines = z.array(MapLineSchema).parse(mapLinesRaw);
export const strikeTargets = z.array(StrikeItemSchema).parse(strikeTargetsRaw);
export const retaliationData = z.array(StrikeItemSchema).parse(retaliationRaw);
export const assetsData = z.array(AssetSchema).parse(assetsRaw);
export const casualties = z.array(CasualtyRowSchema).parse(casualtiesRaw);
export const econ = z.array(EconItemSchema).parse(econRaw);
export const claims = z.array(ClaimSchema).parse(claimsRaw);
export const political = z.array(PolItemSchema).parse(politicalRaw);
export const meta = MetaSchema.parse(metaRaw);
