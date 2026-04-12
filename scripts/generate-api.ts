/**
 * generate-api.ts — Generates static JSON API files in public/api/v1/
 *
 * Run: npx tsx scripts/generate-api.ts
 *
 * Produces:
 *   public/api/v1/trackers.json           — directory of all trackers
 *   public/api/v1/trackers/{slug}.json    — full tracker data per slug
 *   public/api/v1/breaking.json           — current breaking news items
 *   public/api/v1/kpis/{slug}.json        — KPIs for a tracker
 *   public/api/v1/events/{slug}.json      — last 30 events for a tracker
 *   public/api/v1/search-index.json       — flattened event titles for search
 */
import {
  readFileSync,
  writeFileSync,
  readdirSync,
  existsSync,
  mkdirSync,
  statSync,
} from 'fs';
import { join, basename } from 'path';

const TRACKERS_DIR = join(process.cwd(), 'trackers');
const OUTPUT_DIR = join(process.cwd(), 'public', 'api', 'v1');

// ── Helpers ──

function readJSON(path: string): any {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeOut(relPath: string, data: unknown): void {
  const full = join(OUTPUT_DIR, relPath);
  const dir = full.replace(/\/[^/]+$/, '');
  mkdirSync(dir, { recursive: true });
  writeFileSync(full, JSON.stringify(data, null, 2) + '\n');
}

interface TrackerConfig {
  slug: string;
  name: string;
  shortName: string;
  description: string;
  icon?: string;
  color?: string;
  status: string;
  temporal?: string;
  domain?: string;
  region?: string;
  country?: string;
  tags?: string[];
  startDate: string;
  endDate?: string;
  eraLabel?: string;
  sections: string[];
  series?: { id: string; name: string; order?: number; isHub?: boolean };
}

interface MetaData {
  operationName?: string;
  dayCount?: number;
  dateline?: string;
  heroHeadline?: string;
  heroSubtitle?: string;
  footerNote?: string;
  lastUpdated?: string;
  breaking?: boolean;
}

interface DigestEntry {
  date: string;
  title: string;
  summary: string;
  sectionsUpdated: string[];
  source?: string;
}

interface TimelineEvent {
  id: string;
  year: string;
  title: string;
  type: string;
  detail: string;
  sources: Array<{ name: string; tier: number; url?: string; pole?: string }>;
  media?: Array<{ type: string; url: string; caption?: string }>;
  active?: boolean;
  [key: string]: unknown;
}

interface TimelineEra {
  era: string;
  events: TimelineEvent[];
}

// ── Month name resolution for event dates ──
const MONTH_MAP: Record<string, string> = {
  '01': 'Jan', '02': 'Feb', '03': 'Mar', '04': 'Apr',
  '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Aug',
  '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dec',
};

const MONTH_NUM: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

function resolveEventDate(yearField: string): string | null {
  // "Mon DD, YYYY" → YYYY-MM-DD
  const mdy = yearField.match(
    /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),?\s+(\d{4})/i,
  );
  if (mdy) {
    const mm = MONTH_NUM[mdy[1].toLowerCase()];
    return `${mdy[3]}-${mm}-${mdy[2].padStart(2, '0')}`;
  }
  // ISO date
  if (/^\d{4}-\d{2}-\d{2}$/.test(yearField)) return yearField;
  return null;
}

// ── Load tracker data from filesystem ──

function loadTrackerSlugs(): string[] {
  return readdirSync(TRACKERS_DIR).filter((d) => {
    const p = join(TRACKERS_DIR, d, 'tracker.json');
    return existsSync(p);
  });
}

function loadConfig(slug: string): TrackerConfig {
  return readJSON(join(TRACKERS_DIR, slug, 'tracker.json'));
}

function safeReadJSON(path: string, fallback: any = []): any {
  return existsSync(path) ? readJSON(path) : fallback;
}

function loadDailyEvents(slug: string): TimelineEvent[] {
  const eventsDir = join(TRACKERS_DIR, slug, 'data', 'events');
  if (!existsSync(eventsDir)) return [];

  return readdirSync(eventsDir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .flatMap((file) => {
      const events: TimelineEvent[] = readJSON(join(eventsDir, file));
      const match = file.match(/^(\d{4})-(\d{2})-(\d{2})\.json$/);
      if (match) {
        const [, fileYear, fileMon, fileDay] = match;
        const monLabel = MONTH_MAP[fileMon];
        const day = String(Number(fileDay));
        for (const ev of events) {
          if (/^\d{4}$/.test(ev.year)) {
            ev.year = `${monLabel} ${day}, ${fileYear}`;
          } else if (
            /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}$/i.test(
              ev.year,
            )
          ) {
            ev.year = `${ev.year}, ${fileYear}`;
          }
        }
      }
      return events;
    });
}

function loadTimeline(slug: string, eraLabel?: string): TimelineEra[] {
  const timelinePath = join(TRACKERS_DIR, slug, 'data', 'timeline.json');
  const eras: TimelineEra[] = safeReadJSON(timelinePath, []);
  const dailyEvents = loadDailyEvents(slug);
  if (dailyEvents.length > 0) {
    eras.push({ era: eraLabel || 'Events', events: dailyEvents });
  }
  return eras;
}

