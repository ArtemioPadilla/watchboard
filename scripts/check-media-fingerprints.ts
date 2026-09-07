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
interface Job { file: string; eventId: string; item: MediaItem; url: string }
interface Change { file: string; eventId: string; url: string; from: boolean; to: boolean; reason?: string }

function readJson<T>(p: string): T | null {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) as T; } catch { return null; }
}

function collectJobs(slug: string): Job[] {
  const jobs: Job[] = [];
  const dataDir = path.join(TRACKERS_DIR, slug, 'data');
  const files: string[] = [];
  const evDir = path.join(dataDir, 'events');
  if (fs.existsSync(evDir)) for (const f of fs.readdirSync(evDir)) if (f.endsWith('.json')) files.push(path.join(evDir, f));
  const tl = path.join(dataDir, 'timeline.json');
  if (fs.existsSync(tl)) files.push(tl);
  for (const file of files) {
    const doc = readJson<unknown>(file);
    const events: { id?: string; media?: MediaItem[] }[] = Array.isArray(doc)
      ? (file.endsWith('timeline.json') ? (doc as { events?: unknown[] }[]).flatMap((era) => (era.events ?? []) as { id?: string; media?: MediaItem[] }[]) : (doc as { id?: string; media?: MediaItem[] }[]))
      : [];
    for (const ev of events) {
      for (const item of ev.media ?? []) {
        const url = item.thumbnail || (item.type === 'image' ? item.url : undefined);
        if (!url) continue;
        if (!item.etag && typeof item.contentLength !== 'number') continue;
        jobs.push({ file, eventId: ev.id ?? '?', item, url });
      }
    }
  }
  return jobs;
}

async function main() {
  const slugs = fs.readdirSync(TRACKERS_DIR).filter((s) => !trackerFilter || s === trackerFilter);
  const jobs = slugs.flatMap(collectJobs);
  console.log(`Fingerprint check: ${jobs.length} media items with a saved record${trackerFilter ? ` in ${trackerFilter}` : ''}${dryRun ? ' (dry run)' : ''}`);
  const startedAt = Date.now();
  let cursor = 0, checked = 0, skipped = 0, inconclusive = 0;
  const changes: Change[] = [];
  const touchedFiles = new Set<string>();

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
      if (verdict.suspect !== was) {
        changes.push({ file: job.file, eventId: job.eventId, url: job.url, from: was, to: verdict.suspect, reason: verdict.reason });
        if (!dryRun) {
          if (verdict.suspect) { job.item.suspect = true; job.item.suspectReason = verdict.reason; }
          else { delete job.item.suspect; delete job.item.suspectReason; }
          touchedFiles.add(job.file);
        }
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  // Items are mutated in place but the file objects were re-read per job, so
  // rewrite by re-walking: collectJobs kept references into the parsed docs,
  // which are not shared across files. Persist by re-reading and re-applying.
  if (!dryRun && touchedFiles.size > 0) {
    const byFile = new Map<string, Change[]>();
    for (const c of changes) byFile.set(c.file, [...(byFile.get(c.file) ?? []), c]);
    for (const [file, list] of byFile) {
      const doc = readJson<unknown>(file);
      if (!doc) continue;
      const events: { id?: string; media?: MediaItem[] }[] = file.endsWith('timeline.json')
        ? (doc as { events?: unknown[] }[]).flatMap((era) => (era.events ?? []) as { id?: string; media?: MediaItem[] }[])
        : (doc as { id?: string; media?: MediaItem[] }[]);
      for (const c of list) {
        const ev = events.find((e) => e.id === c.eventId);
        const item = ev?.media?.find((m) => (m.thumbnail || m.url) === c.url);
        if (!item) continue;
        if (c.to) { item.suspect = true; item.suspectReason = c.reason; }
        else { delete item.suspect; delete item.suspectReason; }
      }
      fs.writeFileSync(file, JSON.stringify(doc, null, 2) + '\n');
    }
  }

  const flagged = changes.filter((c) => c.to);
  const cleared = changes.filter((c) => !c.to);
  console.log(`  Probed: ${checked}  inconclusive: ${inconclusive}  skipped (budget): ${skipped}`);
  console.log(`  Newly suspect: ${flagged.length}  cleared: ${cleared.length}`);
  for (const c of flagged.slice(0, 30)) console.log(`  ⚠ ${path.relative(TRACKERS_DIR, c.file)} ${c.eventId} ${c.reason}: ${c.url}`);

  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) {
    const lines = [
      '### Media fingerprint check',
      '',
      `| Probed | Inconclusive | Skipped (budget) | Newly suspect | Cleared |`,
      `|---|---|---|---|---|`,
      `| ${checked} | ${inconclusive} | ${skipped} | ${flagged.length} | ${cleared.length} |`,
      '',
      ...flagged.slice(0, 30).map((c) => `- \`${path.relative(TRACKERS_DIR, c.file)}\` · ${c.eventId} · ${c.reason} · ${c.url}`),
      '',
    ];
    fs.appendFileSync(summary, lines.join('\n'));
  }
}

main().catch((err) => {
  console.error('check-media-fingerprints failed (non-blocking):', err);
});
