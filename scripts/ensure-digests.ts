/**
 * ensure-digests.ts — Pre-build digest backfill script.
 *
 * For each active tracker, finds event dates with no corresponding digest entry
 * and generates basic digest entries from event titles/details.
 *
 * This is a FALLBACK — it produces simpler summaries than the nightly Claude-powered
 * digests, but ensures RSS never freezes even if the nightly update fails.
 *
 * Run: npx tsx scripts/ensure-digests.ts
 */

import fs from 'node:fs';
import path from 'node:path';

// ── Types ──

interface TrackerConfig {
  slug: string;
  name: string;
  status: 'active' | 'archived' | 'draft';
}

interface TimelineEvent {
  id: string;
  title: string;
  detail: string;
  [key: string]: unknown;
}

interface DigestEntry {
  date: string;
  title: string;
  summary: string;
  sectionsUpdated?: string[];
}

// ── Constants ──

const TRACKERS_DIR = path.resolve('trackers');
const MAX_DIGEST_ENTRIES = 50;

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ── Helpers ──

/** Format a YYYY-MM-DD string as "Thu Apr 3, 2026" (weekday + abbreviated month + day, year) */
function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayName = DAY_NAMES[date.getUTCDay()];
  const monthName = MONTH_NAMES[date.getUTCMonth()];
  return `${dayName} ${monthName} ${d}, ${y}`;
}

/** Read and parse a JSON file, returning null on failure. */
function readJson<T>(filePath: string): T | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Generate a summary from event titles and details.
 * Grabs event titles and first sentences of details to form 3–5 sentence paragraph.
 */
function generateSummary(events: TimelineEvent[]): string {
  if (events.length === 0) return 'No significant events recorded.';

  const sentences: string[] = [];

  for (const event of events) {
    // Take the first sentence of the detail (up to first period + space, or 200 chars)
    const detail = (event.detail || '').trim();
    let firstSentence = '';
    const periodIdx = detail.indexOf('. ');
    if (periodIdx > 0 && periodIdx < 200) {
      firstSentence = detail.slice(0, periodIdx + 1);
    } else if (detail.length > 0) {
      // If no clear sentence break, use title as sentence
      firstSentence = event.title.endsWith('.') ? event.title : `${event.title}.`;
    }

    if (firstSentence) {
      sentences.push(firstSentence);
    }

    // Stop after enough content for a 3-5 sentence summary
    if (sentences.length >= 5) break;
  }

  // Ensure at least 3 sentences if we have more events
  if (sentences.length < 3 && events.length > sentences.length) {
    for (const event of events.slice(sentences.length)) {
      const title = event.title.endsWith('.') ? event.title : `${event.title}.`;
      sentences.push(title);
      if (sentences.length >= 3) break;
    }
  }

  return sentences.join(' ');
}

// ── Main ──

function main(): void {
  console.log('[ensure-digests] Starting digest backfill check...');

  if (!fs.existsSync(TRACKERS_DIR)) {
    console.error('[ensure-digests] Trackers directory not found:', TRACKERS_DIR);
    process.exit(1);
  }

  const trackerDirs = fs.readdirSync(TRACKERS_DIR).filter((d) => {
    return fs.statSync(path.join(TRACKERS_DIR, d)).isDirectory();
  });

  let totalBackfilled = 0;
  let trackersModified = 0;

  for (const slug of trackerDirs) {
    const configPath = path.join(TRACKERS_DIR, slug, 'tracker.json');
    const config = readJson<TrackerConfig>(configPath);

    if (!config) continue;
    if (config.status !== 'active' && config.status !== 'archived') continue;

    const dataDir = path.join(TRACKERS_DIR, slug, 'data');
    const eventsDir = path.join(dataDir, 'events');
    const digestsPath = path.join(dataDir, 'digests.json');

    // Skip if no events directory exists
    if (!fs.existsSync(eventsDir)) continue;

    // Read existing digests. If the file exists but cannot be parsed,
    // abort to avoid treating corrupted history as empty and overwriting it.
    let digests: DigestEntry[] = [];
    if (fs.existsSync(digestsPath)) {
      const parsedDigests = readJson<unknown>(digestsPath);
      if (parsedDigests === null) {
        console.error(`[ensure-digests] Failed to parse existing digests file: ${digestsPath}. Skipping tracker.`);
        continue;
      }
      if (!Array.isArray(parsedDigests)) {
        console.error(`[ensure-digests] Invalid digests file format: ${digestsPath}. Expected an array. Skipping tracker.`);
        continue;
      }
      digests = parsedDigests as DigestEntry[];
    }

    // Build set of existing digest dates
    const existingDates = new Set(digests.map((d) => d.date));

    // Find all event dates
    const eventFiles = fs.readdirSync(eventsDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .sort(); // chronological order

    // Find missing dates (have events but no digest)
    const missingDates: string[] = [];
    for (const file of eventFiles) {
      const date = file.replace('.json', '');
      if (!existingDates.has(date)) {
        // Verify the event file actually has events
        const events = readJson<TimelineEvent[]>(path.join(eventsDir, file));
        if (events && events.length > 0) {
          missingDates.push(date);
        }
      }
    }

    if (missingDates.length === 0) continue;

    // Pre-check: if adding these entries would all be trimmed anyway, skip.
    // Compute the effective date cutoff: after merging all entries, only the
    // newest MAX_DIGEST_ENTRIES survive. If all missing dates would fall below
    // that cutoff, there's nothing to do.
    const allDates = [...Array.from(existingDates), ...missingDates].sort((a, b) => b.localeCompare(a));
    const cutoffDate = allDates.length > MAX_DIGEST_ENTRIES
      ? allDates[MAX_DIGEST_ENTRIES - 1]
      : null;
    const actionableMissing = cutoffDate
      ? missingDates.filter((d) => d >= cutoffDate)
      : missingDates;

    if (actionableMissing.length === 0) continue;

    // Generate digest entries for actionable missing dates (chronological order)
    const newEntries: DigestEntry[] = [];
    for (const date of actionableMissing) {
      const events = readJson<TimelineEvent[]>(path.join(eventsDir, `${date}.json`));
      if (!events || events.length === 0) continue;

      const trackerName = config.name || slug;
      const formattedDate = formatDate(date);

      const entry: DigestEntry = {
        date,
        title: `${trackerName} Update — ${formattedDate}`,
        summary: generateSummary(events),
        sectionsUpdated: ['events'],
      };

      newEntries.push(entry);
      console.log(`[ensure-digests] ${slug}: backfilled digest for ${date} (${events.length} events)`);
    }

    if (newEntries.length === 0) continue;

    // Merge: add new entries, keeping newest-first order
    // All entries together, sort newest-first, then trim
    const allEntries = [...digests, ...newEntries];
    allEntries.sort((a, b) => b.date.localeCompare(a.date));

    // Trim to max entries (keep newest)
    const trimmed = allEntries.slice(0, MAX_DIGEST_ENTRIES);

    // Write back only if we actually changed something
    fs.writeFileSync(digestsPath, JSON.stringify(trimmed, null, 2) + '\n');

    totalBackfilled += newEntries.length;
    trackersModified++;
    console.log(`[ensure-digests] ${slug}: wrote ${newEntries.length} new digest entries (${trimmed.length} total)`);
  }

  if (totalBackfilled === 0) {
    console.log('[ensure-digests] All digests are up to date. No backfill needed.');
  } else {
    console.log(`[ensure-digests] Done. Backfilled ${totalBackfilled} digest entries across ${trackersModified} trackers.`);
  }
}

main();
