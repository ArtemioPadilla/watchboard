/**
 * Static geo index for the click dossier (plan E4): every non-draft
 * tracker's geography plus up to 20 named map points each, so the browser
 * can answer "which trackers cover this country / what happened near
 * here" without a backend. ~125 trackers × 20 points ≈ 200 KB, cached an
 * hour by public/_headers (/api/data/*-style rule below).
 */
import type { APIRoute } from 'astro';
import { loadAllTrackers } from '../../lib/tracker-registry';
import { loadTrackerData } from '../../lib/data';

const MAX_POINTS_PER_TRACKER = 20;

export const GET: APIRoute = async () => {
  const trackers = loadAllTrackers().filter((t) => t.status !== 'draft');
  const out = {
    generated: new Date().toISOString(),
    trackers: [] as Array<{ slug: string; name: string; country?: string; geoPath?: string[]; region?: string; lastUpdated?: string; mapCenter?: { lon: number; lat: number } }>,
    points: [] as Array<{ slug: string; id: string; label: string; date: string; lat: number; lon: number }>,
  };
  for (const t of trackers) {
    const data = loadTrackerData(t.slug);
    out.trackers.push({
      slug: t.slug,
      name: t.name,
      ...(t.country ? { country: t.country } : {}),
      ...(t.geoPath ? { geoPath: t.geoPath } : {}),
      ...(t.region ? { region: t.region } : {}),
      ...(data.meta?.lastUpdated ? { lastUpdated: data.meta.lastUpdated } : {}),
      ...(t.map?.center ? { mapCenter: t.map.center } : {}),
    });
    const pts = [...data.mapPoints]
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
      .slice(0, MAX_POINTS_PER_TRACKER);
    for (const p of pts) {
      if (typeof p.lat !== 'number' || typeof p.lon !== 'number') continue;
      out.points.push({ slug: t.slug, id: p.id, label: p.label, date: p.date, lat: p.lat, lon: p.lon });
    }
  }
  return new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json' } });
};
