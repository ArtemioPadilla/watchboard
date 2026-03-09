import { useMemo } from 'react';
import type { FlatEvent } from '../../lib/timeline-utils';
import type { MapLine } from '../../lib/schemas';

interface Props {
  minDate: string;
  maxDate: string;
  currentDate: string;
  isPlaying: boolean;
  playbackSpeed: number;
  events: FlatEvent[];
  lines: MapLine[];
  persistLines: boolean;
  onDateChange: (date: string) => void;
  onTogglePlay: () => void;
  onSpeedChange: (speed: number) => void;
  onTogglePersist: () => void;
}

const SPEEDS = [
  { label: '1x', ms: 200 },
  { label: '2x', ms: 100 },
  { label: '5x', ms: 50 },
  { label: '10x', ms: 25 },
  { label: 'Auto', ms: 10 },
];

const EVENT_TYPE_COLORS: Record<string, string> = {
  military: '#e74c3c',
  diplomatic: '#3498db',
  humanitarian: '#f39c12',
  economic: '#2ecc71',
};

function dateToDay(date: string, minDate: string): number {
  return Math.round(
    (new Date(date).getTime() - new Date(minDate).getTime()) / 86400000,
  );
}

function dayToDate(day: number, minDate: string): string {
  const d = new Date(minDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + day);
  return d.toISOString().split('T')[0];
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function prevEventDate(current: string, dates: string[]): string {
  for (let i = dates.length - 1; i >= 0; i--) {
    if (dates[i] < current) return dates[i];
  }
  return current;
}

function nextEventDate(current: string, dates: string[]): string {
  for (const d of dates) {
    if (d > current) return d;
  }
  return current;
}

export default function TimelineSlider({
  minDate,
  maxDate,
  currentDate,
  isPlaying,
  playbackSpeed,
  events,
  lines,
  persistLines,
  onDateChange,
  onTogglePlay,
  onSpeedChange,
  onTogglePersist,
}: Props) {
  const totalDays = dateToDay(maxDate, minDate);
  const currentDay = dateToDay(currentDate, minDate);

  const eventDates = useMemo(() => {
    const dates = new Set<string>();
    events.forEach(ev => dates.add(ev.resolvedDate));
    lines.forEach(l => dates.add(l.date));
    return [...dates].filter(d => d >= minDate && d <= maxDate).sort();
  }, [events, lines, minDate, maxDate]);

  const ticks = useMemo(() => {
    const seen = new Set<string>();
    return events
      .filter(ev => {
        const key = `${ev.resolvedDate}-${ev.type}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return ev.resolvedDate >= minDate && ev.resolvedDate <= maxDate;
      })
      .map(ev => ({
        date: ev.resolvedDate,
        type: ev.type,
        title: ev.title,
        pct: totalDays > 0 ? (dateToDay(ev.resolvedDate, minDate) / totalDays) * 100 : 0,
      }));
  }, [events, minDate, maxDate, totalDays]);

  const currentEventCount = useMemo(
    () => events.filter(ev => ev.resolvedDate === currentDate).length,
    [events, currentDate],
  );

  const handleGoLive = () => {
    onDateChange(maxDate);
  };

  const isLive = currentDate === maxDate;

  return (
    <div className="map-tl-enhanced">
      <div className="map-tl-controls">
        <button
          className="map-tl-btn"
          onClick={() => onDateChange(prevEventDate(currentDate, eventDates))}
          disabled={prevEventDate(currentDate, eventDates) === currentDate}
          aria-label="Previous event"
          title="Previous event date"
        >
          &#9664;
        </button>
        <button
          className="map-tl-btn map-tl-play"
          onClick={onTogglePlay}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? '\u275A\u275A' : '\u25B6'}
        </button>
        <button
          className="map-tl-btn"
          onClick={() => onDateChange(nextEventDate(currentDate, eventDates))}
          disabled={nextEventDate(currentDate, eventDates) === currentDate}
          aria-label="Next event"
          title="Next event date"
        >
          &#9654;
        </button>

        <div className="map-tl-speed">
          {SPEEDS.map(s => (
            <button
              key={s.ms}
              className={`map-tl-speed-btn${playbackSpeed === s.ms ? ' active' : ''}`}
              onClick={() => onSpeedChange(s.ms)}
              title={`${s.label} speed`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <button
          className={`map-tl-persist${persistLines ? ' active' : ''}`}
          onClick={onTogglePersist}
          title={persistLines ? 'Showing all lines up to date' : 'Showing only current day'}
        >
          {persistLines ? 'ALL' : 'DAY'}
        </button>

        <button
          className={`map-tl-live${isLive ? ' active' : ''}`}
          onClick={handleGoLive}
        >
          <span className="map-tl-live-dot" />
          LIVE
        </button>

        <span className="map-tl-current-date">
          {formatDate(currentDate)}
          {currentEventCount > 0 && (
            <span className="map-tl-event-badge">{currentEventCount}</span>
          )}
        </span>
      </div>

      <div className="map-tl-track-container">
        <span className="map-tl-date-edge">{formatDate(minDate)}</span>
        <div className="map-tl-track">
          {ticks.map((tick, i) => (
            <div
              key={i}
              className="map-tl-tick"
              style={{
                left: `${tick.pct}%`,
                backgroundColor: EVENT_TYPE_COLORS[tick.type] || '#888',
              }}
              title={`${tick.title} (${tick.date})`}
            />
          ))}
          <input
            type="range"
            className="map-tl-slider"
            min={0}
            max={totalDays}
            value={currentDay}
            aria-label="Timeline date selector"
            aria-valuetext={formatDate(currentDate)}
            onChange={e => onDateChange(dayToDate(Number(e.target.value), minDate))}
          />
        </div>
        <span className="map-tl-date-edge">{formatDate(maxDate)}</span>
      </div>
    </div>
  );
}
