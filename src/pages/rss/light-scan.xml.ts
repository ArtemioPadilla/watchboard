import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TriageLog, TriageLogEntry } from '../../../scripts/hourly-types';
import type { FeedMeta } from '../../lib/feed-registry';

export const feedMeta: FeedMeta = {
  title: 'Light-scan triage firehose',
  description:
    'Every candidate the 15-minute keyword-only light scan considers, with score, decision (post/defer), and matched tracker. Discards omitted to keep the feed dense. Built for downstream LLM consumption.',
  cadence: 'every 15 min (light scan cron)',
  category: 'triage',
  path: 'rss/light-scan.xml',
};

/**
 * RSS feed of every candidate the light scan has scored — posted, deferred, or
 * discarded. Refreshed on each push to main; the watchboard-bot commits the
 * triage log after every 15-minute scan, so each commit retriggers the deploy
 * and this feed stays fresh.
 *
 * Discards are excluded by default to keep the feed signal-dense; an
 * ?include=discard query string isn't honored (RSS endpoints are static).
 */

const MAX_ITEMS = 200;

function readLog(): TriageLog | null {
  // Resolve from project root (where public/ lives at build time).
  const path = join(process.cwd(), 'public', '_hourly', 'triage-log.json');
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as TriageLog;
  } catch {
    return null;
  }
}

// Plain text — @astrojs/rss entity-escapes descriptions, so any HTML here
// would render literally in readers.
function describe(e: TriageLogEntry): string {
  const c = e.candidate;
  const tracker = c.matchedTracker ?? 'unmatched';
  const tier = c.sourceTier ?? '?';
  const score = e.confidence.toFixed(2);
  return [
    `${e.decision.toUpperCase()} · score ${score} · tracker ${tracker} · ${c.source} (T${tier})`,
    e.reason,
    e.scanType === 'heavy' && e.model ? `model: ${e.model}` : '',
  ].filter(Boolean).join('\n');
}

export async function GET(context: APIContext) {
  const log = readLog();
  const entries = (log?.entries ?? [])
    .filter((e) => e.decision !== 'discard')
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, MAX_ITEMS);

  const items = entries.map((e) => ({
    title: `[${e.decision}] ${e.candidate.title}`,
    pubDate: new Date(e.timestamp),
    description: describe(e),
    link: e.candidate.url,
    customData: [
      `<category>${e.decision}</category>`,
      `<category>scan:${e.scanType}</category>`,
      e.candidate.matchedTracker ? `<category>tracker:${e.candidate.matchedTracker}</category>` : '',
    ].filter(Boolean).join(''),
  }));

  return rss({
    title: 'Watchboard — Light Scan Triage',
    description:
      'Every candidate the 15-minute light scan considers, with score and decision (post/defer). ' +
      'Discards omitted. LLM-friendly: each item links to the original article and tags the matched tracker.',
    site: context.site!,
    items,
    customData: '<language>en-us</language>',
  });
}
