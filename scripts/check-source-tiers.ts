#!/usr/bin/env tsx
/**
 * check-source-tiers.ts — flags data entries whose source does not support
 * the tier they claim.
 *
 * The tier scale is this project's core promise: Tier 1 is official/primary,
 * Tier 2 a major outlet, Tier 3 institutional, Tier 4 unverified. A Wikipedia
 * citation carrying tier 1 misrepresents exactly the thing readers are asked
 * to trust.
 *
 * Zod cannot catch this — `tier` is a valid number either way. It needs a
 * semantic check, which is what this is.
 *
 * Exit code is 0 unless --strict is passed: this reports on data written by a
 * model overnight, and failing the nightly over a citation would be worse than
 * the citation.
 *
 * Usage:
 *   npx tsx scripts/check-source-tiers.ts [--strict] [--json]
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TRACKERS = join(ROOT, 'trackers');

/**
 * Sources that cannot carry a Tier 1-2 claim on their own.
 *
 * Wikipedia is tertiary by construction. The others are aggregators or
 * user-generated: useful for finding a story, not for sourcing a figure at the
 * top of the scale.
 */
const NOT_PRIMARY = [
  'wikipedia', 'wikimedia', 'reddit', 'twitter.com', 'x.com',
  'youtube', 'blogspot', 'medium.com', 'substack',
];

export interface TierFinding {
  tracker: string;
  file: string;
  id: string;
  tier: number;
  source: string;
  /** True when a primary-looking source is also cited, which is defensible. */
  hasCompanion: boolean;
}

/** A source string is defensible at tier 1-2 if something else is cited too. */
export function hasPrimaryCompanion(source: string): boolean {
  // Compound citations like "UNAMA Quarterly Report / Pakistan ISPR / Wikipedia"
  // carry a real primary source; the tier reflects that one.
  const parts = source.split(/[/;,|]| and /i).map((p) => p.trim()).filter(Boolean);
  const nonTertiary = parts.filter(
    (p) => p.length > 2 && !NOT_PRIMARY.some((n) => p.toLowerCase().includes(n)),
  );
  return nonTertiary.length > 0;
}

export function checkEntry(
  entry: Record<string, unknown>,
  tracker: string,
  file: string,
): TierFinding | null {
  const tier = entry.tier;
  if (typeof tier !== 'number' || tier > 2) return null;
  const source = `${entry.source ?? ''} ${JSON.stringify(entry.sources ?? '')}`;
  if (!NOT_PRIMARY.some((n) => source.toLowerCase().includes(n))) return null;
  return {
    tracker,
    file,
    id: String(entry.id ?? entry.category ?? entry.label ?? '?'),
    tier,
    source: source.trim().slice(0, 120),
    hasCompanion: hasPrimaryCompanion(source),
  };
}

export function scanAll(trackersDir = TRACKERS): TierFinding[] {
  const out: TierFinding[] = [];
  if (!existsSync(trackersDir)) return out;
  for (const slug of readdirSync(trackersDir)) {
    const dataDir = join(trackersDir, slug, 'data');
    if (!existsSync(dataDir)) continue;
    for (const file of readdirSync(dataDir)) {
      if (!file.endsWith('.json')) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(readFileSync(join(dataDir, file), 'utf-8'));
      } catch {
        continue;
      }
      if (!Array.isArray(parsed)) continue;
      for (const entry of parsed) {
        if (entry && typeof entry === 'object') {
          const f = checkEntry(entry as Record<string, unknown>, slug, file);
          if (f) out.push(f);
        }
      }
    }
  }
  return out;
}

function main(): void {
  const strict = process.argv.includes('--strict');
  const asJson = process.argv.includes('--json');
  const findings = scanAll();
  const bare = findings.filter((f) => !f.hasCompanion);

  if (asJson) {
    console.log(JSON.stringify({ total: findings.length, bare: bare.length, findings }, null, 2));
  } else {
    console.log(`[tiers] ${findings.length} entries cite a non-primary source at tier 1-2`);
    console.log(`[tiers] ${bare.length} of those cite NOTHING else — the ones that matter`);
    for (const f of bare.slice(0, 20)) {
      console.log(`  ${f.tracker}/${f.file}  tier=${f.tier}  ${f.id}`);
      console.log(`     ${f.source}`);
    }
  }
  if (strict && bare.length > 0) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
