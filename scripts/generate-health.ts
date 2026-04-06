/**
 * generate-health.ts — Build-time health status generator.
 *
 * Creates public/_health/status.json with per-tracker digest/event freshness info,
 * overall health status, and digest gap alerts.
 *
 * Run: npx tsx scripts/generate-health.ts
 */

import fs from 'node:fs';
import path from 'node:path';

// ── Types ──

interface TrackerConfig {
  slug: string;
  name: string;
  status: 'active' | 'archived' | 'draft';
}

interface DigestEntry {
  date: string;
  title: string;
  summary: string;
  sectionsUpdated?: string[];
}

interface Meta {
  lastUpdated: string;
  [key: string]: unknown;
}

interface TrackerHealth {
  lastEvent: string | null;
  lastDigest: string | null;
  digestGap: number;
  lastUpdated: string | null;
}

interface HealthStatus {
  lastBuild: string;
  trackers: Record<string, TrackerHealth>;
  digestGaps: string[];
  healthy: boolean;
}

// ── Constants ──

const TRACKERS_DIR = path.resolve('trackers');
const OUTPUT_DIR = path.resolve('public', '_health');
const OUTPUT_PATH = path.join(OUTPUT_DIR, 'status.json');

// ── Helpers ──

function readJson<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

/** Get the most recent YYYY-MM-DD from an array of event filenames. */
function getLatestEventDate(eventsDir: string): string | null {
  if (!fs.existsSync(eventsDir)) return null;
  const files = fs.readdirSync(eventsDir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort();
  if (files.length === 0) return null;
  return files[files.length - 1].replace('.json', '');
}

/** Calculate days between two YYYY-MM-DD date strings. */
function daysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA + 'T00:00:00Z');
  const b = new Date(dateB + 'T00:00:00Z');
  return Math.round(Math.abs(b.getTime() - a.getTime()) / 86_400_000);
}

// ── Main ──

function main(): void {
  console.log('[generate-health] Generating health status...');

  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  const status: HealthStatus = {
    lastBuild: now.toISOString(),
    trackers: {},
    digestGaps: [],
    healthy: true,
  };

  if (!fs.existsSync(TRACKERS_DIR)) {
    console.error('[generate-health] Trackers directory not found:', TRACKERS_DIR);
    process.exit(1);
  }

  const trackerDirs = fs.readdirSync(TRACKERS_DIR).filter((d) => {
    return fs.statSync(path.join(TRACKERS_DIR, d)).isDirectory();
  });

  for (const slug of trackerDirs) {
    const configPath = path.join(TRACKERS_DIR, slug, 'tracker.json');
    const config = readJson<TrackerConfig>(configPath);

    if (!config || config.status === 'draft') continue;

    const dataDir = path.join(TRACKERS_DIR, slug, 'data');
    const eventsDir = path.join(dataDir, 'events');
    const digestsPath = path.join(dataDir, 'digests.json');
    const metaPath = path.join(dataDir, 'meta.json');

    // Latest event date
    const lastEvent = getLatestEventDate(eventsDir);

    // Latest digest date
    const digests = readJson<DigestEntry[]>(digestsPath) ?? [];
    const sortedDigests = [...digests].sort((a, b) => b.date.localeCompare(a.date));
    const lastDigest = sortedDigests.length > 0 ? sortedDigests[0].date : null;

    // Meta lastUpdated
    const meta = readJson<Meta>(metaPath);
    const lastUpdated = meta?.lastUpdated ?? null;

    // Calculate digest gap: days between last event and last digest
    let digestGap = 0;
    if (lastEvent && lastDigest) {
      digestGap = daysBetween(lastDigest, lastEvent);
      // Only count as gap if events are NEWER than digests
      if (lastEvent > lastDigest) {
        digestGap = daysBetween(lastDigest, lastEvent);
      } else {
        digestGap = 0;
      }
    } else if (lastEvent && !lastDigest) {
      // Events exist but no digests at all
      digestGap = daysBetween(lastEvent, today);
    }

    status.trackers[slug] = {
      lastEvent,
      lastDigest,
      digestGap,
      lastUpdated,
    };

    // Flag significant gaps (> 1 day for active trackers)
    if (digestGap > 1 && config.status === 'active') {
      status.digestGaps.push(`${slug}:${digestGap} days`);
      status.healthy = false;
    }
  }

  // Ensure output directory exists
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Write status file
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(status, null, 2) + '\n');

  const trackerCount = Object.keys(status.trackers).length;
  const gapCount = status.digestGaps.length;

  console.log(`[generate-health] Wrote health status for ${trackerCount} trackers.`);
  if (gapCount > 0) {
    console.log(`[generate-health] ⚠️  ${gapCount} trackers have digest gaps:`);
    for (const gap of status.digestGaps) {
      console.log(`  - ${gap}`);
    }
  } else {
    console.log('[generate-health] ✅ All trackers healthy.');
  }
}

main();
