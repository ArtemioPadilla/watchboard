import { useMemo } from 'react';
import { useLiveSource } from '../../../lib/use-live-source';
import type { AlertsFile, AlertEntry } from '../../../lib/alerts-file';

export const ALERTS_PATH = '_hourly/alerts.json';
const ALERTS_TTL_MS = 5 * 60_000;

function basePath(): string {
  const raw = (import.meta as any).env?.BASE_URL ?? '/';
  return raw.endsWith('/') ? raw : `${raw}/`;
}

/**
 * The homepage/tracker alert feed: public/_hourly/alerts.json written by
 * the light scan (plan E3.H1), polled every 5 minutes through the shared
 * live-source cache (paused while the tab is hidden, stale-on-error).
 */
export function useAlerts(enabled = true, trackerSlug?: string | null) {
  const spec = useMemo(() => ({
    key: 'alerts:file',
    url: `${basePath()}${ALERTS_PATH}`,
    ttlMs: ALERTS_TTL_MS,
    parse: async (res: Response): Promise<AlertsFile> => {
      const j = (await res.json()) as AlertsFile;
      if (!j || j.version !== 1 || !Array.isArray(j.entries)) throw new Error('alerts.json: unexpected shape');
      return j;
    },
    // A quiet 72 h is data ("no alerts"), not an outage.
    isEmpty: () => false,
  }), []);
  const r = useLiveSource<AlertsFile>(spec, { enabled });
  const entries: AlertEntry[] = useMemo(() => {
    const all = r.data?.entries ?? [];
    return trackerSlug ? all.filter(e => e.tracker === trackerSlug) : all;
  }, [r.data, trackerSlug]);
  return { entries, generated: r.data?.generated ?? null, status: r.status, updatedAt: r.updatedAt, error: r.error };
}
