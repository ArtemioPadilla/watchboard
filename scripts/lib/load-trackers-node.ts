/**
 * Node-only tracker loader for tsx scripts (scripts/hourly-*.ts etc.).
 *
 * src/lib/tracker-registry.ts uses import.meta.glob (Vite-only) and is also
 * pulled into the browser bundle via constants.ts → MilitaryTabs.tsx, so it
 * can't be used outside Vite/Astro. This module mirrors loadAllTrackers()
 * for plain Node by reading the per-tracker tracker.json files off disk.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TrackerConfigSchema, type TrackerConfig } from '../../src/lib/tracker-config.js';

let _cache: TrackerConfig[] | null = null;

export function loadAllTrackers(): TrackerConfig[] {
  if (_cache) return _cache;
  const here = dirname(fileURLToPath(import.meta.url));
  const trackersDir = join(here, '..', '..', 'trackers');
  const configs: TrackerConfig[] = [];
  for (const entry of readdirSync(trackersDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(join(trackersDir, entry.name, 'tracker.json'), 'utf8'));
    } catch {
      continue; // skip dirs without tracker.json
    }
    try {
      configs.push(TrackerConfigSchema.parse(raw));
    } catch (err) {
      console.error(`Invalid tracker config for "${entry.name}":`, err);
    }
  }
  const order = { active: 0, archived: 1, draft: 2 };
  configs.sort((a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name));
  _cache = configs;
  return configs;
}
