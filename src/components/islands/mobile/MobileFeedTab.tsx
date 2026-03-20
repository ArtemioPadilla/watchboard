// src/components/islands/mobile/MobileFeedTab.tsx
import { useState } from 'react';
import type { FlatEvent } from '../../../lib/timeline-utils';
import { tierClass, tierLabelShort } from '../../../lib/tier-utils';

interface Props {
  heroSubtitle: string;
  events: FlatEvent[];
}

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

export default function MobileFeedTab({ heroSubtitle, events }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Group events by date, most recent first
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

  function toggleCard(id: string) {
    setExpandedId(prev => (prev === id ? null : id));
  }

  return (
    <div className="mtab-feed">
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
            {dayEvents.map(ev => {
              const isExpanded = expandedId === ev.id;
              return (
                <button
                  key={ev.id}
                  className="mtab-event-card"
                  style={{ borderLeftColor: eventBorderColor(ev.type) }}
                  onClick={() => toggleCard(ev.id)}
                  aria-expanded={isExpanded}
                >
                  <div className="mtab-event-header">
                    <span className="mtab-event-type">{ev.type}</span>
                    <span className="mtab-event-expand">{isExpanded ? '▲' : '▼'}</span>
                  </div>
                  <div className="mtab-event-title">{ev.title}</div>
                  {isExpanded && (
                    <>
                      {ev.detail && (
                        <p className="mtab-event-body">{ev.detail}</p>
                      )}
                      {ev.sources && ev.sources.length > 0 && (
                        <div className="mtab-event-sources">
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
          </div>
        );
      })}

      {sortedDates.length === 0 && (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          No events available.
        </p>
      )}
    </div>
  );
}
