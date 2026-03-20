import { TrackerConfigSchema, type TrackerConfig, type Domain, type Region } from './tracker-config';

// Eagerly load all tracker.json files at build time
const trackerModules = import.meta.glob<{ default: unknown }>(
  '../../trackers/*/tracker.json',
  { eager: true },
);

let _cache: TrackerConfig[] | null = null;

/** Load and validate all tracker configs. Results are cached. */
export function loadAllTrackers(): TrackerConfig[] {
  if (_cache) return _cache;

  const configs: TrackerConfig[] = [];
  for (const [path, mod] of Object.entries(trackerModules)) {
    const raw = 'default' in mod ? mod.default : mod;
    try {
      configs.push(TrackerConfigSchema.parse(raw));
    } catch (err) {
      const slug = path.match(/trackers\/([^/]+)\//)?.[1] ?? path;
      console.error(`Invalid tracker config for "${slug}":`, err);
    }
  }

  // Sort: active first, then archived, then draft; alphabetical within group
  const order = { active: 0, archived: 1, draft: 2 };
  configs.sort((a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name));

  _cache = configs;
  return configs;
}

/** Load a single tracker config by slug. */
export function loadTrackerConfig(slug: string): TrackerConfig | undefined {
  return loadAllTrackers().find((t) => t.slug === slug);
}

/** Get all active tracker slugs (for getStaticPaths). */
export function getTrackerSlugs(): string[] {
  return loadAllTrackers()
    .filter((t) => t.status !== 'draft')
    .map((t) => t.slug);
}

// ── Series & taxonomy helpers ──

export interface SeriesData {
  name: string;
  hub: TrackerConfig | null;
  members: TrackerConfig[];
}

/** Group all trackers by series.id. Hub is separated; members sorted by order. */
export function loadSeriesMap(): Map<string, SeriesData> {
  const map = new Map<string, SeriesData>();
  for (const t of loadAllTrackers()) {
    if (!t.series) continue;
    const { id, name, isHub } = t.series;
    if (!map.has(id)) map.set(id, { name, hub: null, members: [] });
    const entry = map.get(id)!;
    if (isHub) {
      entry.hub = t;
    } else {
      entry.members.push(t);
    }
  }
  // Sort members by series.order
  for (const entry of map.values()) {
    entry.members.sort((a, b) => (a.series?.order ?? 0) - (b.series?.order ?? 0));
  }
  return map;
}

/** Get all trackers with a given domain. */
export function getTrackersByDomain(domain: Domain): TrackerConfig[] {
  return loadAllTrackers().filter((t) => t.domain === domain);
}

/** Get all trackers with a given region. */
export function getTrackersByRegion(region: Region): TrackerConfig[] {
  return loadAllTrackers().filter((t) => t.region === region);
}

/** Get series data for a specific tracker (if it belongs to a series). */
export function getTrackerSeries(slug: string): SeriesData | null {
  const tracker = loadTrackerConfig(slug);
  if (!tracker?.series) return null;
  return loadSeriesMap().get(tracker.series.id) ?? null;
}

/** Get the hub tracker for a given series ID. */
export function getSeriesHub(seriesId: string): TrackerConfig | null {
  return loadSeriesMap().get(seriesId)?.hub ?? null;
}
