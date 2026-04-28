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

function describe(e: TriageLogEntry): string {
  const c = e.candidate;
  const tracker = c.matchedTracker ?? 'unmatched';
  const tier = c.sourceTier ?? '?';
  const score = e.confidence.toFixed(2);
  return [
    `<p><strong>${e.decision.toUpperCase()}</strong> · score ${score} · tracker <code>${tracker}</code> · ${c.source} (T${tier})</p>`,
    `<p>${escape(e.reason)}</p>`,
    e.scanType === 'heavy' && e.model ? `<p>model: ${e.model}</p>` : '',
  ].join('');
}

function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
      `<guid isPermaLink="false">${escape(e.candidate.url)}::${e.timestamp}</guid>`,
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
