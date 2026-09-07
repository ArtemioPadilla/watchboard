/**
 * event-urls-node.ts — URLs already cited by recent tracker events.
 *
 * The light scan uses this to mark alerts whose candidate URL the heavy
 * scan has since turned into an event (plan E6.H2: the dotted pin gives way
 * to the real event, deduped by URL).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveEventDate } from '../../src/lib/timeline-utils.js';

export function collectRecentEventUrls(trackersDir: string, days = 7, now: Date = new Date()): Set<string> {
  const urls = new Set<string>();
  const cutoff = new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10);
  let slugs: string[] = [];
  try { slugs = readdirSync(trackersDir); } catch { return urls; }
  for (const slug of slugs) {
    const addSources = (ev: unknown) => {
      const sources = (ev as { sources?: unknown })?.sources;
      if (!Array.isArray(sources)) return;
      for (const s of sources) {
        const u = typeof s === 'string' ? s : (s as { url?: unknown })?.url;
        if (typeof u === 'string' && u) urls.add(u);
      }
    };
    const evDir = join(trackersDir, slug, 'data', 'events');
    if (existsSync(evDir)) {
      let files: string[] = [];
      try { files = readdirSync(evDir); } catch { files = []; }
      for (const f of files) {
        if (!f.endsWith('.json') || f.slice(0, 10) < cutoff) continue;
        let events: unknown;
        try { events = JSON.parse(readFileSync(join(evDir, f), 'utf8')); } catch { continue; }
        if (Array.isArray(events)) events.forEach(addSources);
      }
    }
    // Trackers whose canonical events live in timeline.json (era-grouped,
    // dated by a human `year` string) must resolve pins too.
    const tl = join(trackersDir, slug, 'data', 'timeline.json');
    if (existsSync(tl)) {
      let eras: unknown;
      try { eras = JSON.parse(readFileSync(tl, 'utf8')); } catch { eras = null; }
      if (Array.isArray(eras)) {
        for (const era of eras) {
          const events = (era as { events?: unknown })?.events;
          if (!Array.isArray(events)) continue;
          for (const ev of events) {
            const d = resolveEventDate(String((ev as { year?: unknown })?.year ?? ''));
            if (d && d >= cutoff) addSources(ev);
          }
        }
      }
    }
  }
  return urls;
}
