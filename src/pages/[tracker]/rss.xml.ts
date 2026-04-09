import rss from '@astrojs/rss';
import type { APIContext, GetStaticPaths } from 'astro';
import { loadAllTrackers } from '../../lib/tracker-registry';
import { loadTrackerData } from '../../lib/data';

export const getStaticPaths: GetStaticPaths = () => {
  const trackers = loadAllTrackers().filter(t => t.status !== 'draft');
  return trackers.map(t => ({
    params: { tracker: t.slug },
    props: { config: t },
  }));
};

export async function GET(context: APIContext) {
  const { config } = context.props as { config: ReturnType<typeof loadAllTrackers>[number] };
  const base = import.meta.env.BASE_URL || '/watchboard';
  const basePath = base.endsWith('/') ? base : `${base}/`;
  const data = loadTrackerData(config.slug, config.eraLabel);

  const items = data.digests
    .map(digest => ({
      title: digest.title,
      pubDate: new Date(digest.date),
      description: digest.summary,
      link: `${basePath}${config.slug}/#digest-${digest.date}`,
      customData: `<category>${digest.source || 'daily'}</category>`,
    }))
    .sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime())
    .slice(0, 50);

  return rss({
    title: `${config.name} — Watchboard Updates`,
    description: `Latest data updates for ${config.name}.`,
    site: context.site!,
    items,
    customData: '<language>en-us</language>',
  });
}
