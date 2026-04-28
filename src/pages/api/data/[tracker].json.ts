/**
 * Static JSON endpoint — generates /api/data/{slug}.json at build time. Used
 * by the per-tracker dashboard islands (timeline, map, KPIs, claims) which
 * fetch this on mount instead of receiving multi-MB inline props.
 *
 * NOT to be confused with /api/cards/{slug}.json (sibling endpoint at
 * src/pages/api/cards/[tracker].json.ts). That one is a much smaller
 * payload tailored to the homepage card surfaces (digestSummary, eventImages
 * gallery, ES translations) and is fetched lazily as cards expand.
 */
import type { APIRoute, GetStaticPaths } from 'astro';
import { loadAllTrackers } from '../../../lib/tracker-registry';
import { loadTrackerData } from '../../../lib/data';
import { flattenTimelineEvents } from '../../../lib/timeline-utils';

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
  const data = loadTrackerData(config.slug, config.eraLabel);
  const flatEvents = flattenTimelineEvents(data.timeline);

  const payload = {
    mapPoints: data.mapPoints,
    mapLines: data.mapLines,
    events: flatEvents,
    timeline: data.timeline,
    kpis: data.kpis,
    meta: data.meta,
    strikeTargets: data.strikeTargets,
    retaliationData: data.retaliationData,
    assetsData: data.assetsData,
    casualties: data.casualties,
    econ: data.econ,
    claims: data.claims,
    political: data.political,
  };

  return new Response(JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' },
  });
};
