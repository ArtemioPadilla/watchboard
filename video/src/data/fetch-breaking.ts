/**
 * Fetches the top 3 breaking trackers from the Watchboard data directory.
 * Falls back to sample data if the tracker files are unavailable.
 *
 * Usage: npx tsx video/src/data/fetch-breaking.ts
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { SAMPLE_DATA, type BreakingData, type BreakingTracker } from './types.js';

const TRACKERS_DIR = resolve(import.meta.dirname ?? '.', '../../../trackers');
const OUTPUT_PATH = resolve(import.meta.dirname ?? '.', './breaking.json');

interface TrackerConfig {
  slug: string;
  name: string;
  shortName?: string;
  icon: string;
  status: string;
  map?: { center?: { lat: number; lon: number } };
}

interface MetaData {
  heroHeadline?: string;
  breaking?: boolean;
  dayCount?: number;
  lastUpdated?: string;
}

interface KpiItem {
  id: string;
  label: string;
  value: string;
  source: string;
}

function parseKpiNumericValue(raw: string): number {
  const cleaned = raw.replace(/[~,+><!]/g, '').trim();
  const match = cleaned.match(/[\d.]+/);
  return match ? parseFloat(match[0]) : 0;
}

function loadTrackerBreaking(slug: string): BreakingTracker | null {
  const trackerDir = join(TRACKERS_DIR, slug);
  const configPath = join(trackerDir, 'tracker.json');
  const metaPath = join(trackerDir, 'data', 'meta.json');
  const kpisPath = join(trackerDir, 'data', 'kpis.json');

  if (!existsSync(configPath) || !existsSync(metaPath)) return null;

  try {
    const config: TrackerConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
    const meta: MetaData = JSON.parse(readFileSync(metaPath, 'utf-8'));

    if (config.status !== 'active') return null;

    const headline = meta.heroHeadline ?? `${config.shortName ?? config.name} — latest updates`;

    let kpiLabel = 'DAY';
    let kpiValue = meta.dayCount ?? 0;
    let kpiPrefix = '';
    let kpiSuffix = '';
    let sourceLabel = 'Multiple sources';
    let sourceTier: 1 | 2 | 3 | 4 = 2;

    if (existsSync(kpisPath)) {
      const kpis: KpiItem[] = JSON.parse(readFileSync(kpisPath, 'utf-8'));
      if (kpis.length > 0) {
        const topKpi = kpis[0];
        kpiLabel = topKpi.label.toUpperCase();
        kpiValue = parseKpiNumericValue(topKpi.value);
        sourceLabel = topKpi.source.split('/')[0].trim();
      }
    }

    const lat = config.map?.center?.lat ?? 0;
    const lng = config.map?.center?.lon ?? 0;

    return {
      slug: config.slug,
      name: config.shortName ?? config.name,
      icon: config.icon,
      headline,
      kpiLabel,
      kpiValue,
      kpiPrefix,
      kpiSuffix,
      sourceTier,
      sourceLabel,
      mapCenter: [lat, lng],
    };
  } catch {
    console.warn(`Failed to load tracker: ${slug}`);
    return null;
  }
}

function fetchBreakingData(): BreakingData {
  if (!existsSync(TRACKERS_DIR)) {
    console.warn('Trackers directory not found, using sample data.');
    return SAMPLE_DATA;
  }

  const slugs = readdirSync(TRACKERS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  // Prioritize trackers with breaking=true in meta, then most recently updated
  const candidates: Array<{ tracker: BreakingTracker; breaking: boolean; lastUpdated: string }> =
    [];

  for (const slug of slugs) {
    const tracker = loadTrackerBreaking(slug);
    if (!tracker) continue;

    const metaPath = join(TRACKERS_DIR, slug, 'data', 'meta.json');
    let isBreaking = false;
    let lastUpdated = '2000-01-01';

    try {
      const meta: MetaData = JSON.parse(readFileSync(metaPath, 'utf-8'));
      isBreaking = meta.breaking === true;
      lastUpdated = meta.lastUpdated ?? lastUpdated;
    } catch {
      // skip
    }

    candidates.push({ tracker, breaking: isBreaking, lastUpdated });
  }

  // Sort: breaking first, then by lastUpdated desc
  candidates.sort((a, b) => {
    if (a.breaking !== b.breaking) return a.breaking ? -1 : 1;
    return b.lastUpdated.localeCompare(a.lastUpdated);
  });

  const top3 = candidates.slice(0, 3).map((c) => c.tracker);

  if (top3.length === 0) {
    console.warn('No active trackers found, using sample data.');
    return SAMPLE_DATA;
  }

  const today = new Date().toISOString().split('T')[0];
  return { date: today, trackers: top3 };
}

// Main execution
const data = fetchBreakingData();

const outputDir = resolve(OUTPUT_PATH, '..');
if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

writeFileSync(OUTPUT_PATH, JSON.stringify(data, null, 2));
console.log(`Breaking data written to ${OUTPUT_PATH}`);
console.log(`Date: ${data.date}`);
console.log(`Trackers: ${data.trackers.map((t) => `${t.icon} ${t.name}`).join(', ')}`);
