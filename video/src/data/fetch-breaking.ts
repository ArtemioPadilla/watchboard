/**
 * Fetches the top 3 breaking trackers from the Watchboard data directory.
 * Falls back to sample data if the tracker files are unavailable.
 *
 * Supports two scoring modes via VIDEO_MODE env var:
 *   - "conflict" (default): prioritizes breaking news, recent updates, conflict trackers
 *   - "positive": prioritizes trackers with tone="progress"
 *
 * Usage: npx tsx video/src/data/fetch-breaking.ts
 *        VIDEO_MODE=positive npx tsx video/src/data/fetch-breaking.ts
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { SAMPLE_DATA, type BreakingData, type BreakingTracker } from './types.js';

const TRACKERS_DIR = resolve(import.meta.dirname ?? '.', '../../../trackers');
const OUTPUT_PATH = resolve(import.meta.dirname ?? '.', './breaking.json');

// ── Tracker diversity state ──────────────────────────────────────────
const STATE_DIR = resolve(import.meta.dirname ?? '.', '../../state');
const STATE_PATH = join(STATE_DIR, 'tracker-history.json');

export interface TrackerHistory {
  version: number;
  entries: Record<string, string[]>; // slug → ["2026-04-19", "2026-04-18", ...]
}

export function loadHistory(): TrackerHistory {
  try {
    if (!existsSync(STATE_PATH)) return { version: 1, entries: {} };
    const raw = JSON.parse(readFileSync(STATE_PATH, 'utf-8'));
    if (raw && typeof raw === 'object' && raw.version === 1 && typeof raw.entries === 'object') {
      return raw as TrackerHistory;
    }
    return { version: 1, entries: {} };
  } catch {
    return { version: 1, entries: {} };
  }
}

export function pruneHistory(history: TrackerHistory): TrackerHistory {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  const entries: Record<string, string[]> = {};
  for (const [slug, dates] of Object.entries(history.entries)) {
    const kept = dates.filter((d) => d >= cutoffStr);
    if (kept.length > 0) entries[slug] = kept;
  }
  return { version: 1, entries };
}

export function saveUsedTrackers(slugs: string[]): void {
  if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
  const history = pruneHistory(loadHistory());
  const today = new Date().toISOString().split('T')[0];

  for (const slug of slugs) {
    if (!history.entries[slug]) {
      history.entries[slug] = [today];
    } else if (!history.entries[slug].includes(today)) {
      history.entries[slug].push(today);
    }
  }

  writeFileSync(STATE_PATH, JSON.stringify(history, null, 2));
}

export function cooldownPenalty(slug: string, history: TrackerHistory): number {
  const dates = history.entries[slug];
  if (!dates || dates.length === 0) return 0;

  const today = new Date().toISOString().split('T')[0];
  // Find most recent past appearance (not today)
  const pastDates = dates.filter((d) => d < today).sort().reverse();
  if (pastDates.length === 0) return 0;

  const mostRecent = pastDates[0];
  const daysAgo = daysSince(mostRecent);

  if (daysAgo <= 1) return 60;
  if (daysAgo <= 2) return 30;
  if (daysAgo <= 3) return 15;
  if (daysAgo <= 4) return 7;
  return 3; // 5+ days ago
}

export function noveltyBonus(lastUpdated: string, slug: string, history: TrackerHistory): number {
  const dates = history.entries[slug];
  if (!dates || dates.length === 0) return 10; // never appeared

  const sorted = [...dates].sort().reverse();
  const lastAppearance = sorted[0];

  if (lastUpdated > lastAppearance) return 20; // updated since last video
  return -20; // not updated since last appearance
}

export type VideoMode = 'conflict' | 'positive';

interface TrackerConfig {
  slug: string;
  name: string;
  shortName?: string;
  icon: string;
  status: string;
  tone?: string;
  domain?: string;
  temporal?: string;
  tags?: string[];
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

export interface ScoredCandidate {
  tracker: BreakingTracker;
  score: number;
  breaking: boolean;
  lastUpdated: string;
  tone?: string;
  domain?: string;
  temporal?: string;
  tags?: string[];
  dayCount: number;
}

function parseKpiNumericValue(raw: string): number {
  const cleaned = raw.replace(/[~,+><!]/g, '').trim();
  const match = cleaned.match(/[\d.]+/);
  return match ? parseFloat(match[0]) : 0;
}

function findThumbnailUrls(slug: string): string[] {
  const eventsDir = join(TRACKERS_DIR, slug, 'data', 'events');
  if (!existsSync(eventsDir)) return [];

  const eventFiles = readdirSync(eventsDir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .reverse()
    .slice(0, 5);

  const urls: string[] = [];
  for (const file of eventFiles) {
    try {
      const events = JSON.parse(readFileSync(join(eventsDir, file), 'utf-8'));
      if (!Array.isArray(events)) continue;
      for (const event of events) {
        if (Array.isArray(event.media)) {
          for (const item of event.media) {
            if (item.thumbnail) urls.push(item.thumbnail);
          }
        }
      }
    } catch {
      // skip malformed event files
    }
  }

  return [...new Set(urls)];
}

function daysSince(dateStr: string): number {
  const then = new Date(dateStr).getTime();
  const now = Date.now();
  return Math.max(0, Math.floor((now - then) / 86_400_000));
}

/**
 * Computes a numeric score for a tracker candidate based on the video mode.
 *
 * Returns null if the candidate should be excluded entirely (e.g., wrong domain
 * or excluded tags in positive mode).
 */
