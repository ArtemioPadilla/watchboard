import { useMemo, useState, useRef, useEffect } from 'react';
import type { FlatEvent } from '../../../lib/timeline-utils';

interface Props {
  events: FlatEvent[];
  currentDate: string;
  isOpen: boolean;
  onToggle: () => void;
  activeEventId?: string | null;
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

const TIER_LABELS: Record<number, string> = {
  1: 'Official',
  2: 'Major',
  3: 'Institutional',
  4: 'Unverified',
};

const POLE_LABELS: Record<string, string> = {
  western: 'W',
  middle_eastern: 'ME',
  eastern: 'E',
  international: 'I',
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

export default function CesiumEventsPanel({ events, currentDate, isOpen, onToggle, activeEventId }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const activeRef = useRef<HTMLDivElement>(null);

  // Auto-scroll and auto-expand when cinematic mode highlights an event
  useEffect(() => {
    if (activeEventId) {
      setExpandedId(activeEventId);
    }
  }, [activeEventId]);

  useEffect(() => {
    if (activeEventId && activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeEventId]);

  const dateEvents = useMemo(
    () => events.filter(ev => ev.resolvedDate === currentDate),
    [events, currentDate],
  );

  const formatDisplayDate = (date: string) => {
    const d = new Date(date + 'T00:00:00Z');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  };

  if (!isOpen) {
    return (
      <button className="globe-events-toggle" onClick={onToggle}>
        <span className="globe-events-toggle-icon">&#9776;</span>
        <span className="globe-events-toggle-label">INTEL</span>
        {dateEvents.length > 0 && (
          <span className="globe-events-toggle-badge">{dateEvents.length}</span>
        )}
      </button>
    );
  }

  return (
    <div className="globe-events-panel">
      <div className="globe-events-header">
        <div>
          <div className="globe-events-title">INTEL FEED</div>
          <div className="globe-events-date">{formatDisplayDate(currentDate)}</div>
        </div>
        <button className="globe-events-close" onClick={onToggle} aria-label="Close events panel">
          &times;
        </button>
      </div>

      <div className="globe-events-list">
        {dateEvents.length === 0 ? (
          <div className="globe-events-empty">No events for this date</div>
        ) : (
          dateEvents.map(ev => {
            const isExpanded = expandedId === ev.id;
            const isCinematicActive = activeEventId === ev.id;
            return (
              <div
                key={ev.id}
                ref={isCinematicActive ? activeRef : undefined}
                className={`globe-event-card${isCinematicActive ? ' cinematic-highlight' : ''}`}
              >
                <div
                  className="globe-event-card-header"
                  onClick={() => setExpandedId(isExpanded ? null : ev.id)}
                  style={ev.confidence === 'low' ? { opacity: 0.6 } : undefined}
                >
                  <span
                    className="globe-event-type-badge"
                    style={{ color: TYPE_COLORS[ev.type] || '#888' }}
                  >
                    {TYPE_LABELS[ev.type] || ev.type.toUpperCase()}
                  </span>
                  {ev.confidence && (
                    <span
                      className="globe-event-confidence-dot"
                      style={{ background: CONFIDENCE_COLORS[ev.confidence] || '#888' }}
                      title={`Confidence: ${ev.confidence}`}
                    />
                  )}
                  <h4 className="globe-event-title">{ev.title}</h4>
                  {ev.weaponTypes && ev.weaponTypes.length > 0 && (
                    <span className="globe-event-weapon-badges">
                      {ev.weaponTypes.map((wt) => (
                        <span
                          key={wt}
                          className="globe-event-weapon-badge"
                          style={{ color: WEAPON_COLORS[wt] || '#888', borderColor: WEAPON_COLORS[wt] || '#888' }}
                        >
                          {wt.toUpperCase()}
                        </span>
                      ))}
                    </span>
                  )}
                  <span className="globe-event-expand">{isExpanded ? '\u2212' : '+'}</span>
                </div>

                {isExpanded && (
                  <div className="globe-event-detail">
                    <p className="globe-event-body">{ev.detail}</p>

                    {/* Sources */}
                    <div className="globe-event-sources">
                      {ev.sources.map((src, i) => (
                        <span key={i} className={`source-chip t${src.tier}`}>
                          {src.url ? (
                            <a href={src.url} target="_blank" rel="noopener noreferrer">
                              {src.name}
                            </a>
                          ) : (
                            src.name
                          )}
                          <span className="globe-event-tier">T{src.tier}</span>
                          {src.pole && (
                            <span className="globe-event-pole">{POLE_LABELS[src.pole] || src.pole}</span>
                          )}
                        </span>
                      ))}
                    </div>

                    {/* Media (future support) */}
                    {ev.media && ev.media.length > 0 && (
                      <div className="globe-event-media">
                        {ev.media.map((m, i) => (
                          <a
                            key={i}
                            href={m.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="globe-event-media-link"
                          >
                            {(m.type === 'image' || m.thumbnail) && m.thumbnail ? (
                              <img src={m.thumbnail} alt={m.caption || ''} className="globe-event-thumb" loading="lazy" referrerPolicy="no-referrer" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                            ) : m.type === 'video' ? (
                              <span className="globe-event-video-icon">&#9654; Video</span>
                            ) : (
                              <span className="globe-event-article-icon">&#128196; {m.source || 'Article'}</span>
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
