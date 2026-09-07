import { useEffect } from 'react';
import { t } from '../../../i18n/translations';
import { useLocale } from '../../../i18n/useLocale';
import type { Dossier } from '../../../lib/dossier';
import { eventPermalink } from '../../../lib/event-slug';

interface Props {
  loading: boolean;
  error: string | null;
  dossier: Dossier | null;
  onClose: () => void;
  /** Homepage: select in place. Tracker pages: navigate. */
  onSelectTracker?: (slug: string) => void;
  basePath: string;
  className?: string;
}

function fmtPop(n: number | null, locale: string): string {
  if (n === null) return '—';
  try { return new Intl.NumberFormat(locale).format(n); } catch { return String(n); }
}

/**
 * The "what is here?" card (plan E4.H3): place, country facts, trackers
 * covering the country, nearest events. Providers that failed are named
 * in grey rather than leaving a silent gap.
 */
export default function DossierPanel({ loading, error, dossier, onClose, onSelectTracker, basePath, className = '' }: Props) {
  const locale = useLocale();
  // Escape closes on every surface (globe, 2D map, homepage) without each
  // host having to wire it; the homepage's own handler closing it too is harmless.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const place = dossier?.place;
  const facts = dossier?.facts;
  const title = place?.city && place.country ? `${place.country} · ${place.city}` : place?.country ?? (facts?.name ?? t('dossier.unknownPlace', locale));

  return (
    <aside className={`dossier-panel ${className}`.trim()} role="dialog" aria-label={t('dossier.title', locale)} data-testid="dossier-panel">
      <header className="dossier-header">
        {facts?.flagUrl && <img className="dossier-flag" src={facts.flagUrl} alt="" width={28} height={18} loading="lazy" referrerPolicy="no-referrer" />}
        <span className="dossier-title" data-testid="dossier-title">{loading ? t('dossier.loading', locale) : title}</span>
        <button type="button" className="dossier-close" onClick={onClose} aria-label={t('dossier.close', locale)}>×</button>
      </header>

      {error && <div className="dossier-note">{t('dossier.error', locale)}: {error}</div>}

      {dossier && (
        <div className="dossier-body">
          <div className="dossier-coords">{dossier.lat.toFixed(3)}, {dossier.lon.toFixed(3)}{place?.state ? ` · ${place.state}` : ''}</div>

          {facts ? (
            <dl className="dossier-facts">
              {facts.capital && <><dt>{t('dossier.capital', locale)}</dt><dd>{facts.capital}</dd></>}
              <dt>{t('dossier.population', locale)}</dt><dd>{fmtPop(facts.population, locale)}</dd>
              {facts.headOfState && <><dt>{t('dossier.headOfState', locale)}</dt><dd>{facts.headOfState}</dd></>}
              {facts.headOfGovernment && facts.headOfGovernment !== facts.headOfState && <><dt>{t('dossier.headOfGovernment', locale)}</dt><dd>{facts.headOfGovernment}</dd></>}
            </dl>
          ) : dossier.degraded.includes('facts') ? (
            <div className="dossier-note">{t('dossier.noFacts', locale)}</div>
          ) : null}
          {dossier.degraded.includes('geocode') && <div className="dossier-note">{t('dossier.noGeocode', locale)}</div>}
          {dossier.extract ? (
            <p className="dossier-extract" data-testid="dossier-extract">
              {dossier.extract}
              {facts?.wikipediaUrl && <> <a href={facts.wikipediaUrl} target="_blank" rel="noopener noreferrer" className="dossier-extract-src">Wikipedia · CC BY-SA</a></>}
            </p>
          ) : dossier.degraded.includes('extract') ? (
            <div className="dossier-note">{t('dossier.noExtract', locale)}</div>
          ) : null}

          <section className="dossier-section">
            <h4>{t('dossier.trackers', locale)} · {dossier.trackers.length}</h4>
            {dossier.trackers.length === 0 ? (
              <div className="dossier-note">{t('dossier.noTrackers', locale)}</div>
            ) : (
              <ul className="dossier-list">
                {dossier.trackers.slice(0, 8).map(tr => (
                  <li key={tr.slug}>
                    {onSelectTracker ? (
                      <button type="button" className="dossier-link" onClick={() => onSelectTracker(tr.slug)}>{tr.name}</button>
                    ) : (
                      <a className="dossier-link" href={`${basePath}${tr.slug}/`}>{tr.name}</a>
                    )}
                    {tr.lastUpdated && <span className="dossier-meta">{tr.lastUpdated.slice(0, 10)}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="dossier-section">
            <h4>{t('dossier.nearby', locale)} · {dossier.nearby.length}</h4>
            {dossier.nearby.length === 0 ? (
              <div className="dossier-note">{t('dossier.noNearby', locale)}</div>
            ) : (
              <ul className="dossier-list">
                {dossier.nearby.map(ev => (
                  <li key={`${ev.slug}:${ev.id}`}>
                    <a className="dossier-link" href={eventPermalink(ev.slug, ev.date, ev.id, basePath)}>{ev.label}</a>
                    <span className="dossier-meta">{ev.distanceKm} km · {ev.date}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <footer className="dossier-footer">
            {facts?.wikipediaUrl && <a href={facts.wikipediaUrl} target="_blank" rel="noopener noreferrer">Wikipedia ↗</a>}
            <span>© OpenStreetMap contributors · Wikidata CC0</span>
          </footer>
        </div>
      )}
    </aside>
  );
}