export function scoreCandidate(candidate: ScoredCandidate, mode: VideoMode, history?: TrackerHistory): number | null {
  const age = daysSince(candidate.lastUpdated);

  if (mode === 'positive') {
    // REQUIRED: tone must be 'progress'
    if (candidate.tone !== 'progress') {
      return null;
    }

    let score = 50; // tone match bonus (always awarded since we passed the check)
    if (age <= 7) score += 30;
    else if (age <= 30) score += 15;
    else if (age <= 90) score += 5;
    if (candidate.temporal === 'live') score += 20;
    if (candidate.breaking) score += 15;
    if (candidate.dayCount > 1000) score += 5;
    if (history) {
      const penalty = cooldownPenalty(candidate.tracker.slug, history);
      const novelty = noveltyBonus(candidate.lastUpdated, candidate.tracker.slug, history);
      score = Math.max(0, score - penalty + novelty);
    }
    return score;
  }

  // conflict mode (default)
  let score = 0;
  if (candidate.breaking) score += 100;
  if (age <= 1) score += 30;
  else if (age <= 7) score += 15;
  else if (age <= 30) score += 5;
  if (candidate.domain === 'conflict') score += 10;
  if (candidate.temporal === 'live') score += 5;
  if (candidate.dayCount > 0) score += 3;
  if (history) {
    const penalty = cooldownPenalty(candidate.tracker.slug, history);
    const novelty = noveltyBonus(candidate.lastUpdated, candidate.tracker.slug, history);
    score = Math.max(0, score - penalty + novelty);
  }
  return score;
}

interface LoadedTrackerData {
  tracker: BreakingTracker;
  breaking: boolean;
  lastUpdated: string;
  tone?: string;
  domain?: string;
  temporal?: string;
  tags?: string[];
  dayCount: number;
}

function loadTrackerBreaking(slug: string): LoadedTrackerData | null {
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

    const thumbnailUrls = findThumbnailUrls(slug);

    const tracker: BreakingTracker = {
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
      thumbnailUrls,
    };

    const tone = config.tone ?? 'neutral';

    return {
      tracker,
      breaking: meta.breaking === true,
      lastUpdated: meta.lastUpdated ?? '2000-01-01',
      tone,
      domain: config.domain,
      temporal: config.temporal,
      tags: config.tags,
      dayCount: meta.dayCount ?? 0,
    };
  } catch {
    console.warn(`Failed to load tracker: ${slug}`);
    return null;
  }
}

export interface FetchBreakingOptions {
  mode?: VideoMode;
  dryRun?: boolean;
}

