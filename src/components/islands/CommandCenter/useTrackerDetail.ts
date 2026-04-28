import { useEffect, useState } from 'react';
import type { TrackerCardDetail } from '../../../lib/tracker-directory-utils';

/**
 * Lazy-fetched detail payload for a single tracker. The homepage HTML only
 * inlines TrackerCardShell — heavy text + image gallery + Spanish strings live
 * in /api/cards/{slug}.json and are pulled in on demand by:
 *   - SidebarPanel.TrackerRow when a row is first expanded
 *   - BroadcastOverlay when paused/expanded
 *   - MobileStoryCarousel for the active story (and 1 neighbor for prefetch)
 *
 * Cache + in-flight dedup are process-wide singletons so a tracker fetched by
 * one surface is instantly available to the next.
 */

const CACHE = new Map<string, TrackerCardDetail>();
const IN_FLIGHT = new Map<string, Promise<TrackerCardDetail | null>>();

// Astro injects BASE_URL at build time (defined to '/' in astro.config.mjs
// for this site, but kept dynamic in case the site is ever deployed under
// a sub-path like /watchboard/). Threading basePath through props from
// CommandCenter would be noisy across all the call sites that use
// useTrackerDetail (sidebar, overlay, story carousel) so we read the
// build-time constant directly.
function getBasePath(): string {
  const raw = (import.meta as any).env?.BASE_URL ?? '/';
  return raw.endsWith('/') ? raw : `${raw}/`;
}

export function getCachedDetail(slug: string): TrackerCardDetail | undefined {
  return CACHE.get(slug);
}

export function fetchTrackerDetail(slug: string): Promise<TrackerCardDetail | null> {
  const cached = CACHE.get(slug);
  if (cached) return Promise.resolve(cached);

  const inflight = IN_FLIGHT.get(slug);
  if (inflight) return inflight;

  const url = `${getBasePath()}api/cards/${slug}.json`;

  const promise = fetch(url, { credentials: 'omit' })
    .then(r => (r.ok ? r.json() : null))
    .then((data: TrackerCardDetail | null) => {
      if (data) CACHE.set(slug, data);
      IN_FLIGHT.delete(slug);
      return data;
    })
    .catch(() => {
      IN_FLIGHT.delete(slug);
      return null;
    });

  IN_FLIGHT.set(slug, promise);
  return promise;
}

/** Fire and forget — used by carousel/broadcast for next-up prefetch. */
export function prefetchTrackerDetail(slug: string): void {
  if (!CACHE.has(slug) && !IN_FLIGHT.has(slug)) {
    void fetchTrackerDetail(slug);
  }
}

/**
 * React hook: fetches detail for a slug (or null) and returns the loaded
 * payload + a loading flag. Re-renders once when fetch resolves. Detail is
 * undefined while loading; consumers should render a skeleton or fall back to
 * shell text.
 */
export function useTrackerDetail(slug: string | null | undefined): {
  detail: TrackerCardDetail | undefined;
  loading: boolean;
} {
  const [detail, setDetail] = useState<TrackerCardDetail | undefined>(() =>
    slug ? CACHE.get(slug) : undefined,
  );
  const [loading, setLoading] = useState<boolean>(() => {
    if (!slug) return false;
    return !CACHE.has(slug);
  });

  useEffect(() => {
    if (!slug) {
      setDetail(undefined);
      setLoading(false);
      return;
    }
    const cached = CACHE.get(slug);
    if (cached) {
      setDetail(cached);
      setLoading(false);
      return;
    }
    setDetail(undefined);
    setLoading(true);
    let cancelled = false;
    fetchTrackerDetail(slug).then((data) => {
      if (cancelled) return;
      setDetail(data ?? undefined);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return { detail, loading };
}
