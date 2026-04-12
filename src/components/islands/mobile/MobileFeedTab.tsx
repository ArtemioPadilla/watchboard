// src/components/islands/mobile/MobileFeedTab.tsx
import { useState, useRef, useCallback, useEffect } from 'react';
import type { FlatEvent } from '../../../lib/timeline-utils';
import { tierClass, tierLabelShort } from '../../../lib/tier-utils';
import { haptic } from '../../../lib/haptic';
import { eventTypeColor, relativeTime } from '../../../lib/event-utils';
import { t, getPreferredLocale, type Locale } from '../../../i18n/translations';

interface Props {
  heroSubtitle: string;
  events: FlatEvent[];
}

const PULL_TRIGGER = 80;

function formatDate(iso: string, locale: Locale = 'en'): string {
  const [year, month, day] = iso.split('-');
  const monthKeys = ['time.jan', 'time.feb', 'time.mar', 'time.apr', 'time.may', 'time.jun',
                    'time.jul', 'time.aug', 'time.sep', 'time.oct', 'time.nov', 'time.dec'] as const;
  const m = t(monthKeys[parseInt(month, 10) - 1] ?? 'time.jan', locale);
  return `${m} ${parseInt(day, 10)}, ${year}`;
}

export default function MobileFeedTab({ heroSubtitle, events }: Props) {
  const locale = getPreferredLocale();
  const [selectedEvent, setSelectedEvent] = useState<FlatEvent | null>(null);

  // ── Pull-to-refresh (#2) — C1 fix: use ref for pull distance ──
  const [pullY, setPullY] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const pullStartRef = useRef<number | null>(null);
  const pullYRef = useRef(0);
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // I5 fix: clean up reload timer on unmount
  useEffect(() => {
    return () => { if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current); };
  }, []);

  // I2 fix: stopPropagation when pull activates so parent swipe handler doesn't also fire
  const handlePullStart = useCallback((e: React.TouchEvent) => {
    const scrollParent = (e.currentTarget as HTMLElement).closest('.mtab-content');
    if (scrollParent && scrollParent.scrollTop <= 0) {
      pullStartRef.current = e.touches[0].clientY;
      e.stopPropagation();
    }
  }, []);

  const handlePullMove = useCallback((e: React.TouchEvent) => {
    if (pullStartRef.current === null || refreshing) return;
    const dy = e.touches[0].clientY - pullStartRef.current;
    if (dy > 0) {
      const damped = Math.min(dy * 0.5, 100);
      pullYRef.current = damped;
      setPullY(damped);
      e.stopPropagation();
    }
  }, [refreshing]);

  // C1 fix: read pullYRef.current instead of stale pullY state
  const handlePullEnd = useCallback(() => {
    if (pullYRef.current >= PULL_TRIGGER * 0.5 && !refreshing) {
      setRefreshing(true);
      haptic(20);
      reloadTimerRef.current = setTimeout(() => window.location.reload(), 600);
    } else {
      setPullY(0);
    }
    pullYRef.current = 0;
    pullStartRef.current = null;
  }, [refreshing]);

  // ── C2 fix: body scroll lock + Escape key for bottom sheet ──
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!selectedEvent) return;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedEvent(null);
    };
    document.addEventListener('keydown', handleKeyDown);
    // Auto-focus the sheet for keyboard users
    sheetRef.current?.focus();
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedEvent]);

  // ── Group events by date ──
  const grouped = events
    .slice()
    .sort((a, b) => b.resolvedDate.localeCompare(a.resolvedDate))
    .reduce<Record<string, FlatEvent[]>>((acc, ev) => {
      const key = ev.resolvedDate;
      if (!acc[key]) acc[key] = [];
      acc[key].push(ev);
      return acc;
    }, {});

  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  function handleEventTap(ev: FlatEvent) {
    setSelectedEvent(prev => (prev?.id === ev.id ? null : ev));
    haptic();
  }

  return (
    <div
      className="mtab-feed"
      onTouchStart={handlePullStart}
      onTouchMove={handlePullMove}
      onTouchEnd={handlePullEnd}
    >
      {/* Pull-to-refresh indicator */}
      {(pullY > 0 || refreshing) && (
        <div
          className={`mtab-pull-indicator ${refreshing ? 'mtab-pull-refreshing' : ''}`}
          style={{ height: refreshing ? 40 : pullY }}
        >
          {refreshing ? (
            <div className="mtab-pull-spinner" />
          ) : (
            <span className="mtab-pull-arrow" style={{
              transform: `rotate(${pullY >= PULL_TRIGGER * 0.5 ? 180 : 0}deg)`,
            }}>
              ↓
            </span>
          )}
          <span className="mtab-pull-text">
            {refreshing ? t('feed.refreshing', locale) : pullY >= PULL_TRIGGER * 0.5 ? t('feed.releaseToRefresh', locale) : t('feed.pullToRefresh', locale)}
          </span>
        </div>
      )}

      <div className="mtab-brief">
        <div className="mtab-brief-label">{t('feed.situationBrief', locale)}</div>
        <p className="mtab-brief-text">{heroSubtitle}</p>
      </div>

      {sortedDates.map(date => {
        const dayEvents = grouped[date];
        return (
          <div key={date} className="mtab-feed-day">
            <div className="mtab-feed-date">
              {formatDate(date, locale)}
              <span className="mtab-feed-count">
                {dayEvents.length} {dayEvents.length !== 1 ? t('feed.events', locale) : t('feed.event', locale)}
              </span>
            </div>
            {dayEvents.map(ev => (
              <FeedEventCard key={ev.id} event={ev} onTap={handleEventTap} />
            ))}
          </div>
        );
      })}

      {sortedDates.length === 0 && (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          {t('feed.noEvents', locale)}
        </p>
      )}

      {/* Bottom sheet overlay (#3) — C2 fix: dialog role, aria, focus, scroll lock */}
      {selectedEvent && (
        <div className="mtab-sheet-backdrop" onClick={() => setSelectedEvent(null)}>
          <div
            ref={sheetRef}
            className="mtab-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mtab-sheet-title"
            tabIndex={-1}
            onClick={e => e.stopPropagation()}
          >
            <div className="mtab-sheet-handle" />
            <div className="mtab-sheet-header">
              <span
                className="mtab-sheet-type"
                style={{ color: eventTypeColor(selectedEvent.type) }}
              >
                {selectedEvent.type}
              </span>
              <button
                className="mtab-sheet-close"
                onClick={() => setSelectedEvent(null)}
                aria-label={t('feed.closeEventDetails', locale)}
              >
                ✕
              </button>
            </div>
            <h3 id="mtab-sheet-title" className="mtab-sheet-title">{selectedEvent.title}</h3>
            <div className="mtab-sheet-date" suppressHydrationWarning>
              {formatDate(selectedEvent.resolvedDate, locale)} · {relativeTime(selectedEvent.resolvedDate)}
            </div>
            {selectedEvent.detail && (
              <p className="mtab-sheet-body">{selectedEvent.detail}</p>
            )}
            {selectedEvent.sources && selectedEvent.sources.length > 0 && (
              <div className="mtab-sheet-sources">
                <div className="mtab-sheet-sources-label">{t('feed.sources', locale)}</div>
                <div className="mtab-event-sources">
                  {selectedEvent.sources.map((src, i) => (
                    src.url ? (
                      <a
                        key={i}
                        href={src.url}
                        className={`source-chip ${tierClass(src.tier)}`}
                        target="_blank"
                        rel="noopener noreferrer"
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
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function FeedEventCard({ event: ev, onTap }: { event: FlatEvent; onTap: (ev: FlatEvent) => void }) {
  const thumb = ev.media?.find(m => m.thumbnail)?.thumbnail;
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <button
      className="mtab-event-card"
      style={{ borderLeftColor: eventTypeColor(ev.type) }}
      onClick={() => onTap(ev)}
      aria-label={ev.title}
    >
      <div className="mtab-event-card-row">
        {thumb && !imgFailed ? (
          <img
            className="mtab-event-thumb"
            src={thumb}
            alt={`Event image for ${ev.title}`}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div
            className="mtab-event-thumb-fallback"
            style={{ borderColor: eventTypeColor(ev.type) }}
          >
            <span className="mtab-event-thumb-icon">{ev.type.charAt(0).toUpperCase()}</span>
          </div>
        )}
        <div className="mtab-event-card-content">
          <div className="mtab-event-header">
            <span className="mtab-event-type">{ev.type}</span>
            <span className="mtab-event-time" suppressHydrationWarning>
              {relativeTime(ev.resolvedDate)}
            </span>
          </div>
          <div className="mtab-event-title">{ev.title}</div>
        </div>
      </div>
    </button>
  );
}
