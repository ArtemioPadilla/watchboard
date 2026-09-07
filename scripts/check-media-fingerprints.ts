/**
 * check-media-fingerprints.ts — flag thumbnails whose body changed.
 *
 * Walks every tracker's event partitions and timeline, HEAD-probes each
 * media item that carries a saved fingerprint (written by backfill-media),
 * and sets `suspect: true` (with `suspectReason`) when ETag or
 * Content-Length disagree with the record. Items whose probe agrees again
 * get the flag cleared. Items without a record are skipped: nothing to
 * compare, nothing to claim.
 *
 * Each job keeps a reference to the parsed document and the exact item
 * (file → event index → media index), so two items sharing a URL, events
 * without an id, or duplicate ids can never receive each other's verdict.
 *
 * Bounded like the nightly HEAD audit: pooled requests and a wall-clock
 * budget, so it can never starve the finalize job. Always exits 0.
 *
 * Usage:
 *   npx tsx scripts/check-media-fingerprints.ts [--tracker slug] [--dry-run] [--budget-ms 240000]
 */
import fs from 'node:fs';
import path from 'node:path';
import { compareFingerprint, observeHeaders } from './lib/media-fingerprint.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const trackerIdx = args.indexOf('--tracker');
const trackerFilter = trackerIdx !== -1 ? args[trackerIdx + 1] : null;
const budgetIdx = args.indexOf('--budget-ms');
const BUDGET_MS = budgetIdx !== -1 ? Number(args[budgetIdx + 1]) || 240_000 : 240_000;
const CONCURRENCY = 16;
const TRACKERS_DIR = path.resolve('trackers');

interface MediaItem {
  thumbnail?: string;
  url?: string;
  type?: string;
  etag?: string;
  contentLength?: number;
  suspect?: boolean;
  suspectReason?: string;
  [k: string]: unknown;
}
interface EventLike { id?: unknown; media?: unknown }
interface Doc { file: string; root: unknown; events: EventLike[]; dirty: boolean }
interface Job { doc: Doc; eventLabel: string; item: MediaItem; url: string }
interface Change { file: string; eventLabel: string; url: string; to: boolean; reason?: string }

function readJson(p: string): unknown {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return undefined; }
}

/** Events of a partition (array) or of a timeline (eras with `events`). Anything else contributes nothing. */
function eventsOf(root: unknown, isTimeline: boolean): EventLike[] {
  if (!Array.isArray(root)) return [];
  if (!isTimeline) return root.filter((e): e is EventLike => !!e && typeof e === 'object');
  const out: EventLike[] = [];
  for (const era of root) {
    const evs = (era as { events?: unknown })?.events;
    if (Array.isArray(evs)) for (const e of evs) if (e && typeof e === 'object') out.push(e as EventLike);
  }
  return out;
}

export function collectJobs(slug: string, dir: string = TRACKERS_DIR): { jobs: Job[]; docs: Doc[] } {
  const jobs: Job[] = [];
  const docs: Doc[] = [];
  const dataDir = path.join(dir, slug, 'data');
  const files: string[] = [];
  const evDir = path.join(dataDir, 'events');
  if (fs.existsSync(evDir)) for (const f of fs.readdirSync(evDir)) if (f.endsWith('.json')) files.push(path.join(evDir, f));
  const tl = path.join(dataDir, 'timeline.json');
  if (fs.existsSync(tl)) files.push(tl);
  for (const file of files) {
    const root = readJson(file);
    if (root === undefined) continue;
    const doc: Doc = { file, root, events: eventsOf(root, file.endsWith('timeline.json')), dirty: false };
    docs.push(doc);
    doc.events.forEach((ev, ei) => {
      if (!Array.isArray(ev.media)) return;
      ev.media.forEach((raw, mi) => {
        if (!raw || typeof raw !== 'object') return;
        const item = raw as MediaItem;
        const url = item.thumbnail || (item.type === 'image' ? item.url : undefined);
        if (!url) return;
        if (!item.etag && typeof item.contentLength !== 'number') return;
        const id = typeof ev.id === 'string' ? ev.id : `#${ei}`;
        jobs.push({ doc, eventLabel: `${id}[${mi}]`, item, url });
      });
    });
  }
  return { jobs, docs };
}

async function main() {
  const slugs = fs.readdirSync(TRACKERS_DIR).filter((s) => !trackerFilter || s === trackerFilter);
  const jobs: Job[] = [];
  const docs: Doc[] = [];
  for (const slug of slugs) { const r = collectJobs(slug); jobs.push(...r.jobs); docs.push(...r.docs); }
  console.log(`Fingerprint check: ${jobs.length} media items with a saved record${trackerFilter ? ` in ${trackerFilter}` : ''}${dryRun ? ' (dry run)' : ''}`);
  const startedAt = Date.now();
  let cursor = 0, checked = 0, skipped = 0, inconclusive = 0;
  const changes: Change[] = [];

  async function worker() {
    for (;;) {
      const i = cursor++;
      if (i >= jobs.length) return;
      if (Date.now() - startedAt > BUDGET_MS) { skipped++; continue; }
      const job = jobs[i];
      const observed = await observeHeaders(job.url);
      const verdict = compareFingerprint(job.item, observed);
      checked++;
      if (verdict.inconclusive) { inconclusive++; continue; }
      const was = job.item.suspect === true;
      if (verdict.suspect === was) continue;
      changes.push({ file: job.doc.file, eventLabel: job.eventLabel, url: job.url, to: verdict.suspect, reason: verdict.reason });
      if (dryRun) continue;
      // Mutate the exact item inside the parsed document; the document is
      // written back once, so no id or URL lookup can misroute a verdict.
      if (verdict.suspect) { job.item.suspect = true; job.item.suspectReason = verdict.reason; }
      else { delete job.item.suspect; delete job.item.suspectReason; }
      job.doc.dirty = true;
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  if (!dryRun) {
    for (const doc of docs) {
      if (!doc.dirty) continue;
      fs.writeFileSync(doc.file, JSON.stringify(doc.root, null, 2) + '\n');
    }
  }

  const flagged = changes.filter((c) => c.to);
  const cleared = changes.filter((c) => !c.to);
  console.log(`  Probed: ${checked}  inconclusive: ${inconclusive}  skipped (budget): ${skipped}`);
  console.log(`  Newly suspect: ${flagged.length}  cleared: ${cleared.length}${dryRun ? ' (not written)' : ''}`);
  for (const c of flagged.slice(0, 30)) console.log(`  ⚠ ${path.relative(TRACKERS_DIR, c.file)} ${c.eventLabel} ${c.reason}: ${c.url}`);

  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) {
    const lines = [
      `### Media fingerprint check${dryRun ? ' (dry run)' : ''}`,
      '',
      `| Probed | Inconclusive | Skipped (budget) | Newly suspect | Cleared |`,
      `|---|---|---|---|---|`,
      `| ${checked} | ${inconclusive} | ${skipped} | ${flagged.length} | ${cleared.length} |`,
      '',
      ...flagged.slice(0, 30).map((c) => `- \`${path.relative(TRACKERS_DIR, c.file)}\` · ${c.eventLabel} · ${c.reason} · ${c.url}`),
      '',
    ];
    fs.appendFileSync(summary, lines.join('\n'));
  }
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isDirect) {
  main().catch((err) => {
    console.error('check-media-fingerprints failed (non-blocking):', err);
  });
}
