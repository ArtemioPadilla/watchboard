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
  const dailyEvents = Object.keys(eventModules)
    .sort()
    .flatMap((path) => {
      const mod = eventModules[path];
      const raw = 'default' in mod ? mod.default : mod;
      return z.array(TimelineEventSchema).parse(raw);
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