function flattenEvents(timeline: TimelineEra[]): Array<{
  id: string;
  date: string;
  title: string;
  type: string;
  detail: string;
  sources: TimelineEvent['sources'];
}> {
  const flat: Array<{
    id: string;
    date: string;
    title: string;
    type: string;
    detail: string;
    sources: TimelineEvent['sources'];
  }> = [];

  for (const era of timeline) {
    for (const ev of era.events) {
      const date = resolveEventDate(ev.year);
      if (date) {
        flat.push({
          id: ev.id,
          date,
          title: ev.title,
          type: ev.type,
          detail: ev.detail,
          sources: ev.sources,
        });
      }
    }
  }

  // Sort newest first
  flat.sort((a, b) => b.date.localeCompare(a.date));
  return flat;
}

// ── Main generation ──

function generate(): void {
  console.log('Generating static JSON API...');
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const slugs = loadTrackerSlugs();
  const trackerIndex: Array<{
    slug: string;
    name: string;
    shortName: string;
    description: string;
    icon?: string;
    color?: string;
    domain?: string;
    region?: string;
    country?: string;
    status: string;
    temporal?: string;
    tags?: string[];
    startDate: string;
    endDate?: string;
    lastUpdated?: string;
    dayCount?: number;
    breaking?: boolean;
  }> = [];

  const breakingItems: Array<{
    slug: string;
    name: string;
    icon?: string;
    headline: string;
    subtitle?: string;
    lastUpdated: string;
  }> = [];

  const searchIndex: Array<{
    slug: string;
    id: string;
    title: string;
    date: string;
    type: string;
  }> = [];

  for (const slug of slugs) {
    const config = loadConfig(slug);
    if (config.status === 'draft') continue;

    const dataDir = join(TRACKERS_DIR, slug, 'data');
    const meta: MetaData = safeReadJSON(join(dataDir, 'meta.json'), {});
    const kpis = safeReadJSON(join(dataDir, 'kpis.json'));
    const digests: DigestEntry[] = safeReadJSON(join(dataDir, 'digests.json'));
    const timeline = loadTimeline(slug, config.eraLabel);
    const allEvents = flattenEvents(timeline);

    // ── trackers/{slug}.json — full tracker data
    writeOut(`trackers/${slug}.json`, {
      config: {
        slug: config.slug,
        name: config.name,
        shortName: config.shortName,
        description: config.description,
        icon: config.icon,
        color: config.color,
        domain: config.domain,
        region: config.region,
        country: config.country,
        status: config.status,
        temporal: config.temporal,
        tags: config.tags,
        startDate: config.startDate,
        endDate: config.endDate,
        series: config.series,
      },
      meta,
      kpis,
      latestDigest: digests[0] ?? null,
      recentEvents: allEvents.slice(0, 30),
      eventCount: allEvents.length,
    });

    // ── kpis/{slug}.json
    writeOut(`kpis/${slug}.json`, {
      slug,
      lastUpdated: meta.lastUpdated ?? null,
      kpis,
    });

    // ── events/{slug}.json — last 30
    writeOut(`events/${slug}.json`, {
      slug,
      total: allEvents.length,
      events: allEvents.slice(0, 30),
    });

    // ── Tracker index entry
    trackerIndex.push({
      slug: config.slug,
      name: config.name,
      shortName: config.shortName,
      description: config.description,
      icon: config.icon,
      color: config.color,
      domain: config.domain,
      region: config.region,
      country: config.country,
      status: config.status,
      temporal: config.temporal,
      tags: config.tags,
      startDate: config.startDate,
      endDate: config.endDate,
      lastUpdated: meta.lastUpdated ?? undefined,
      dayCount: meta.dayCount ?? undefined,
      breaking: meta.breaking ?? undefined,
    });

    // ── Breaking
    if (meta.breaking && meta.heroHeadline) {
      breakingItems.push({
        slug: config.slug,
        name: config.name,
        icon: config.icon,
        headline: meta.heroHeadline,
        subtitle: meta.heroSubtitle,
        lastUpdated: meta.lastUpdated ?? new Date().toISOString(),
      });
    }

    // ── Search index
    for (const ev of allEvents) {
      searchIndex.push({
        slug: config.slug,
        id: ev.id,
        title: ev.title,
        date: ev.date,
        type: ev.type,
      });
    }

    console.log(`  ✓ ${slug} (${allEvents.length} events, ${kpis.length} KPIs)`);
  }

  // Sort index: active first, then alphabetical
  trackerIndex.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  // ── trackers.json — directory
  writeOut('trackers.json', {
    generated: new Date().toISOString(),
    count: trackerIndex.length,
    trackers: trackerIndex,
  });

  // ── breaking.json
  writeOut('breaking.json', {
    generated: new Date().toISOString(),
    count: breakingItems.length,
    items: breakingItems,
  });

  // ── search-index.json
  // Sort newest first
  searchIndex.sort((a, b) => b.date.localeCompare(a.date));
  writeOut('search-index.json', {
    generated: new Date().toISOString(),
    count: searchIndex.length,
    events: searchIndex,
  });

  console.log(`\nAPI generated: ${trackerIndex.length} trackers, ${searchIndex.length} events`);
  console.log(`Output: ${OUTPUT_DIR}`);
}

generate();