export function fetchBreakingData(options: FetchBreakingOptions = {}): BreakingData {
  const mode = options.mode ?? 'conflict';
  const dryRun = options.dryRun ?? false;

  if (!existsSync(TRACKERS_DIR)) {
    console.warn('Trackers directory not found, using sample data.');
    return SAMPLE_DATA;
  }

  const history = pruneHistory(loadHistory());

  const slugs = readdirSync(TRACKERS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const scored: ScoredCandidate[] = [];

  for (const slug of slugs) {
    const loaded = loadTrackerBreaking(slug);
    if (!loaded) continue;

    const candidate: ScoredCandidate = {
      tracker: loaded.tracker,
      score: 0,
      breaking: loaded.breaking,
      lastUpdated: loaded.lastUpdated,
      tone: loaded.tone,
      domain: loaded.domain,
      temporal: loaded.temporal,
      tags: loaded.tags,
      dayCount: loaded.dayCount,
    };

    const calculatedScore = scoreCandidate(candidate, mode, history);
    if (calculatedScore === null) continue; // excluded by mode filter

    candidate.score = calculatedScore;
    scored.push(candidate);
  }

  // Sort by score descending, then by lastUpdated descending as tiebreaker
  scored.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    return b.lastUpdated.localeCompare(a.lastUpdated);
  });

  if (dryRun) {
    const today = new Date().toISOString().split('T')[0];
    const modeLabel = mode.toUpperCase();
    console.log(`\n=== ${modeLabel} mode (${today}) ===`);
    for (let i = 0; i < Math.min(scored.length, 10); i++) {
      const c = scored[i];
      const rank = i < 3 ? `${i + 1}.` : `   ${i + 1}.`;
      const selected = i < 3 ? ' [SELECTED]' : '';
      console.log(`${rank} ${c.tracker.icon} ${c.tracker.name} — score: ${c.score}${selected}`);
      console.log(`   Headline: ${c.tracker.headline}`);
      console.log(`   KPI: ${c.tracker.kpiLabel} ${c.tracker.kpiValue}`);
      console.log(`   Domain: ${c.domain ?? 'n/a'} | Temporal: ${c.temporal ?? 'n/a'} | Days: ${c.dayCount}`);
      const baseScore = scoreCandidate(c, mode) ?? 0;
      const penalty = cooldownPenalty(c.tracker.slug, history);
      const novelty = noveltyBonus(c.lastUpdated, c.tracker.slug, history);
      console.log(`   Diversity: [base: ${baseScore}, cooldown: -${penalty}, novelty: ${novelty >= 0 ? '+' : ''}${novelty}]`);
      const slugDates = history.entries[c.tracker.slug];
      if (slugDates && slugDates.length > 0) {
        const lastDate = [...slugDates].sort().reverse()[0];
        const daysAgo = Math.max(0, Math.floor((Date.now() - new Date(lastDate).getTime()) / 86_400_000));
        console.log(`   Last in video: ${lastDate} (${daysAgo} day${daysAgo !== 1 ? 's' : ''} ago)`);
      }
      console.log('');
    }
    if (scored.length === 0) {
      console.log('  No trackers matched this mode.\n');
    }
  }

  const top3 = scored.slice(0, 3).map((c) => c.tracker);

  if (top3.length === 0) {
    console.warn('No active trackers found, using sample data.');
    return SAMPLE_DATA;
  }

  const today = new Date().toISOString().split('T')[0];
  return { date: today, trackers: top3 };
}

// Main execution — only when run directly
const isMain = import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('fetch-breaking.ts');

if (isMain) {
  const envMode = (process.env.VIDEO_MODE ?? 'conflict') as VideoMode;
  const mode: VideoMode = envMode === 'positive' ? 'positive' : 'conflict';
  const dryRun = process.argv.includes('--dry-run');

  const data = fetchBreakingData({ mode, dryRun });

  if (!dryRun) {
    const outputDir = resolve(OUTPUT_PATH, '..');
    if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

    writeFileSync(OUTPUT_PATH, JSON.stringify(data, null, 2));
    console.log(`Breaking data written to ${OUTPUT_PATH}`);
    console.log(`Date: ${data.date}`);
    console.log(`Mode: ${mode}`);
    console.log(`Trackers: ${data.trackers.map((t) => `${t.icon} ${t.name}`).join(', ')}`);
  }
}
