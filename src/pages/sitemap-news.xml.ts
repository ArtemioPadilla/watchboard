/**
 * Google News sitemap — lists events published in the last 48 hours.
 */
import type { APIRoute } from 'astro';
import { loadAllTrackers } from '../lib/tracker-registry';
import { loadTrackerData } from '../lib/data';
import { flattenTimelineEvents } from '../lib/timeline-utils';
import { eventToSlug } from '../lib/event-slug';

export const GET: APIRoute = ({ site }) => {
  const siteUrl = site?.toString().replace(/\/$/, '') || 'https://watchboard.dev';
  const trackers = loadAllTrackers().filter(t => t.status !== 'draft');
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  const entries: string[] = [];

  for (const t of trackers) {
    let data;
    try {
      data = loadTrackerData(t.slug, t.eraLabel);
    } catch {
      continue;
    }
    const flatEvents = flattenTimelineEvents(data.timeline);
    for (const ev of flatEvents) {
      if (ev.resolvedDate < cutoffStr) continue;
      const slug = eventToSlug(ev.resolvedDate, ev.id);
      const url = `${siteUrl}/${t.slug}/events/${slug}`;
      entries.push(`  <url>
    <loc>${url}</loc>
    <news:news>
      <news:publication>
        <news:name>Watchboard</news:name>
        <news:language>en</news:language>
      </news:publication>
      <news:publication_date>${ev.resolvedDate}</news:publication_date>
      <news:title>${escapeXml(ev.title)}</news:title>
    </news:news>
  </url>`);
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${entries.join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
