/**
 * event-urls-node.ts — URLs already cited by recent tracker events.
 *
 * The light scan uses this to mark alerts whose candidate URL the heavy
 * scan has since turned into an event (plan E6.H2: the dotted pin gives way
 * to the real event, deduped by URL).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function collectRecentEventUrls(trackersDir: string, days = 7, now: Date = new Date()): Set<string> {
  const urls = new Set<string>();
  const cutoff = new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10);
  let slugs: string[] = [];
  try { slugs = readdirSync(trackersDir); } catch { return urls; }
  for (const slug of slugs) {
    const evDir = join(trackersDir, slug, 'data', 'events');
    if (!existsSync(evDir)) continue;
    let files: string[] = [];
    try { files = readdirSync(evDir); } catch { continue; }
    for (const f of files) {
      if (!f.endsWith('.json') || f.slice(0, 10) < cutoff) continue;
      let events: unknown;
      try { events = JSON.parse(readFileSync(join(evDir, f), 'utf8')); } catch { continue; }
      if (!Array.isArray(events)) continue;
      for (const ev of events) {
        const sources = (ev as { sources?: unknown }).sources;
        if (!Array.isArray(sources)) continue;
        for (const s of sources) {
          const u = typeof s === 'string' ? s : (s as { url?: unknown })?.url;
          if (typeof u === 'string' && u) urls.add(u);
        }
      }
    }
  }
  return urls;
}
