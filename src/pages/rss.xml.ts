import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { loadAllTrackers } from '../lib/tracker-registry';
import { loadTrackerData } from '../lib/data';
import type { FeedMeta } from '../lib/feed-registry';

export const feedMeta: FeedMeta = {
  title: 'All trackers — global digest',
  description: 'Every digest entry from every active tracker, sorted newest-first. The default site-wide feed.',
  cadence: 'on each nightly data update (~daily)',
  category: 'global',
  path: 'rss.xml',
};

export async function GET(context: APIContext) {
  const trackers = loadAllTrackers().filter(t => t.status !== 'draft');
  const base = import.meta.env.BASE_URL || '/';
  const basePath = base.endsWith('/') ? base : `${base}/`;

  // Collect digest entries from all trackers
  const items: { title: string; pubDate: Date; description: string; link: string; customData: string }[] = [];

  for (const tracker of trackers) {
    try {
      const data = loadTrackerData(tracker.slug, tracker.eraLabel);
      // A tracker can have >1 digest on the same date (e.g. daily + breaking),
      // so suffix repeats to keep item links (and thus GUIDs) unique.
      const seenDates = new Map<string, number>();
      for (const digest of data.digests) {
        const n = (seenDates.get(digest.date) ?? 0) + 1;
        seenDates.set(digest.date, n);
        items.push({
          title: digest.title,
          pubDate: new Date(digest.date),
          description: digest.summary,
          link: `${basePath}${tracker.slug}/#digest-${digest.date}${n > 1 ? `-${n}` : ''}`,
          customData: `<category>${digest.source || 'daily'}</category>`,
        });
      }
    } catch {
      // Tracker may not have data or digests yet
    }
  }

  // Sort by date descending
  items.sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());

  return rss({
    title: 'Watchboard — Intelligence Dashboard Updates',
    description: 'Latest data updates across all Watchboard trackers.',
    site: context.site!,
    items: items.slice(0, 50),
    customData: '<language>en-us</language>',
  });
}
