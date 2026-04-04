// src/components/islands/mobile/MobileFeedTab.tsx
import { useState, useRef, useCallback } from 'react';
import type { FlatEvent } from '../../../lib/timeline-utils';
import { tierClass, tierLabelShort } from '../../../lib/tier-utils';
import { haptic } from '../../../lib/haptic';

interface Props {
  heroSubtitle: string;
  events: FlatEvent[];
}

const PULL_TRIGGER = 80;

function eventBorderColor(type: string): string {
  if (type === 'strike' || type === 'attack') return 'var(--accent-red)';
  if (type === 'retaliation' || type === 'response') return 'var(--accent-amber)';
  if (type === 'diplomatic' || type === 'politics') return 'var(--accent-blue)';
  if (type === 'ceasefire' || type === 'peace') return 'var(--accent-green)';
  return 'var(--border-light)';
}

function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const m = months[parseInt(month, 10) - 1] ?? month;
  return `${m} ${parseInt(day, 10)}, ${year}`;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / 3600_000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function MobileFeedTab({ heroSubtitle, events }: Props) {
  const [selectedEvent, setSelectedEvent] = useState<FlatEvent | null>(null);

  // ── Pull-to-refresh (#2) ──
  const [pullY, setPullY] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const pullStartRef = useRef<number | null>(null);

  const handlePullStart = useCallback((e: React.TouchEvent) => {
    const scrollParent = (e.currentTarget as HTMLElement).closest('.mtab-content');
    if (scrollParent && scrollParent.scrollTop <= 0) {
      pullStartRef.current = e.touches[0].clientY;
    }
  }, []);

  const handlePullMove = useCallback((e: React.TouchEvent) => {
    if (pullStartRef.current === null || refreshing) return;
    const dy = e.touches[0].clientY - pullStartRef.current;
    if (dy > 0) {
      setPullY(Math.min(dy * 0.5, 100)); // damped
    }
  }, [refreshing]);

  const handlePullEnd = useCallback(() => {
    if (pullY >= PULL_TRIGGER * 0.5 && !refreshing) {
      setRefreshing(true);
      haptic(20);
      setTimeout(() => window.location.reload(), 600);
    } else {
      setPullY(0);
    }
    pullStartRef.current = null;
  }, [pullY, refreshing]);

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
            {refreshing ? 'Refreshing...' : pullY >= PULL_TRIGGER * 0.5 ? 'Release to refresh' : 'Pull to refresh'}
          </span>
        </div>
      )}

      <div className="mtab-brief">
        <div className="mtab-brief-label">Situation Brief</div>
        <p className="mtab-brief-text">{heroSubtitle}</p>
      </div>

      {sortedDates.map(date => {
        const dayEvents = grouped[date];
        return (
          <div key={date} className="mtab-feed-day">
            <div className="mtab-feed-date">
              {formatDate(date)}
              <span className="mtab-feed-count">
                {dayEvents.length} event{dayEvents.length !== 1 ? 's' : ''}
              </span>
            </div>
            {dayEvents.map(ev => (
              <button
                key={ev.id}
                className="mtab-event-card"
                style={{ borderLeftColor: eventBorderColor(ev.type) }}
                onClick={() => handleEventTap(ev)}
              >
                <div className="mtab-event-header">
                  <span className="mtab-event-type">{ev.type}</span>
                  <span className="mtab-event-time" suppressHydrationWarning>
                    {relativeTime(ev.resolvedDate)}
                  </span>
                </div>
                <div className="mtab-event-title">{ev.title}</div>
              </button>
            ))}
          </div>
        );
      })}

      {sortedDates.length === 0 && (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          No events available.
        </p>
      )}

      {/* Bottom sheet overlay (#3) */}
      {selectedEvent && (
        <div className="mtab-sheet-backdrop" onClick={() => setSelectedEvent(null)}>
          <div className="mtab-sheet" onClick={e => e.stopPropagation()}>
            <div className="mtab-sheet-handle" />
            <div className="mtab-sheet-header">
              <span
                className="mtab-sheet-type"
                style={{ color: eventBorderColor(selectedEvent.type) }}
              >
                {selectedEvent.type}
              </span>
              <button className="mtab-sheet-close" onClick={() => setSelectedEvent(null)}>
                ✕
              </button>
            </div>
            <h3 className="mtab-sheet-title">{selectedEvent.title}</h3>
            <div className="mtab-sheet-date" suppressHydrationWarning>
              {formatDate(selectedEvent.resolvedDate)} · {relativeTime(selectedEvent.resolvedDate)}
            </div>
            {selectedEvent.detail && (
              <p className="mtab-sheet-body">{selectedEvent.detail}</p>
            )}
            {selectedEvent.sources && selectedEvent.sources.length > 0 && (
              <div className="mtab-sheet-sources">
                <div className="mtab-sheet-sources-label">Sources</div>
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
