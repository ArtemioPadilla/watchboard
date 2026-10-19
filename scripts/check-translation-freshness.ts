/**
 * How far behind the English each locale's tracker data has fallen.
 *
 * `translate-data.yml` has had its schedule commented out since April 2026.
 * Its last run, on the 14th, died with
 * `Claude Code returned an error result: You've hit your limit`. Nobody was
 * told, and nothing since has mentioned it: the Spanish, French and Portuguese
 * sites simply stopped moving while every page kept rendering, so the only
 * visible symptom was a dateline six months old inside copy nobody on the team
 * reads daily.
 *
 * This is the thing that would have said so. Non-blocking by design — stale
 * translations are not a reason to fail a data run, they are a reason to know.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const ROOT = resolve(import.meta.dirname ?? '.', '..');
const TRACKERS = join(ROOT, 'trackers');

/** A locale is current if it is no more than this far behind the English. */
export const FRESH_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface LocaleLag {
  slug: string;
  locale: string;
  /** Whole days the translation trails the English meta. */
  days: number;
}

/** Days `es` trails `en`, or null when either side cannot say. */
export function lagDays(enLastUpdated?: string, localeLastUpdated?: string, now = Date.now()): number | null {
  if (!enLastUpdated || !localeLastUpdated) return null;
  const en = Date.parse(enLastUpdated);
  const loc = Date.parse(localeLastUpdated);
  if (Number.isNaN(en) || Number.isNaN(loc)) return null;
  // Against the English timestamp, not against now: a tracker that has not
  // been updated in a year is not a stale translation, it is a quiet tracker.
  void now;
  return Math.floor((en - loc) / DAY_MS);
}

function readLastUpdated(path: string): string | undefined {
  if (!existsSync(path)) return undefined;
  try {
    return (JSON.parse(readFileSync(path, 'utf8')) as { lastUpdated?: string }).lastUpdated;
  } catch {
    return undefined;
  }
}

export function collectLags(trackersDir = TRACKERS): LocaleLag[] {
  const out: LocaleLag[] = [];
  for (const slug of readdirSync(trackersDir)) {
    const en = readLastUpdated(join(trackersDir, slug, 'data', 'meta.json'));
    if (!en) continue;
    for (const entry of readdirSync(join(trackersDir, slug), { withFileTypes: true })) {
      if (!entry.isDirectory() || !entry.name.startsWith('data-')) continue;
      const locale = entry.name.slice('data-'.length);
      const days = lagDays(en, readLastUpdated(join(trackersDir, slug, entry.name, 'meta.json')));
      if (days === null) continue;
      out.push({ slug, locale, days });
    }
  }
  return out;
}

/** The report, as lines. Pure, so the shape is testable. */
export function report(lags: LocaleLag[]): string[] {
  if (lags.length === 0) return ['No translated tracker data found.'];
  const byLocale = new Map<string, number[]>();
  for (const l of lags) {
    const bucket = byLocale.get(l.locale) ?? [];
    bucket.push(l.days);
    byLocale.set(l.locale, bucket);
  }
  const lines: string[] = [];
  for (const [locale, days] of [...byLocale.entries()].sort()) {
    const sorted = [...days].sort((a, b) => a - b);
    const stale = sorted.filter((d) => d > FRESH_DAYS).length;
    const median = sorted[Math.floor(sorted.length / 2)];
    lines.push(
      `${locale}: ${sorted.length} trackers · ${stale} stale (> ${FRESH_DAYS}d behind) · ` +
        `median ${median}d · worst ${sorted[sorted.length - 1]}d`,
    );
  }
  const worst = [...lags].sort((a, b) => b.days - a.days).slice(0, 5);
  if (worst[0] && worst[0].days > FRESH_DAYS) {
    lines.push('');
    lines.push('Furthest behind:');
    for (const w of worst) lines.push(`  ${w.days}d  ${w.slug} (${w.locale})`);
    lines.push('');
    lines.push('A locale that stops moving is invisible: every page still renders.');
    lines.push('Check .github/workflows/translate-data.yml — its schedule is off.');
  }
  return lines;
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename ?? '');
if (invokedDirectly) {
  for (const line of report(collectLags())) console.log(line);
}
