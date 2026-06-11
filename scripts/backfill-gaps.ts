/**
 * Auto-gap detector — finds dates with missing data coverage and backfills them.
 * Designed to run after the nightly update in CI.
 * Caps at MAX_GAPS_PER_RUN to limit API costs.
 *
 * Usage: npx tsx scripts/backfill-gaps.ts [--tracker <slug>]
 */
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

// Default kept for back-compat with the original single-theater layout.
const DEFAULT_TRACKER = 'iran-conflict';

function parseTrackerArg(): string {
  const args = process.argv.slice(2);
  const idx = args.indexOf('--tracker');
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return DEFAULT_TRACKER;
}

const TRACKER = parseTrackerArg();
if (!/^[a-z0-9-]+$/.test(TRACKER)) {
  console.error(`[backfill-gaps] Invalid tracker slug: ${TRACKER}`);
  process.exit(1);
}

const DATA_DIR = join(process.cwd(), 'trackers', TRACKER, 'data');
const EVENTS_DIR = join(DATA_DIR, 'events');
const MAX_GAPS_PER_RUN = parseInt(process.env.MAX_BACKFILL_GAPS || '5', 10);

interface DateCoverage {
  date: string;
  hasEvents: boolean;
  hasPoints: boolean;
  hasLines: boolean;
  score: number; // 0 = full gap, 3 = full coverage
}

function dateRange(from: string, to: string): string[] {
  const dates: string[] = [];
  const current = new Date(from + 'T00:00:00Z');
  const end = new Date(to + 'T00:00:00Z');
  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]);
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

function main() {
  if (!existsSync(DATA_DIR)) {
    console.error(`[backfill-gaps] Tracker data dir not found: ${DATA_DIR}`);
    process.exit(1);
  }
  console.log(`[backfill-gaps] Tracker: ${TRACKER}`);

  // Determine the date range from existing data
  const points = existsSync(join(DATA_DIR, 'map-points.json'))
    ? JSON.parse(readFileSync(join(DATA_DIR, 'map-points.json'), 'utf8'))
    : [];
  const lines = existsSync(join(DATA_DIR, 'map-lines.json'))
    ? JSON.parse(readFileSync(join(DATA_DIR, 'map-lines.json'), 'utf8'))
    : [];

  const allDates = [
    ...points.map((p: { date: string }) => p.date),
    ...lines.map((l: { date: string }) => l.date),
  ].sort();

  if (allDates.length === 0) {
    console.log('[backfill-gaps] No date range found in data. Nothing to do.');
    return;
  }

  const minDate = allDates[0];
  const maxDate = allDates[allDates.length - 1];
  const dates = dateRange(minDate, maxDate);

  // Build sets for quick lookup
  const pointDates = new Set(points.map((p: { date: string }) => p.date));
  const lineDates = new Set(lines.map((l: { date: string }) => l.date));
  const eventFiles = existsSync(EVENTS_DIR)
    ? new Set(readdirSync(EVENTS_DIR).filter(f => f.endsWith('.json')).map(f => f.replace('.json', '')))
    : new Set<string>();

  // Analyze coverage per date
  const coverage: DateCoverage[] = dates.map(date => {
    const hasEvents = eventFiles.has(date);
    const hasPoints = pointDates.has(date);
    const hasLines = lineDates.has(date);
    const score = (hasEvents ? 1 : 0) + (hasPoints ? 1 : 0) + (hasLines ? 1 : 0);
    return { date, hasEvents, hasPoints, hasLines, score };
  });

  // Find gaps — dates with incomplete coverage, sorted by worst gaps first
  const gaps = coverage
    .filter(c => c.score < 3)
    .sort((a, b) => a.score - b.score || a.date.localeCompare(b.date));

  if (gaps.length === 0) {
    console.log(`[backfill-gaps] Full coverage for all ${dates.length} dates (${minDate} to ${maxDate}). Nothing to do.`);
    return;
  }

  console.log(`[backfill-gaps] Found ${gaps.length} dates with incomplete coverage (${minDate} to ${maxDate})`);
  console.log(`[backfill-gaps] Coverage summary:`);

  const fullGaps = gaps.filter(g => g.score === 0).length;
  const partialGaps = gaps.filter(g => g.score > 0 && g.score < 3).length;
  const fullCoverage = coverage.filter(c => c.score === 3).length;
  console.log(`  Full coverage: ${fullCoverage}/${dates.length} dates`);
  console.log(`  Partial gaps:  ${partialGaps} dates`);
  console.log(`  Empty dates:   ${fullGaps} dates`);

  // Select gaps to backfill (prioritize worst gaps)
  const toBackfill = gaps.slice(0, MAX_GAPS_PER_RUN);
  console.log(`\n[backfill-gaps] Backfilling ${toBackfill.length} dates (max ${MAX_GAPS_PER_RUN} per run):`);
  for (const g of toBackfill) {
    const missing = [];
    if (!g.hasEvents) missing.push('events');
    if (!g.hasPoints) missing.push('points');
    if (!g.hasLines) missing.push('lines');
    console.log(`  ${g.date}: missing ${missing.join(', ')}`);
  }

  // Run backfill for each gap date individually
  // We call backfill.ts with --from and --to set to the same date
  for (const gap of toBackfill) {
    console.log(`\n[backfill-gaps] Backfilling ${gap.date}...`);
    try {
      execSync(
        `npx tsx scripts/backfill.ts --from ${gap.date} --to ${gap.date} --tracker ${TRACKER}`,
        { stdio: 'inherit', cwd: process.cwd() },
      );
    } catch (err) {
      console.error(`[backfill-gaps] Failed to backfill ${gap.date}:`, err);
    }
  }

  console.log(`\n[backfill-gaps] Done. Backfilled ${toBackfill.length} dates.`);
}

main();
