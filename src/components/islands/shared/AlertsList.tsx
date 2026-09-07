import { useEffect, useMemo, useRef, useState } from 'react';
import { safeHref, type AlertEntry } from '../../../lib/alerts-file';
import { SEVERITY_COLORS, SEVERITY_ORDER, type AlertSeverity } from '../../../lib/alert-severity';
import { t } from '../../../i18n/translations';
import { useLocale } from '../../../i18n/useLocale';

export type AlertFilter = 'all' | 'critical' | 'new_tracker' | 'quakes';

export interface QuakeAlert {
  id: string;
  mag: number;
  place: string;
  time: number;
  lat: number;
  lon: number;
}

interface Props {
  entries: AlertEntry[];
  quakes?: QuakeAlert[];
  filter: AlertFilter;
  onFilter: (f: AlertFilter) => void;
  onSelect?: (entry: AlertEntry) => void;
  onLocate?: (lat: number, lon: number, label: string) => void;
  /** Hide the filter row (mobile tracker feed shows one tracker only). */
  compact?: boolean;
  now?: number;
}

export function timeAgo(iso: string | number, now: number, locale: string): string {
  const ms = now - (typeof iso === 'number' ? iso : Date.parse(iso));
  if (!Number.isFinite(ms) || ms < 0) return '';
  const m = Math.round(ms / 60_000);
  if (m < 1) return t('source.justNow', locale as never);
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h`;
  return `${Math.round(h / 24)} d`;
}

function quakeSeverity(mag: number): AlertSeverity {
  if (mag >= 6) return 'critical';
  if (mag >= 5) return 'high';
  if (mag >= 4.5) return 'elevated';
  return 'low';
}

/**
 * Severity-coloured list of light-scan alerts (and optionally M≥4.5
 * earthquakes). The label is the score and the tier; nothing is invented.
 */
export default function AlertsList({ entries, quakes = [], filter, onFilter, onSelect, onLocate, compact = false, now = Date.now() }: Props) {
  const locale = useLocale();
  const [expanded, setExpanded] = useState<string | null>(null);
  // Ids seen at mount; anything that arrives later (5-min poll) is "new" and
  // gets a brief highlight so the reader notices the list changed.
  const seenRef = useRef<Set<string> | null>(null);
  const [newIds, setNewIds] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    const ids = entries.map(e => e.id);
    if (seenRef.current === null) { seenRef.current = new Set(ids); return; }
    const fresh = ids.filter(id => !seenRef.current!.has(id));
    if (fresh.length === 0) return;
    for (const id of fresh) seenRef.current.add(id);
    setNewIds(prev => new Set([...prev, ...fresh]));
    const timer = setTimeout(() => setNewIds(prev => { const n = new Set(prev); for (const id of fresh) n.delete(id); return n; }), 4000);
    return () => clearTimeout(timer);
  }, [entries]);

  const visible = useMemo(() => {
    if (filter === 'quakes') return [];
    return entries.filter(e => {
      if (filter === 'critical') return e.severity === 'critical';
      if (filter === 'new_tracker') return e.decision === 'new_tracker';
      return true;
    });
  }, [entries, filter]);

  const filters: { id: AlertFilter; label: string; count: number }[] = [
    { id: 'all', label: t('alerts.filterAll', locale), count: entries.length },
    { id: 'critical', label: t('alerts.filterCritical', locale), count: entries.filter(e => e.severity === 'critical').length },
    { id: 'new_tracker', label: t('alerts.filterNewTracker', locale), count: entries.filter(e => e.decision === 'new_tracker').length },
    { id: 'quakes', label: t('alerts.filterQuakes', locale), count: quakes.length },
  ];

  return (
    <div className="alerts-list">
      {!compact && (
        <div className="alerts-filters" role="tablist">
          {filters.map(f => (
            <button
              key={f.id}
              role="tab"
              aria-selected={filter === f.id}
              className={`alerts-filter${filter === f.id ? ' active' : ''}`}
              onClick={() => onFilter(f.id)}
            >
              {f.label}
              <span className="alerts-filter-count">{f.count}</span>
            </button>
          ))}
        </div>
      )}

      {filter === 'quakes' ? (
        quakes.length === 0 ? (
          <div className="alerts-empty">{t('alerts.noQuakes', locale)}</div>
        ) : (
          <ul className="alerts-items">
            {quakes.map(q => {
              const sev = quakeSeverity(q.mag);
              return (
                <li key={q.id} className="alerts-item" style={{ borderLeftColor: SEVERITY_COLORS[sev] }}>
                  <button type="button" className="alerts-item-main" onClick={() => onLocate?.(q.lat, q.lon, q.place)}>
                    <span className="alerts-sev" style={{ color: SEVERITY_COLORS[sev] }}>M{q.mag.toFixed(1)}</span>
                    <span className="alerts-title">{q.place}</span>
                    <span className="alerts-meta">USGS · {timeAgo(q.time, now, locale)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )
      ) : visible.length === 0 ? (
        <div className="alerts-empty">{t('alerts.none', locale)}</div>
      ) : (
        <ul className="alerts-items">
          {visible.map(e => {
            const open = expanded === e.id;
            return (
              <li key={e.id} className={`alerts-item sev-${e.severity}${newIds.has(e.id) ? ' alerts-item-new' : ''}`} style={{ borderLeftColor: SEVERITY_COLORS[e.severity] }} data-severity={e.severity} data-new={newIds.has(e.id) ? 'true' : undefined}>
                <button
                  type="button"
                  className="alerts-item-main"
                  onClick={() => {
                    setExpanded(open ? null : e.id);
                    onSelect?.(e);
                    // An alert with coordinates flies to the point, not just the tracker centre.
                    if (e.geo && onLocate) onLocate(e.geo.lat, e.geo.lon, e.geo.place ?? e.title);
                  }}
                  aria-expanded={open}
                >
                  <span className="alerts-sev" style={{ color: SEVERITY_COLORS[e.severity] }}>
                    {t(`alerts.sev.${e.severity}` as never, locale)}
                  </span>
                  <span className="alerts-title">{e.title}</span>
                  <span className="alerts-meta">
                    {e.tracker ?? t('alerts.newTracker', locale)} · {e.source.replace(/^bsky:/, '@')}
                    {e.sourceTier ? ` · T${e.sourceTier}` : ''} · {timeAgo(e.timestamp, now, locale)}
                  </span>
                </button>
                <div className="alerts-item-actions">
                  {e.geo && onLocate && (
                    <button type="button" className="alerts-action" title={t('alerts.locate', locale)} onClick={() => onLocate(e.geo!.lat, e.geo!.lon, e.geo!.place ?? e.title)}>
                      ◎
                    </button>
                  )}
                  {safeHref(e.url) && (
                    <a className="alerts-action" href={safeHref(e.url)} target="_blank" rel="noopener noreferrer" title={t('alerts.openSource', locale)} data-testid="alert-open-source">↗</a>
                  )}
                </div>
                {open && (
                  <div className="alerts-item-detail">
                    <span>{t('alerts.score', locale)}: {e.score.toFixed(2)}</span>
                    <span>{t('alerts.decision', locale)}: {e.decision}</span>
                    <span>{t('alerts.scan', locale)}: {e.scanType}</span>
                    <span>{e.feedOrigin}</span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export { SEVERITY_ORDER };
