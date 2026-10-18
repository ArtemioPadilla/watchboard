#!/usr/bin/env tsx
/**
 * check-types.ts — run `tsc --noEmit` and fail only on errors that are not in
 * `types-baseline.json`. See scripts/lib/type-baseline.ts for why a baseline
 * rather than a clean gate.
 *
 * Usage:
 *   npm run check-types            # fail on new errors
 *   npm run check-types -- --update  # record the current set as the baseline
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import {
  buildBaseline,
  compareToBaseline,
  parseTscOutput,
  signatureOf,
  type Baseline,
} from './lib/type-baseline.js';

const BASELINE_PATH = 'types-baseline.json';
const update = process.argv.includes('--update');

// `src/env.d.ts` references astro/client, and the ambient types that come with
// it (the global JSX namespace among them) live in `.astro/types.d.ts` — which
// is generated, gitignored, and therefore present on a machine that has run a
// build and absent on a fresh clone or a CI runner. Without it tsc reports
// "Cannot find namespace 'JSX'" in files that are perfectly fine, and the
// inferred types in some messages change shape, so the same commit produced a
// different error set locally and in CI. `astro sync` is the supported way to
// generate it; ~4 s. `--no-sync` skips it for a quick local re-run.
if (!process.argv.includes('--no-sync')) {
  const sync = spawnSync('npx', ['astro', 'sync'], { encoding: 'utf8' });
  if (sync.status !== 0) {
    console.error('[check-types] `astro sync` failed — .astro/types.d.ts would be missing and the result would not be comparable:');
    console.error(`${sync.stdout ?? ''}${sync.stderr ?? ''}`.trim().slice(0, 2000));
    process.exit(1);
  }
}

// tsconfig.check.json, not the root config: it excludes video/, a separate
// package whose deps the root `npm ci` does not install. See that file.
const tsc = spawnSync('npx', ['tsc', '-p', 'tsconfig.check.json', '--noEmit'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const output = `${tsc.stdout ?? ''}${tsc.stderr ?? ''}`;
const errors = parseTscOutput(output);

// tsc exits 1 or 2 with diagnostics and 0 when clean. A nonzero exit with no
// parsed diagnostics means it did not get as far as type-checking (a bad
// tsconfig, a crash) — that must not be read as "no new errors".
if (tsc.status !== 0 && errors.length === 0) {
  console.error('tsc failed without reporting diagnostics — not a type-check result:');
  console.error(output.trim().slice(0, 4000) || `(no output, status ${tsc.status})`);
  process.exit(1);
}

if (update) {
  const baseline = buildBaseline(errors);
  writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`);
  console.log(`[check-types] wrote ${BASELINE_PATH}: ${baseline.total} errors in ${baseline.entries.length} signatures`);
  process.exit(0);
}

if (!existsSync(BASELINE_PATH)) {
  console.error(`[check-types] ${BASELINE_PATH} is missing — run: npm run check-types -- --update`);
  process.exit(1);
}

const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Baseline;
const { added, fixed, currentTotal, baselineTotal } = compareToBaseline(errors, baseline);

console.log(`[check-types] ${currentTotal} error(s) now, ${baselineTotal} in the baseline`);

if (fixed.size > 0) {
  const total = [...fixed.values()].reduce((a, b) => a + b, 0);
  console.log(`[check-types] ${total} baselined error(s) no longer occur — shrink the baseline with: npm run check-types -- --update`);
  for (const sig of fixed.keys()) console.log(`  fixed: ${sig.split('|').slice(0, 2).join(' ')}`);
}

if (added.length === 0) {
  console.log('[check-types] no new type errors');
  process.exit(0);
}

console.error(`\n[check-types] ${added.length} new type error(s):\n`);
for (const e of added) {
  console.error(`::error file=${e.file},line=${e.line},col=${e.col}::${e.code}: ${e.message}`);
  console.error(`  ${e.file}(${e.line},${e.col}): ${e.code}: ${e.message}`);
}
console.error(
  '\nFix them, or — if the error is pre-existing and this run simply surfaced it —\n' +
  'record it with: npm run check-types -- --update\n' +
  `Signatures ignore line numbers, so moved code is never reported as new (${signatureOf(added[0])}).`,
);
process.exit(1);
