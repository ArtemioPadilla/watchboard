import { useEffect, useState } from 'react';
import type { LiveStatus } from '../../../lib/live-source';
import { worstStatus } from '../../../lib/use-live-source';
import { t } from '../../../i18n/translations';
import { useLocale } from '../../../i18n/useLocale';

export interface SourceStatusItem {
  id: string;
  label: string;
  status: LiveStatus;
  updatedAt?: number | null;
  error?: string;
  /** Snapshot layers: show the capture date instead of a live dot. */
  snapshotDate?: string;
}

function ageLabel(updatedAt: number | null | undefined, now: number, locale: string): string {
  if (!updatedAt) return '';
  const s = Math.max(0, Math.round((now - updatedAt) / 1000));
  if (s < 60) return t('source.justNow', locale as never);
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  return `${h} h`;
}

/** "1 Mar 2026" from an ISO date; the raw string when unparseable. */
export function formatSnapshotDate(iso: string, locale: string): string {
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  } catch {
    return iso;
  }
}

/** Colour class for a status; reuses .freshness-indicator tokens from global.css. */
export function statusClass(status: LiveStatus): string {
  switch (status) {
    case 'ok': return 'fresh';
    case 'stale':
    case 'rate-limited':
    case 'loading': return 'stale';
    case 'error': return 'down';
    default: return '';
  }
}

/**
 * Per-layer source status: a dot plus "hace X" for feeds, or the snapshot
 * date for curated overlays. A snapshot is never green: it is not live.
 */
export function SourceStatusChip({ item, compact = false }: { item: SourceStatusItem; compact?: boolean }) {
  const locale = useLocale();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  if (item.snapshotDate) {
    const shown = formatSnapshotDate(item.snapshotDate, locale);
    return (
      <span className="source-chip source-chip--snapshot" title={`${t('source.snapshot', locale)} · ${shown} (${item.snapshotDate})`} data-status="snapshot">
        <span className="source-dot" />
        {!compact && <span>{t('source.snapshot', locale)} · {shown}</span>}
      </span>
    );
  }

  const cls = statusClass(item.status);
  const age = ageLabel(item.updatedAt, now, locale);
  const text = item.status === 'ok'
    ? age
    : item.status === 'loading'
      ? t('source.loading', locale)
      : item.status === 'rate-limited'
        ? t('source.rateLimited', locale)
        : item.status === 'stale'
          ? `${t('source.stale', locale)}${age ? ` · ${age}` : ''}`
          : item.status === 'error'
            ? t('source.noData', locale)
            : '';
  return (
    <span
      className={`source-chip freshness-indicator ${cls}`.trim()}
      title={item.error ? `${item.label}: ${item.error}` : item.label}
      data-status={item.status}
      aria-label={`${item.label}: ${text || item.status}`}
    >
      <span className="source-dot" />
      {!compact && text && <span>{text}</span>}
    </span>
  );
}

/**
 * Collapsed summary: one dot for all sources when everything is fine, an
 * expandable list of the degraded ones otherwise (the ChainBrief "DEGRADED
 * SOURCES" block, applied to live layers).
 */
export default function SourceStatusSummary({ items, className = '' }: { items: SourceStatusItem[]; className?: string }) {
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const live = items.filter(i => !i.snapshotDate && i.status !== 'disabled' && i.status !== 'idle');
  const degraded = live.filter(i => i.status !== 'ok');
  if (live.length === 0 && items.every(i => !i.snapshotDate)) return null;
  const worst = worstStatus(live.map(i => i.status));

  return (
    <div className={`source-summary ${className}`.trim()} data-worst={worst}>
      <button
        type="button"
        className={`source-summary-btn freshness-indicator ${statusClass(worst)}`.trim()}
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        title={t('source.sources', locale)}
      >
        <span className="source-dot" />
        {degraded.length === 0
          ? t('source.allOk', locale)
          : `${degraded.length} ${t('source.degraded', locale)}`}
      </button>
      {open && (
        <ul className="source-summary-list">
          {items.map(i => (
            <li key={i.id}>
              <span className="source-summary-label">{i.label}</span>
              <SourceStatusChip item={i} />
            </li>
          ))}
          <li className="source-summary-more">
            <a href={`${((import.meta as any).env?.BASE_URL ?? '/').replace(/\/?$/, '/')}sources/`} data-testid="sources-link">{t('source.aboutSources', locale)} ↗</a>
          </li>
        </ul>
      )}
    </div>
  );
}
