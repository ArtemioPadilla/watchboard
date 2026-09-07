import { useMemo, useState } from 'react';
import AlertsList, { type AlertFilter, type QuakeAlert } from '../shared/AlertsList';
import { useAlerts } from '../shared/useAlerts';
import { useLiveSource } from '../../../lib/use-live-source';
import { usgsUrl, parseUsgs, type Earthquake } from '../../../lib/geo-sources';
import FreshnessBadge from '../FreshnessBadge';
import { t } from '../../../i18n/translations';
import type { Locale } from '../../../i18n/translations';
import type { AlertEntry } from '../../../lib/alerts-file';

interface Props {
  open: boolean;
  onClose: () => void;
  onSelectTracker: (slug: string) => void;
  onLocate?: (lat: number, lon: number, label: string) => void;
  locale: Locale;
  knownSlugs: Set<string>;
  auditHref: string;
}

/**
 * Homepage alerts panel (plan E3.H2): the light scan's actionable
 * decisions from the last 72 h with severity, filters and click-to-fly.
 * Earthquakes tab reads today's USGS M≥4.5 feed through live-source.
 */
export default function AlertsPanel({ open, onClose, onSelectTracker, onLocate, locale, knownSlugs, auditHref }: Props) {
  const [filter, setFilter] = useState<AlertFilter>('all');
  const { entries, generated, status, error } = useAlerts(open);

  const today = new Date().toISOString().slice(0, 10);
  const quakeSpec = useMemo(() => ({
    key: `quakes:${today}:world:4.5`,
    url: usgsUrl(today, null, 4.5),
    ttlMs: 10 * 60_000,
    parse: async (res: Response) => parseUsgs(await res.json()),
    isEmpty: () => false,
  }), [today]);
  // Fetched whenever the panel is open (10-min TTL) so the chip count is right before the tab is picked.
  const quakesRes = useLiveSource<Earthquake[]>(quakeSpec, { enabled: open });
  const quakes: QuakeAlert[] = useMemo(() => (quakesRes.data ?? []).map(q => ({ id: q.id, mag: q.mag, place: q.place, time: q.time, lat: q.lat, lon: q.lon })), [quakesRes.data]);

  if (!open) return null;

  const handleSelect = (e: AlertEntry) => {
    if (e.tracker && knownSlugs.has(e.tracker)) onSelectTracker(e.tracker);
  };

  return (
    <aside className="alerts-panel" role="dialog" aria-label={t('alerts.title', locale)} data-testid="alerts-panel">
      <header className="alerts-header">
        <span className="alerts-heading">{t('alerts.title', locale)}</span>
        <FreshnessBadge
          lastUpdated={generated ?? undefined}
          label={t('alerts.lastScan', locale)}
          freshHours={1}
          staleHours={6}
          locale={locale}
        />
        <button type="button" className="alerts-close" onClick={onClose} aria-label={t('alerts.close', locale)}>×</button>
      </header>
      {status === 'error' && (
        <div className="alerts-empty" data-testid="alerts-error">{t('alerts.unavailable', locale)}{error ? ` (${error})` : ''}</div>
      )}
      <AlertsList
        entries={entries}
        quakes={quakes}
        filter={filter}
        onFilter={setFilter}
        onSelect={handleSelect}
        onLocate={onLocate}
      />
      <footer className="alerts-footer">
        <a href={auditHref}>{t('alerts.audit', locale)} →</a>
      </footer>
    </aside>
  );
}
