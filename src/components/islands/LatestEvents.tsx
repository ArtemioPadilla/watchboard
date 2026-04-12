import { useState, useMemo } from 'react';
import type { FlatEvent } from '../../lib/timeline-utils';
import { tierClass, tierLabelShort } from '../../lib/tier-utils';
import { t, getPreferredLocale, type Locale } from '../../i18n/translations';

interface Props {
  events: FlatEvent[];
  maxVisible?: number;
}

const DEFAULT_MAX_VISIBLE = 6;

function eventBorderColor(type: string): string {
  if (type === 'strike' || type === 'attack' || type === 'military') return 'var(--accent-red)';
  if (type === 'retaliation' || type === 'response') return 'var(--accent-amber)';
  if (type === 'diplomatic' || type === 'politics') return 'var(--accent-blue)';
  if (type === 'ceasefire' || type === 'peace') return 'var(--accent-green)';
  if (type === 'economic' || type === 'sanctions') return 'var(--accent-purple)';
  return 'var(--border-light)';
}

function eventTypeLabel(type: string, locale: Locale = 'en'): string {
  const labels: Record<string, string> = {
    strike: t('latest.kinetic', locale),
    attack: t('latest.kinetic', locale),
    military: t('latest.military', locale),
    retaliation: t('latest.retaliation', locale),
    response: t('latest.response', locale),
    diplomatic: t('latest.diplomatic', locale),
    politics: t('latest.political', locale),
    ceasefire: t('latest.ceasefire', locale),
    peace: t('latest.peace', locale),
    economic: t('latest.economic', locale),
    sanctions: t('latest.sanctions', locale),
  };
  return labels[type] ?? type.toUpperCase();
}

function eventTypeColor(type: string): string {
  if (type === 'strike' || type === 'attack' || type === 'military') return 'var(--accent-red)';
  if (type === 'retaliation' || type === 'response') return 'var(--accent-amber)';
  if (type === 'diplomatic' || type === 'politics') return 'var(--accent-blue)';
  if (type === 'ceasefire' || type === 'peace') return 'var(--accent-green)';
  if (type === 'economic' || type === 'sanctions') return 'var(--accent-purple)';
  return 'var(--text-muted)';
}

function formatDate(iso: string, locale: Locale = 'en'): string {
  const [year, month, day] = iso.split('-');
  const monthKeys = ['time.jan', 'time.feb', 'time.mar', 'time.apr', 'time.may', 'time.jun',
                    'time.jul', 'time.aug', 'time.sep', 'time.oct', 'time.nov', 'time.dec'] as const;
  const m = t(monthKeys[parseInt(month, 10) - 1] ?? 'time.jan', locale);
  return `${m} ${parseInt(day, 10)}, ${year}`;
}

export default function LatestEvents({ events, maxVisible = DEFAULT_MAX_VISIBLE }: Props) {
  const locale = getPreferredLocale();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const latestEvents = useMemo(() => {
    const sorted = events
      .slice()
      .sort((a, b) => b.resolvedDate.localeCompare(a.resolvedDate));

    if (sorted.length === 0) return [];

    const latestDate = sorted[0].resolvedDate;
    const todayEvents = sorted.filter(ev => ev.resolvedDate === latestDate);

    if (todayEvents.length >= maxVisible) return todayEvents;

    return sorted.slice(0, Math.max(todayEvents.length, maxVisible));
  }, [events, maxVisible]);

  const visibleEvents = showAll ? latestEvents : latestEvents.slice(0, maxVisible);
  const remainingCount = latestEvents.length - maxVisible;
  const latestDate = latestEvents.length > 0 ? latestEvents[0].resolvedDate : null;

  function toggleCard(id: string) {
    setExpandedId(prev => (prev === id ? null : id));
  }

  if (latestEvents.length === 0) return null;

  return (
    <div className="latest-events">
      <div className="latest-events-header">
        <span className="latest-events-label">{t('latest.latest', locale)}</span>
        <span className="latest-events-count">
          {latestDate && formatDate(latestDate, locale)} &middot; {latestEvents.length} {latestEvents.length !== 1 ? t('latest.events', locale) : t('latest.event', locale)}
        </span>
        <div className="latest-events-line" />
      </div>

      {visibleEvents.map(ev => {
        const isExpanded = expandedId === ev.id;
        return (
          <button
            key={ev.id}
            className="latest-event-card"
            style={{ borderLeftColor: eventBorderColor(ev.type) }}
            onClick={() => toggleCard(ev.id)}
            aria-expanded={isExpanded}
          >
            <div className="latest-event-header">
              <span className="latest-event-type" style={{ color: eventTypeColor(ev.type) }}>
                {eventTypeLabel(ev.type, locale)}
              </span>
              <span>
                <span className="latest-event-time">{formatDate(ev.resolvedDate, locale)}</span>
                <span className="latest-event-expand">{isExpanded ? '\u25B2' : '\u25BC'}</span>
              </span>
            </div>
            <div className="latest-event-title">{ev.title}</div>
            {!isExpanded && ev.detail && (
              <div className="latest-event-summary">
                {ev.detail.length > 120 ? ev.detail.slice(0, 120) + '...' : ev.detail}
              </div>
            )}
            {isExpanded && (
              <>
                {ev.detail && (
                  <div className="latest-event-body">{ev.detail}</div>
                )}
                {ev.sources && ev.sources.length > 0 && (
                  <div className="latest-event-sources">
                    {ev.sources.map((src, i) => (
                      src.url ? (
                        <a
                          key={i}
                          href={src.url}
                          className={`source-chip ${tierClass(src.tier)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                        >
                          {tierLabelShort(src.tier)} {src.name}
                        </a>
                      ) : (
                        <span
                          key={i}
                          className={`source-chip ${tierClass(src.tier)}`}
                        >
                          {tierLabelShort(src.tier)} {src.name}
                        </span>
                      )
                    ))}
                  </div>
                )}
              </>
            )}
          </button>
        );
      })}

      {!showAll && remainingCount > 0 && (
        <button
          className="latest-events-more"
          onClick={() => setShowAll(true)}
          type="button"
        >
          +{remainingCount} {remainingCount !== 1 ? t('latest.moreEvents', locale) : t('latest.moreEvent', locale)}
        </button>
      )}
    </div>
  );
}
