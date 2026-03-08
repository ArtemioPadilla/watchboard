import { useMemo, useState } from 'react';
import type { FlatEvent } from '../../../lib/timeline-utils';
import type { MapLine } from '../../../lib/schemas';

export interface StatsData {
  locations: number;
  vectors: number;
  sats?: number;
  fov?: number;
  flights?: number;
  quakes?: number;
  wx?: number;
  nfz?: number;
  ships?: number;
  historical?: boolean;
}

interface Props {
  minDate: string;
  maxDate: string;
  currentDate: string;
  isPlaying: boolean;
  playbackSpeed: number;
  mode: 'historical' | 'live';
  events: FlatEvent[];
  lines?: MapLine[];
  onDateChange: (date: string) => void;
  onTogglePlay: () => void;
  onSpeedChange: (speed: number) => void;
  onGoLive: () => void;
  stats?: StatsData;
}

const SPEEDS = [
  { label: '1x',   value: 1 },
  { label: '10m',  value: 600 },
  { label: '30m',  value: 1800 },
  { label: '1hr',  value: 3600 },
  { label: '2hr',  value: 7200 },
  { label: '3hr',  value: 10800 },
  { label: '5hr',  value: 18000 },
  { label: '10hr', value: 36000 },
  { label: '24hr', value: 86400 },
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
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', {
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

export default function CesiumTimelineBar({
  minDate,
  maxDate,
  currentDate,
  isPlaying,
  playbackSpeed,
  mode,
  events,
  lines = [],
  onDateChange,
  onTogglePlay,
  onSpeedChange,
  onGoLive,
  stats,
}: Props) {
  const [showSpeeds, setShowSpeeds] = useState(false);
  const totalDays = dateToDay(maxDate, minDate);
  const currentDay = dateToDay(currentDate, minDate);

  const currentSpeedLabel = SPEEDS.find(s => s.value === playbackSpeed)?.label || '1hr';

  // Sorted unique dates that have events or lines
  const eventDates = useMemo(() => {
    const dates = new Set<string>();
    events.forEach(ev => dates.add(ev.resolvedDate));
    lines.forEach(l => dates.add(l.date));
    return [...dates].filter(d => d >= minDate && d <= maxDate).sort();
  }, [events, lines, minDate, maxDate]);

  // Event ticks positioned by date
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

  // Count events for current date (for badge)
  const currentEventCount = useMemo(
    () => events.filter(ev => ev.resolvedDate === currentDate).length,
    [events, currentDate],
  );

  return (
    <div className="globe-timeline-enhanced">
      {/* Controls row */}
      <div className="globe-tl-controls">
        <button
          className="globe-tl-btn"
          onClick={() => onDateChange(prevEventDate(currentDate, eventDates))}
          disabled={prevEventDate(currentDate, eventDates) === currentDate}
          aria-label="Previous event"
          title="Previous event date"
        >
          &#9664;
        </button>
        <button
          className="globe-tl-btn globe-tl-play"
          onClick={onTogglePlay}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? '\u275A\u275A' : '\u25B6'}
        </button>
        <button
          className="globe-tl-btn"
          onClick={() => onDateChange(nextEventDate(currentDate, eventDates))}
          disabled={nextEventDate(currentDate, eventDates) === currentDate}
          aria-label="Next event"
          title="Next event date"
        >
          &#9654;
        </button>

        {/* Speed selector — gear icon with popup */}
        <div className="globe-tl-settings">
          <button
            className="globe-tl-btn globe-tl-gear"
            onClick={() => setShowSpeeds(prev => !prev)}
            title="Playback speed"
          >
            &#9881; <span className="globe-tl-speed-badge">{currentSpeedLabel}</span>
          </button>
          {showSpeeds && (
            <div className="globe-tl-speed-popup">
              {SPEEDS.map(s => (
                <button
                  key={s.value}
                  className={`globe-tl-speed-btn ${playbackSpeed === s.value ? 'active' : ''}`}
                  onClick={() => { onSpeedChange(s.value); setShowSpeeds(false); }}
                  title={`${s.label} per second`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* LIVE button */}
        <button
          className={`globe-tl-live ${mode === 'live' ? 'active' : ''}`}
          onClick={onGoLive}
        >
          <span className="globe-tl-live-dot" />
          LIVE
        </button>

        {/* Current date */}
        <span className="globe-tl-current-date">
          {formatDate(currentDate)}
          {currentEventCount > 0 && (
            <span className="globe-tl-event-badge">{currentEventCount}</span>
          )}
        </span>
      </div>

      {/* Timeline track with event ticks */}
      <div className="globe-tl-track-container">
        <span className="globe-tl-date-edge">{formatDate(minDate)}</span>
        <div className="globe-tl-track">
          {/* Event tick marks */}
          {ticks.map((tick, i) => (
            <div
              key={i}
              className="globe-tl-tick"
              style={{
                left: `${tick.pct}%`,
                backgroundColor: EVENT_TYPE_COLORS[tick.type] || '#888',
              }}
              title={`${tick.title} (${tick.date})`}
            />
          ))}
          <input
            type="range"
            className="globe-tl-slider"
            min={0}
            max={totalDays}
            value={currentDay}
            aria-label="Timeline date selector"
            aria-valuetext={formatDate(currentDate)}
            onChange={e => onDateChange(dayToDate(Number(e.target.value), minDate))}
          />
        </div>
        <span className="globe-tl-date-edge">{formatDate(maxDate)}</span>
      </div>

      {/* Stats row */}
      {stats && (
        <div className="globe-tl-stats">
          <span>{stats.locations} locations</span>
          <span className="globe-tl-stats-sep">&middot;</span>
          <span>{stats.vectors} vectors</span>
          {stats.sats != null && (
            <>
              <span className="globe-tl-stats-sep">&middot;</span>
              <span style={{ color: '#00ff88' }}>{stats.sats} sats</span>
            </>
          )}
          {stats.fov != null && (
            <>
              <span className="globe-tl-stats-sep">&middot;</span>
              <span style={{ color: '#ff8844' }}>{stats.fov} FOV</span>
            </>
          )}
          {stats.flights != null && (
            <>
              <span className="globe-tl-stats-sep">&middot;</span>
              <span style={{ color: '#00aaff' }}>{stats.flights} flights</span>
            </>
          )}
          {stats.quakes != null && (
            <>
              <span className="globe-tl-stats-sep">&middot;</span>
              <span style={{ color: '#ff6644' }}>{stats.quakes} quakes</span>
            </>
          )}
          {stats.wx != null && (
            <>
              <span className="globe-tl-stats-sep">&middot;</span>
              <span style={{ color: '#88ccff' }}>{stats.wx} wx</span>
            </>
          )}
          {stats.nfz != null && (
            <>
              <span className="globe-tl-stats-sep">&middot;</span>
              <span style={{ color: '#e74c3c' }}>{stats.nfz} NFZ</span>
            </>
          )}
          {stats.ships != null && (
            <>
              <span className="globe-tl-stats-sep">&middot;</span>
              <span style={{ color: '#00ddaa' }}>{stats.ships} ships</span>
            </>
          )}
          {stats.historical && (
            <>
              <span className="globe-tl-stats-sep">&middot;</span>
              <span style={{ color: '#9498a8' }}>HISTORICAL</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
