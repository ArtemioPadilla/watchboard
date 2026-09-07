/**
 * degraded-sources.ts — collect what is currently not trustworthy on a
 * tracker page: live layers in `stale`/`error`/`rate-limited` (from the
 * live-source cache) and a digest gap reported by `_health/status.json`.
 *
 * Pure so the island stays a thin subscriber.
 */
import type { LiveResult, LiveStatus } from './live-source';
import { LIVE_LAYERS } from './live-layers';

export const DEGRADED_STATUSES: readonly LiveStatus[] = ['stale', 'error', 'rate-limited'];

export interface HealthTracker {
  lastEvent: string | null;
  lastDigest: string | null;
  digestGap: number;
  lastUpdated: string | null;
}

export interface HealthStatus {
  lastBuild: string;
  trackers: Record<string, HealthTracker>;
  digestGaps: string[];
  healthy: boolean;
}

export interface DegradedItem {
  id: string;
  /** Fallback label (layer id or "Daily digest"). */
  label: string;
  /** i18n key when the registry knows the layer. */
  labelKey?: string;
  kind: 'layer' | 'digest';
  status: LiveStatus | 'gap';
  /** Epoch ms of the last good data, null if never. */
  lastGoodAt: number | null;
  detail?: string;
}

/** Map a live-source cache key ("flights:…", "quakes:…") to a registry layer id. */
export function layerIdForKey(key: string): string {
  const prefix = key.split(':')[0];
  switch (prefix) {
    case 'quakes': return 'earthquakes';
    case 'flights': return 'flights';
    case 'weather': return 'weather';
    case 'satellites': return 'satellites';
    case 'deepstate': return 'deepstate-frontline';
    case 'gdacs': return 'gdacs-alerts';
    case 'static-geo': return key.slice('static-geo:'.length) || key;
    default: return prefix;
  }
}

/** i18n key for a registry layer, undefined for ad-hoc keys. */
export function layerLabelKey(layerId: string): string | undefined {
  return LIVE_LAYERS.find((l) => l.id === layerId)?.label;
}

/** Digest-gap threshold in days; below this the tracker is considered current. */
export const DIGEST_GAP_DAYS = 3;

export function collectDegraded(
  sources: { key: string; result: LiveResult<unknown> }[],
  health: HealthStatus | null,
  trackerSlug: string,
): DegradedItem[] {
  const byLayer = new Map<string, DegradedItem>();
  for (const { key, result } of sources) {
    if (!DEGRADED_STATUSES.includes(result.status)) continue;
    const id = layerIdForKey(key);
    const existing = byLayer.get(id);
    // Keep the worst status per layer; error > rate-limited > stale.
    const rank = (s: string) => (s === 'error' ? 3 : s === 'rate-limited' ? 2 : 1);
    if (existing && rank(existing.status) >= rank(result.status)) {
      if ((result.updatedAt ?? 0) > (existing.lastGoodAt ?? 0)) existing.lastGoodAt = result.updatedAt;
      continue;
    }
    byLayer.set(id, {
      id,
      label: id,
      labelKey: layerLabelKey(id),
      kind: 'layer',
      status: result.status,
      lastGoodAt: Math.max(result.updatedAt ?? 0, existing?.lastGoodAt ?? 0) || null,
      detail: result.error,
    });
  }
  const items = [...byLayer.values()].sort((a, b) => a.id.localeCompare(b.id));

  const th = health?.trackers?.[trackerSlug];
  if (th && typeof th.digestGap === 'number' && th.digestGap >= DIGEST_GAP_DAYS) {
    const lastGood = th.lastDigest ? Date.parse(th.lastDigest) : NaN;
    items.push({
      id: 'digest',
      label: 'Daily digest',
      labelKey: 'degraded.digest',
      kind: 'digest',
      status: 'gap',
      lastGoodAt: Number.isNaN(lastGood) ? null : lastGood,
      detail: `${th.digestGap} days without a digest`,
    });
  }
  return items;
}
