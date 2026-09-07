/**
 * stamp-provenance.ts — guarantee AI-written copy carries `provenance`.
 *
 * The nightly prompt asks the model to emit `provenance` on digest entries
 * and meta.json, and models forget fields (see "Stamp update-log" in
 * update-data.yml for the same lesson). This runs in the finalize phase for
 * the trackers the run touched and fills in what is missing, so the badge in
 * the UI reflects reality rather than the model's memory.
 *
 * Rules (only when `provenance` is absent):
 *   - digests dated today, source daily|breaking|seed → llm / claude
 *   - digests with source `freshness` → heuristic (written by ensure-digests)
 *   - meta.json whose lastUpdated is today AND whose heroHeadline differs
 *     from HEAD → llm / claude (a lastUpdated-only touch keeps its provenance)
 *
 * Usage:
 *   npx tsx scripts/stamp-provenance.ts --trackers a,b,c [--pipeline update-data] [--dry-run]
 *   npx tsx scripts/stamp-provenance.ts --all   # every tracker, today's entries only
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { makeProvenance } from '../src/lib/provenance';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const all = args.includes('--all');
const trackersIdx = args.indexOf('--trackers');
// Accepts "a,b" or "a b" — the resolve job emits a space-separated list.
const trackers = trackersIdx !== -1 ? (args[trackersIdx + 1] ?? '').split(/[\s,]+/).map((s) => s.trim()).filter(Boolean) : [];
const pipelineIdx = args.indexOf('--pipeline');
const pipeline = pipelineIdx !== -1 ? args[pipelineIdx + 1] : 'update-data';
const TRACKERS_DIR = path.resolve('trackers');
const today = (process.env.STAMP_TODAY ?? new Date().toISOString()).slice(0, 10);

if (!all && trackers.length === 0) {
  console.log('stamp-provenance: nothing to do (pass --trackers a,b or --all)');
  process.exit(0);
}

/** True when HEAD has no meta.json for this path or its heroHeadline differs. */
function headlineChanged(metaPath: string, current: string): boolean {
  try {
    const rel = path.relative(process.cwd(), metaPath).split(path.sep).join('/');
    const prev = execFileSync('git', ['show', `HEAD:${rel}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const before = JSON.parse(prev) as Meta;
    return before.heroHeadline !== current;
  } catch {
    return true; // new file or no git: nothing to compare against
  }
}

function readJson<T>(p: string): T | null {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) as T; } catch { return null; }
}

interface Digest { date: string; source?: string; provenance?: unknown; [k: string]: unknown }
interface Meta { lastUpdated?: string; heroHeadline?: string; provenance?: unknown; [k: string]: unknown }

let stampedDigests = 0, stampedMeta = 0;
const slugs = all ? fs.readdirSync(TRACKERS_DIR) : trackers;
for (const slug of slugs) {
  const dataDir = path.join(TRACKERS_DIR, slug, 'data');
  if (!fs.existsSync(dataDir)) { console.warn(`stamp-provenance: no data dir for ${slug}, skipping`); continue; }
  const digestsPath = path.join(dataDir, 'digests.json');
  const digests = readJson<Digest[]>(digestsPath);
  if (Array.isArray(digests)) {
    let changed = false;
    for (const d of digests) {
      if (d.provenance) continue;
      if (d.source === 'freshness') {
        d.provenance = makeProvenance('heuristic', { pipeline: 'ensure-digests' });
        changed = true; stampedDigests++;
      } else if (d.date === today) {
        d.provenance = makeProvenance('llm', { pipeline });
        changed = true; stampedDigests++;
      }
    }
    if (changed && !dryRun) fs.writeFileSync(digestsPath, JSON.stringify(digests, null, 2) + '\n');
  }
  const metaPath = path.join(dataDir, 'meta.json');
  const meta = readJson<Meta>(metaPath);
  // Only a headline that actually changed in this run is model-written now;
  // a meta.json touched for lastUpdated alone keeps whatever provenance it had.
  if (meta && !meta.provenance && meta.heroHeadline && typeof meta.lastUpdated === 'string' && meta.lastUpdated.slice(0, 10) === today && headlineChanged(metaPath, meta.heroHeadline)) {
    meta.provenance = makeProvenance('llm', { pipeline });
    stampedMeta++;
    if (!dryRun) fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n');
  }
}
console.log(`stamp-provenance${dryRun ? ' (dry run)' : ''}: ${stampedDigests} digest entries, ${stampedMeta} meta files stamped for ${today}`);
