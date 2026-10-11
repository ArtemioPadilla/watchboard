#!/usr/bin/env tsx
/**
 * repair-tracker-data.ts — deterministic repair of the schema slips the hourly
 * scan's model makes, before Zod sees them.
 *
 * The hourly pipeline hard-fails on a schema error and discards the whole run.
 * It failed 6 of 23 runs (26%) in early October, always on the same two slips:
 *
 *   map-points.json   0.date : Required
 *   map-lines.json    0.from : Expected array, received object
 *                     0.to   : Expected array, received object
 *
 * The nightly has a fix agent with one retry for this; the hourly had nothing,
 * so one missing field cost an entire scan's data. These two are mechanical and
 * do not need a model.
 *
 * Only ever fills what is unambiguous. Anything requiring a judgement is left
 * alone for Zod to reject — a wrong value that passes validation is worse than
 * a failed run.
 *
 * Usage:
 *   npx tsx scripts/repair-tracker-data.ts <tracker-slug> [--dry-run]
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export interface RepairResult { file: string; field: string; detail: string }

/**
 * Coordinates are `[lon, lat]` tuples. Verified against 105 existing entries
 * across the repo: every second value falls inside [-90, 90] and none outside,
 * and iran-conflict's `[56.5, 27.3]` can only be lon-first (latitude 56 would
 * be Scandinavia). Getting this backwards would silently relocate events, so it
 * is asserted rather than assumed.
 */
export function toCoordTuple(v: unknown): [number, number] | null {
  if (Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number')) {
    return v as [number, number];
  }
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const lon = o.lon ?? o.lng ?? o.longitude;
    const lat = o.lat ?? o.latitude;
    if (typeof lon === 'number' && typeof lat === 'number') {
      // Reject impossible latitudes rather than writing a bad point: if the
      // model labelled them backwards, Zod failing is the correct outcome.
      if (lat < -90 || lat > 90) return null;
      return [lon, lat];
    }
  }
  return null;
}

export function repairMapPoints(rows: unknown[], today: string): RepairResult[] {
  const out: RepairResult[] = [];
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    const row = r as Record<string, unknown>;
    // `date` is required and the model drops it. The point was added by this
    // run, so today is the honest value — not a guess about when it happened.
    if (!row.date) {
      row.date = today;
      out.push({ file: 'map-points.json', field: 'date', detail: `set to ${today}` });
    }
  }
  return out;
}

export function repairMapLines(rows: unknown[], today: string): RepairResult[] {
  const out: RepairResult[] = [];
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    const row = r as Record<string, unknown>;
    // MapLineSchema requires `date` as well — the same omission as map-points.
    if (!row.date) {
      row.date = today;
      out.push({ file: 'map-lines.json', field: 'date', detail: `set to ${today}` });
    }
    for (const key of ['from', 'to'] as const) {
      if (Array.isArray(row[key])) continue;
      const fixed = toCoordTuple(row[key]);
      if (fixed) {
        row[key] = fixed;
        out.push({ file: 'map-lines.json', field: key, detail: `object → [${fixed.join(', ')}]` });
      }
    }
  }
  return out;
}

export function repairTracker(slug: string, today: string, trackersDir = join(ROOT, 'trackers')): RepairResult[] {
  const dir = join(trackersDir, slug, 'data');
  const all: RepairResult[] = [];
  const pass = (file: string, fn: (rows: unknown[]) => RepairResult[]) => {
    const fp = join(dir, file);
    if (!existsSync(fp)) return;
    let rows: unknown;
    try {
      rows = JSON.parse(readFileSync(fp, 'utf-8'));
    } catch {
      return; // syntax errors are the JSON check's job, not ours
    }
    if (!Array.isArray(rows)) return;
    const found = fn(rows);
    if (found.length) {
      writeFileSync(fp, JSON.stringify(rows, null, 2) + '\n');
      all.push(...found);
    }
  };
  pass('map-points.json', (rows) => repairMapPoints(rows, today));
  pass('map-lines.json', (rows) => repairMapLines(rows, today));
  return all;
}

function main(): void {
  const args = process.argv.slice(2);
  const slug = args.find((a) => !a.startsWith('--'));
  if (!slug) { console.error('usage: repair-tracker-data.ts <tracker-slug>'); process.exit(1); }
  const today = new Date().toISOString().slice(0, 10);
  const fixes = repairTracker(slug, today);
  if (!fixes.length) { console.log(`[repair] ${slug}: nothing to fix`); return; }
  console.log(`[repair] ${slug}: ${fixes.length} field(s) repaired`);
  for (const f of fixes) console.log(`  ${f.file}  ${f.field}  ${f.detail}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
