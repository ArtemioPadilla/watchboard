#!/usr/bin/env node
// Structural unions for hourly-scan rebase conflicts, so neither side's entries
// are lost (a whole-file --ours/--theirs silently drops the other side).
//   metrics-index : key = file, sort by timestamp, drop entries older than 90 days
//   by-id         : key = id; main's order first, then the job's new ids; job wins on a shared id
//   digests       : key = date + '::' + title, sort by date descending
// Usage: merge-json.mjs <mode> <ours(main)> <theirs(job)> <out>. Exit 2 on non-array input.
import { readFileSync, writeFileSync } from 'node:fs';
const [mode, oursPath, theirsPath, outPath] = process.argv.slice(2);
const read = p => JSON.parse(readFileSync(p, 'utf8'));
let main, job;
try { main = read(oursPath); job = read(theirsPath); } catch (e) { console.error(`merge-json: ${e.message}`); process.exit(2); }
if (!Array.isArray(main) || !Array.isArray(job)) { console.error('merge-json: both sides must be JSON arrays'); process.exit(2); }
const keyOf = { 'metrics-index': e => e.file, 'by-id': e => e.id, digests: e => `${e.date}::${e.title}` }[mode];
if (!keyOf) { console.error(`merge-json: unknown mode ${mode}`); process.exit(2); }
const merged = new Map();
for (const e of main) merged.set(keyOf(e), e);
for (const e of job) merged.set(keyOf(e), e); // Map keeps first-insertion order; job's value wins
let out = [...merged.values()];
if (mode === 'metrics-index') {
  const cutoff = new Date(Date.now() - 90 * 86400000).toISOString();
  out = out.filter(e => e.timestamp >= cutoff).sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
}
if (mode === 'digests') out.sort((a, b) => String(b.date).localeCompare(String(a.date)));
writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');
