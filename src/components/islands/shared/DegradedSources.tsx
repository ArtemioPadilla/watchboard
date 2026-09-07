/**
 * DegradedSources — collapsed block under the KPI strip listing every live
 * layer currently stale/error/rate-limited and any digest gap reported by
 * _health/status.json (plan E9.H2). Renders nothing when all is well.
 */
import { useEffect, useMemo, useState } from 'react';
import { listLiveSources } from '../../../lib/live-source';
import { useLiveSource } from '../../../lib/use-live-source';
import { collectDegraded, type DegradedItem, type HealthStatus } from '../../../lib/degraded-sources';
import { t, type TranslationKey } from '../../../i18n/translations';
import { useLocale } from '../../../i18n/useLocale';

const POLL_MS = 15_000;
const HEALTH_TTL_MS = 10 * 60_000;

function basePath(): string {
  const raw = (import.meta as any).env?.BASE_URL ?? '/';
  return raw.endsWith('/') ? raw : `${raw}/`;
}

function ago(ms: number | null, now: number, locale: string): string {
  if (!ms) return t('degraded.never', locale as never);
  const m = Math.max(0, Math.round((now - ms) / 60_000));
  if (m < 1) return t('source.justNow', locale as never);
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h`;
  return `${Math.round(h / 24)} d`;
}

export interface DegradedSourcesProps {
  trackerSlug: string;
  /** Test seam: skip health fetch. */
  healthOverride?: HealthStatus | null;
}

export default function DegradedSources({ trackerSlug, healthOverride }: DegradedSourcesProps) {
  const locale = useLocale();
  const [tick, setTick] = useState(() => Date.now());
  const healthSpec = useMemo(() => ({
    key: 'health:status',
    url: `${basePath()}_health/status.json`,
    ttlMs: HEALTH_TTL_MS,
    parse: async (res: Response): Promise<HealthStatus> => {
      const j = (await res.json()) as HealthStatus;
      if (!j || typeof j !== 'object' || !j.trackers) throw new Error('status.json: unexpected shape');
      return j;
    },
  }), []);
  const health = useLiveSource<HealthStatus>(healthSpec, { enabled: healthOverride === undefined });

  useEffect(() => {
    const id = window.setInterval(() => setTick(Date.now()), POLL_MS);
    return () => window.clearInterval(id);
  }, []);

  const items: DegradedItem[] = useMemo(() => {
    // Exclude our own health fetch from the layer list.
    const sources = listLiveSources(tick).filter((s) => s.key !== 'health:status');
    return collectDegraded(sources, healthOverride === undefined ? health.data : healthOverride, trackerSlug);
  }, [tick, health.data, healthOverride, trackerSlug]);

  if (items.length === 0) return null;

  return (
    <details className="degraded-sources" data-testid="degraded-sources">
      <summary className="degraded-summary">
        <span className="degraded-dot" aria-hidden="true" />
        {t('degraded.title', locale)} · {items.length}
      </summary>
      <ul className="degraded-list">
        {items.map((it) => (
          <li key={it.id} className={`degraded-item degraded-${it.status}`} data-layer={it.id}>
            <span className="degraded-label">{it.labelKey ? t(it.labelKey as TranslationKey, locale) : it.label}</span>
            <span className="degraded-status">{t(`degraded.status.${it.status}` as TranslationKey, locale)}</span>
            <span className="degraded-last">{t('degraded.lastGood', locale)} {ago(it.lastGoodAt, tick, locale)}</span>
            {it.detail && <span className="degraded-detail" title={it.detail}>{it.detail}</span>}
          </li>
        ))}
      </ul>
    </details>
  );
}
