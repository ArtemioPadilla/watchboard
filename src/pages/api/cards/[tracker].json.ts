/**
 * Per-tracker card detail endpoint — generates /api/cards/{slug}.json at build
 * time. The homepage ships only "shell" tracker data inline (slug, name, top
 * KPI, headline, lastUpdated, latestEventMedia thumbnail, isBreaking, plus the
 * scalars needed for relevance sorting). Detail surfaces — full eventImages
 * gallery, digestSummary, digestSectionsUpdated, Spanish translations — are
 * served from this endpoint and fetched on demand by SidebarPanel (on first
 * expand), BroadcastOverlay (when paused/expanded), and MobileStoryCarousel
 * (per active story).
 *
 * Same loadTrackerData pipeline as src/pages/api/data/[tracker].json.ts —
 * the shape here is just a strict subset shaped for the homepage.
 */
import type { APIRoute, GetStaticPaths } from 'astro';
import { loadAllTrackers } from '../../../lib/tracker-registry';
import { loadTrackerData } from '../../../lib/data';
import type { TrackerCardDetail } from '../../../lib/tracker-directory-utils';

export const getStaticPaths: GetStaticPaths = () => {
  const trackers = loadAllTrackers();
  return trackers
    .filter(t => t.status !== 'draft')
    .map(t => ({
      params: { tracker: t.slug },
      props: { config: t },
    }));
};

export const GET: APIRoute = ({ props }) => {
  const config = props.config;

  let digestSummary: string | undefined;
  let digestSectionsUpdated: string[] | undefined;
  const eventImages: NonNullable<TrackerCardDetail['eventImages']> = [];
  let descriptionEs: string | undefined;
  let topKpisEs: TrackerCardDetail['topKpisEs'] = [];

  try {
    const data = loadTrackerData(config.slug, config.eraLabel);
    const latestDigest = data.digests[0];
    if (latestDigest) {
      digestSummary = latestDigest.summary;
      digestSectionsUpdated = latestDigest.sectionsUpdated;
    }

    // Up to 5 recent event images from T1-T2 sources (most recent first) —
    // mirrors the same logic that index.astro used to inline.
    const allEvents = data.timeline.flatMap(era => era.events).reverse();
    for (const evt of allEvents) {
      if (eventImages.length >= 5) break;
      if (!evt.media?.length) continue;
      const bestSource = evt.sources
        .filter(s => s.tier <= 2)
        .sort((a, b) => a.tier - b.tier)[0];
      if (!bestSource) continue;
      const image = evt.media.find(m => m.thumbnail);
      if (image) {
        eventImages.push({
          url: image.thumbnail!,
          source: image.source || bestSource.name,
          tier: bestSource.tier,
          eventTitle: evt.title,
          eventDetail: evt.detail?.slice(0, 150),
        });
      }
    }
  } catch {
    // Tracker may not have data yet — return empty detail.
  }

  try {
    // headlineEs already lives in the shell (see index.astro) so it's not
    // re-emitted here. We only ship the long-form ES copy that's used in
    // expanded states.
    const esData = loadTrackerData(config.slug, config.eraLabel, 'es');
    topKpisEs = esData.kpis.slice(0, 3);
    descriptionEs = esData.meta.heroSubtitle || undefined;
  } catch {
    // No Spanish data — leave undefined; consumers fall back to English.
  }

  const payload: TrackerCardDetail = {
    slug: config.slug,
    digestSummary,
    digestSectionsUpdated,
    eventImages,
    descriptionEs,
    topKpisEs,
  };

  return new Response(JSON.stringify(payload), {
    headers: {
      'Content-Type': 'application/json',
      // Long cache, fingerprinted by lastUpdated via the consuming hook.
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
