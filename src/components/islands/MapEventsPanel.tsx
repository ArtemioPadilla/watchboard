import { useMemo, useState } from 'react';
import type { FlatEvent } from '../../lib/timeline-utils';

interface Props {
  events: FlatEvent[];
  currentDate: string;
  isOpen: boolean;
  onToggle: () => void;
}

const TYPE_COLORS: Record<string, string> = {
  military: '#e74c3c',
  diplomatic: '#3498db',
  humanitarian: '#f39c12',
  economic: '#2ecc71',
};

const TYPE_LABELS: Record<string, string> = {
  military: 'MILITARY',
  diplomatic: 'DIPLOMATIC',
  humanitarian: 'HUMANITARIAN',
  economic: 'ECONOMIC',
};

const WEAPON_COLORS: Record<string, string> = {
  ballistic: '#ff4444',
  cruise: '#ff8800',
  drone: '#aa66ff',
  rocket: '#ffcc00',
  mixed: '#ff6688',
  unknown: '#888',
};

const CONFIDENCE_COLORS: Record<string, string> = {
  high: '#2ecc71',
  medium: '#f39c12',
  low: '#e74c3c',
};

const POLE_LABELS: Record<string, string> = {
  western: 'W',
  middle_eastern: 'ME',
  eastern: 'E',
  international: 'I',
};

const TIER_LABELS: Record<number, string> = {
  1: 'Official',
  2: 'Major',
  3: 'Institutional',
  4: 'Unverified',
};

function formatDisplayDate(date: string): string {
  const d = new Date(date + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function MapEventsPanel({ events, currentDate, isOpen, onToggle }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const dateEvents = useMemo(
    () => events.filter(ev => ev.resolvedDate === currentDate),
    [events, currentDate],
  );

  if (!isOpen) {
    return (
      <button className="map-events-toggle" onClick={onToggle} aria-label="Open events panel">
        <span className="map-events-toggle-icon">&#9776;</span>
        {dateEvents.length > 0 && (
          <span className="map-events-toggle-badge">{dateEvents.length}</span>
        )}
      </button>
    );
  }

  return (
    <div className="map-events-panel">
      <div className="map-events-header">
        <div>
          <div className="map-events-title">INTEL FEED</div>
          <div className="map-events-date">{formatDisplayDate(currentDate)}</div>
        </div>
        <button className="map-events-close" onClick={onToggle} aria-label="Close events panel">
          &times;
        </button>
      </div>

      <div className="map-events-list">
        {dateEvents.length === 0 ? (
          <div className="map-events-empty">No events for this date</div>
        ) : (
          dateEvents.map(ev => {
            const isExpanded = expandedId === ev.id;
            const confidence = ev.confidence;
            const weaponTypes = ev.weaponTypes;

            return (
              <div key={ev.id} className="map-event-card">
                <div
                  className="map-event-card-header"
                  onClick={() => setExpandedId(isExpanded ? null : ev.id)}
                  style={confidence === 'low' ? { opacity: 0.6 } : undefined}
                >
                  <span
                    className="map-event-type-badge"
                    style={{ color: TYPE_COLORS[ev.type] || '#888' }}
                  >
                    {TYPE_LABELS[ev.type] || ev.type.toUpperCase()}
                  </span>
                  {confidence && (
                    <span
                      className="map-event-confidence-dot"
                      style={{ background: CONFIDENCE_COLORS[confidence] || '#888' }}
                      title={`Confidence: ${confidence}`}
                    />
                  )}
                  <h4 className="map-event-title">{ev.title}</h4>
                  {weaponTypes && weaponTypes.length > 0 && (
                    <span className="map-event-weapon-badges">
                      {weaponTypes.map((wt: string) => (
                        <span
                          key={wt}
                          className="map-event-weapon-badge"
                          style={{
                            color: WEAPON_COLORS[wt] || '#888',
                            borderColor: WEAPON_COLORS[wt] || '#888',
                          }}
                        >
                          {wt.toUpperCase()}
                        </span>
                      ))}
                    </span>
                  )}
                  <span className="map-event-expand">{isExpanded ? '\u2212' : '+'}</span>
                </div>

                {isExpanded && (
                  <div className="map-event-detail">
                    <p className="map-event-body">{ev.detail}</p>

                    <div className="map-event-sources">
                      {ev.sources.map((src, i) => (
                        <span key={i} className={`source-chip t${src.tier}`}>
                          {src.url ? (
                            <a href={src.url} target="_blank" rel="noopener noreferrer">
                              {src.name}
                            </a>
                          ) : (
                            src.name
                          )}
                          <span className="map-event-tier">
                            T{src.tier} {TIER_LABELS[src.tier] || ''}
                          </span>
                          {src.pole && (
                            <span className="map-event-pole">
                              {POLE_LABELS[src.pole] || src.pole}
                            </span>
                          )}
                        </span>
                      ))}
                    </div>

                    {ev.media && ev.media.length > 0 && (
                      <div className="map-event-media">
                        {ev.media.map((m, i) => (
                          <a
                            key={i}
                            href={m.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="map-event-media-link"
                          >
                            {(m.type === 'image' || m.thumbnail) && m.thumbnail ? (
                              <img src={m.thumbnail} alt={m.caption || ''} className="map-event-thumb" referrerPolicy="no-referrer" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                            ) : m.type === 'video' ? (
                              <span className="map-event-video-icon">&#9654; Video</span>
                            ) : (
                              <span className="map-event-article-icon">&#128196; {m.source || 'Article'}</span>
                            )}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
