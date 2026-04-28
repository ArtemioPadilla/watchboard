/**
 * Shared metadata for RSS endpoints. Each src/pages/**\/*.xml.ts file that
 * serves an RSS feed exports a `feedMeta` constant of this shape, and the
 * /feeds/, /feeds.json, /feeds.opml endpoints discover them via glob — so
 * adding a new feed = create the endpoint, the index updates itself.
 *
 * Per-tracker feeds (src/pages/[tracker]/rss.xml.ts) are dynamic and not
 * globbed; they're synthesized at build time from loadAllTrackers().
 */
export interface FeedMeta {
  /** Human-readable title shown in feed lists. */
  title: string;
  /** What's in the feed and who should subscribe. */
  description: string;
  /** Free-form cadence note ("every 15 min", "on each nightly run"). */
  cadence: string;
  /** Coarse grouping for the index page. */
  category: 'global' | 'breaking' | 'triage' | 'tracker';
  /** Path relative to basePath (e.g. "rss.xml", "rss/breaking.xml"). */
  path: string;
}

export interface FeedEntry extends FeedMeta {
  /** Absolute URL with site origin. */
  url: string;
}

/**
 * Discover every static RSS endpoint under src/pages by globbing for
 * `feedMeta` exports. Per-tracker (dynamic) feeds are excluded — callers add
 * them separately. Returns entries sorted by category then title.
 */
export function discoverStaticFeeds(
  modules: Record<string, { feedMeta?: FeedMeta }>,
  siteUrl: string,
  basePath: string,
): FeedEntry[] {
  const entries: FeedEntry[] = [];
  for (const mod of Object.values(modules)) {
    if (!mod.feedMeta) continue;
    const path = mod.feedMeta.path.replace(/^\/+/, '');
    entries.push({
      ...mod.feedMeta,
      url: `${siteUrl}${basePath}${path}`,
    });
  }
  const order: Record<FeedMeta['category'], number> = { global: 0, breaking: 1, triage: 2, tracker: 3 };
  entries.sort((a, b) => order[a.category] - order[b.category] || a.title.localeCompare(b.title));
  return entries;
}
