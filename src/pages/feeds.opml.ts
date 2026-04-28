import type { APIContext } from 'astro';
import { loadAllTrackers } from '../lib/tracker-registry';
import { discoverStaticFeeds, type FeedMeta } from '../lib/feed-registry';

/**
 * OPML 2.0 bundle of every Watchboard RSS feed. RSS readers (Feedly, Inoreader,
 * NetNewsWire, etc.) accept OPML to import all feeds in one shot.
 *
 * Static feeds auto-discover via glob; per-tracker feeds emit from the registry.
 */

const modules = import.meta.glob<{ feedMeta?: FeedMeta }>(
  ['./rss.xml.ts', './rss/*.xml.ts'],
  { eager: true },
);

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export async function GET(context: APIContext) {
  const siteUrl = context.site?.toString().replace(/\/$/, '') ?? 'https://watchboard.dev';
  const base = import.meta.env.BASE_URL || '/';
  const basePath = base.endsWith('/') ? base : `${base}/`;

  const staticFeeds = discoverStaticFeeds(modules, siteUrl, basePath);
  const trackers = loadAllTrackers().filter((t) => t.status === 'active');

  const outline = (
    title: string,
    description: string,
    xmlUrl: string,
    htmlUrl: string,
    category: string,
  ) =>
    `    <outline type="rss" text="${escapeAttr(title)}" title="${escapeAttr(title)}" ` +
    `description="${escapeAttr(description)}" xmlUrl="${escapeAttr(xmlUrl)}" ` +
    `htmlUrl="${escapeAttr(htmlUrl)}" category="${escapeAttr(category)}" />`;

  const staticOutlines = staticFeeds
    .map((f) => outline(f.title, f.description, f.url, siteUrl + basePath, f.category))
    .join('\n');

  const trackerOutlines = trackers
    .map((t) =>
      outline(
        `${t.shortName ?? t.name} — tracker feed`,
        `Per-tracker digest entries for ${t.name}.`,
        `${siteUrl}${basePath}${t.slug}/rss.xml`,
        `${siteUrl}${basePath}${t.slug}/`,
        'tracker',
      ),
    )
    .join('\n');

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Watchboard — All Feeds</title>
    <dateCreated>${new Date().toUTCString()}</dateCreated>
    <ownerName>Watchboard</ownerName>
    <ownerEmail>noreply@watchboard.dev</ownerEmail>
  </head>
  <body>
    <outline text="Global">
${staticOutlines}
    </outline>
    <outline text="Per-tracker">
${trackerOutlines}
    </outline>
  </body>
</opml>
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/x-opml; charset=utf-8',
      'Cache-Control': 'public, max-age=600',
    },
  });
}
