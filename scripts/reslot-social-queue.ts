#!/usr/bin/env tsx
/**
 * reslot-social-queue.ts — move past-due publish times in a queue file to
 * the future, and hand entries that now fall after midnight to the next
 * day's file, which is the only one its poster runs read (see
 * scripts/lib/social-schedule.ts). Run by the nightly's "Post-process social
 * queue" step right after the queue is merged.
 *
 * Usage: npx tsx scripts/reslot-social-queue.ts public/_social/queue-YYYY-MM-DD.json
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { mergeById, reslotQueue, splitByDay, type SchedulableEntry } from './lib/social-schedule.js';

type Entry = SchedulableEntry & { id?: string };

function readArray(text: string): Entry[] {
  try {
    const a = JSON.parse(text);
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}

/** The day's queue as main and the working tree hold it (a weekly thread may be on main). */
function loadExisting(path: string): Entry[] {
  let onMain: Entry[] = [];
  try {
    onMain = readArray(execFileSync('git', ['show', `origin/main:${path}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
  } catch {
    // not on main yet
  }
  const local = existsSync(path) ? readArray(readFileSync(path, 'utf8')) : [];
  return mergeById(local, onMain);
}

const file = process.argv[2];
const m = file ? /^queue-(\d{4}-\d{2}-\d{2})\.json$/.exec(basename(file)) : null;
if (!file || !m) {
  console.error('Usage: reslot-social-queue.ts <dir>/queue-YYYY-MM-DD.json');
  process.exit(1);
}
const fileDate = m[1];
const queue = readArray(readFileSync(file, 'utf8'));

const moved = reslotQueue(queue, new Date());
const { keep, later } = splitByDay(queue, fileDate);

// Today's file first: a crash between the writes can lose a moved entry but
// never leave it in two files, where both days' posters would publish it.
writeFileSync(file, JSON.stringify(keep, null, 2));
console.log(`Rescheduled ${moved} past-due entr${moved === 1 ? 'y' : 'ies'} in ${file}`);
for (const [day, entries] of later) {
  const target = join(dirname(file), `queue-${day}.json`);
  writeFileSync(target, JSON.stringify(mergeById(loadExisting(target), entries), null, 2));
  console.log(`Moved ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} scheduled on ${day} to ${target}`);
}
