import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { loadAllTrackers } from '../lib/tracker-registry';
import { loadTrackerData } from '../lib/data';

export async function GET(context: APIContext) {
  const trackers = loadAllTrackers().filter(t => t.status !== 'draft');
  const base = import.meta.env.BASE_URL || '/watchboard';
  const basePath = base.endsWith('/') ? base : `${base}/`;

  // Collect digest entries from all trackers
  const items: { title: string; pubDate: Date; description: string; link: string }[] = [];

  for (const tracker of trackers) {
    try {
      const data = loadTrackerData(tracker.slug, tracker.eraLabel);
      for (const digest of data.digests) {
        items.push({
          title: digest.title,
          pubDate: new Date(digest.date),
          description: digest.summary,
          link: `${basePath}${tracker.slug}/#digest-${digest.date}`,
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
