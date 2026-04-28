import type { APIContext } from 'astro';
import { loadAllTrackers } from '../lib/tracker-registry';
import { discoverStaticFeeds, type FeedMeta, type FeedEntry } from '../lib/feed-registry';

/**
 * Machine-readable index of every Watchboard RSS feed. Designed for agents,
 * crawlers, and LLM tool-use:
 *   GET /feeds.json → list of {url, title, description, cadence, category}
 *
 * Static feeds are auto-discovered via glob; per-tracker feeds are emitted
 * from the tracker registry. Adding a new feed = create the endpoint with
 * `feedMeta`, this index updates next build.
 */

const modules = import.meta.glob<{ feedMeta?: FeedMeta }>(
  ['./rss.xml.ts', './rss/*.xml.ts'],
  { eager: true },
);

export async function GET(context: APIContext) {
  const siteUrl = context.site?.toString().replace(/\/$/, '') ?? 'https://watchboard.dev';
  const base = import.meta.env.BASE_URL || '/';
  const basePath = base.endsWith('/') ? base : `${base}/`;

  const staticFeeds = discoverStaticFeeds(modules, siteUrl, basePath);

  const trackerFeeds: FeedEntry[] = loadAllTrackers()
    .filter((t) => t.status === 'active')
    .map((t) => ({
      title: `${t.shortName ?? t.name} — tracker feed`,
      description: `Per-tracker digest entries for ${t.name}.`,
      cadence: 'on each tracker update',
      category: 'tracker' as const,
      path: `${t.slug}/rss.xml`,
      url: `${siteUrl}${basePath}${t.slug}/rss.xml`,
    }))
    .sort((a, b) => a.title.localeCompare(b.title));

  const body = JSON.stringify(
    {
      version: 1,
      generatedAt: new Date().toISOString(),
      site: siteUrl,
      feeds: [...staticFeeds, ...trackerFeeds],
    },
    null,
    2,
  );

  return new Response(body, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=600',
    },
  });
}
