#!/usr/bin/env tsx
/**
 * build-scout-coverage.ts — writes the recent-coverage table the scout reads.
 *
 * Run before the scout agent. Output goes to a file rather than a workflow
 * output: 130 trackers of titles is far past what belongs in an env var, and
 * a truncated table would silently give the model partial evidence — which
 * is the failure this whole thing exists to prevent.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { summarise, renderCoverage, type RawEvent, type TrackerCoverage } from './lib/tracker-coverage.js';

const OUT = 'scout-coverage.txt';

function eventsOf(dir: string): RawEvent[] {
  const out: RawEvent[] = [];
  const partitions = join(dir, 'events');
  if (existsSync(partitions)) {
    for (const f of readdirSync(partitions).filter((f) => f.endsWith('.json'))) {
      try { out.push(...JSON.parse(readFileSync(join(partitions, f), 'utf8'))); } catch { /* skip */ }
    }
  }
  const timeline = join(dir, 'timeline.json');
  if (existsSync(timeline)) {
    try {
      for (const era of JSON.parse(readFileSync(timeline, 'utf8'))) {
        if (Array.isArray(era?.events)) out.push(...era.events);
      }
    } catch { /* skip */ }
  }
  return out;
}

function main(): void {
  const year = new Date().getUTCFullYear();
  const all: TrackerCoverage[] = [];
  for (const slug of readdirSync('trackers')) {
    const data = join('trackers', slug, 'data');
    if (!existsSync(data)) continue;
    all.push(summarise(slug, eventsOf(data), year));
  }
  const table = renderCoverage(all);
  writeFileSync(OUT, table);
  const active = all.filter((c) => c.recentCount > 0).length;
  console.log(`[coverage] ${all.length} trackers, ${active} with ${year} events -> ${OUT} (${table.length} chars)`);
  if (!active) console.log('::warning::no tracker has events this year — the scout will get no coverage signal');
}

main();
