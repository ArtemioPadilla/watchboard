import { useMemo, useState, useEffect } from 'react';
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
  gpsJam?: number;
  internetBlackout?: number;
  groundTruth?: number;
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
  onTimeChange?: (ms: number) => void;
  onTogglePlay: () => void;
  onSpeedChange: (speed: number) => void;
  onGoLive: () => void;
  stats?: StatsData;
  simTimeRef?: React.RefObject<number>;
}

/** Format time in a specific timezone offset (hours from UTC) */
function formatTZ(ms: number, offsetHours: number): string {
  const d = new Date(ms + offsetHours * 3600000);
  const h = d.getUTCHours().toString().padStart(2, '0');
  const m = d.getUTCMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

/** Format minutes since midnight to HH:MM */
function formatHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60).toString().padStart(2, '0');
  const m = (minutes % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

/** Color for line categories */
const LINE_CAT_COLORS: Record<string, string> = {
  strike: '#e74c3c',
  retaliation: '#f39c12',
  asset: '#3498db',
  front: '#ff44ff',
};

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
  simTimeRef,
  onTimeChange,
}: Props) {
  const [showSpeeds, setShowSpeeds] = useState(false);
  const [clockTick, setClockTick] = useState(0);

  // Tick clocks every second
  useEffect(() => {
    const id = setInterval(() => setClockTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const simMs = simTimeRef?.current ?? Date.now();
  // clockTick drives re-render for clocks + intra-day thumb
  void clockTick;

  const totalDays = dateToDay(maxDate, minDate);
  const currentDay = dateToDay(currentDate, minDate);

  // Current time within the day (minutes since midnight UTC)
  const simDate = new Date(simMs);
  const currentMinute = simDate.getUTCHours() * 60 + simDate.getUTCMinutes();

  // Intra-day timed events for the current date
  const intradayTicks = useMemo(() => {
    const ticked: { minute: number; label: string; cat: string; color: string }[] = [];
    for (const line of lines) {
      if (line.date !== currentDate || !line.time) continue;
      const match = line.time.match(/^(\d{1,2}):(\d{2})$/);
      if (!match) continue;
      const min = parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
      ticked.push({
        minute: min,
        label: `${line.time} — ${line.label}`,
        cat: line.cat,
        color: LINE_CAT_COLORS[line.cat] || '#888',
      });
    }
    return ticked.sort((a, b) => a.minute - b.minute);
  }, [lines, currentDate]);

  const hasIntradayEvents = intradayTicks.length > 0;

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

        {/* Timezone clocks */}
        <div className="globe-tl-clocks">
          <span className="globe-tl-clock"><span className="globe-tl-clock-label">TEHRAN</span> {formatTZ(simMs, 3.5)}</span>
          <span className="globe-tl-clock"><span className="globe-tl-clock-label">TLV</span> {formatTZ(simMs, 3)}</span>
          <span className="globe-tl-clock"><span className="globe-tl-clock-label">UTC</span> {formatTZ(simMs, 0)}</span>
          <span className="globe-tl-clock"><span className="globe-tl-clock-label">EST</span> {formatTZ(simMs, -5)}</span>
        </div>
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

      {/* Intra-day timeline — shows when current day has timed events */}
      {hasIntradayEvents && (
        <div className="globe-tl-intraday">
          <span className="globe-tl-intraday-label">
            {formatHHMM(currentMinute)} UTC
          </span>
          <div className="globe-tl-intraday-track">
            {/* Hour markers */}
            {[0, 6, 12, 18].map(h => (
              <span
                key={h}
                className="globe-tl-intraday-hour"
                style={{ left: `${(h / 24) * 100}%` }}
              >
                {h.toString().padStart(2, '0')}
              </span>
            ))}
            {/* Event ticks */}
            {intradayTicks.map((t, i) => (
              <div
                key={i}
                className="globe-tl-intraday-tick"
                style={{
                  left: `${(t.minute / 1440) * 100}%`,
                  backgroundColor: t.color,
                }}
                title={t.label}
              />
            ))}
            <input
              type="range"
              className="globe-tl-slider globe-tl-intraday-slider"
              min={0}
              max={1440}
              value={currentMinute}
              aria-label="Intra-day time selector"
              aria-valuetext={formatHHMM(currentMinute)}
              onChange={e => {
                if (!onTimeChange) return;
                const min = Number(e.target.value);
                // Compute ms: start of current day + minutes
                const dayStart = new Date(currentDate + 'T00:00:00Z').getTime();
                onTimeChange(dayStart + min * 60000);
              }}
            />
          </div>
          <span className="globe-tl-intraday-label">24:00</span>
        </div>
      )}

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
          {stats.gpsJam != null && (
            <>
              <span className="globe-tl-stats-sep">&middot;</span>
              <span style={{ color: '#ff2244' }}>{stats.gpsJam} GPS JAM</span>
            </>
          )}
          {stats.internetBlackout != null && (
            <>
              <span className="globe-tl-stats-sep">&middot;</span>
              <span style={{ color: '#ff6644' }}>{stats.internetBlackout} BLACKOUT</span>
            </>
          )}
          {stats.groundTruth != null && (
            <>
              <span className="globe-tl-stats-sep">&middot;</span>
              <span style={{ color: '#ffaa00' }}>{stats.groundTruth} GT</span>
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

      {/* Event type legend (WORLDVIEW style) */}
      <div className="globe-tl-legend">
        <span className="globe-tl-legend-item" style={{ color: '#e74c3c' }}>&#9679; Kinetic</span>
        <span className="globe-tl-legend-item" style={{ color: '#f39c12' }}>&#9679; Retaliation</span>
        <span className="globe-tl-legend-item" style={{ color: '#ffaa00' }}>&#9679; Civilian Impact</span>
        <span className="globe-tl-legend-item" style={{ color: '#00aaff' }}>&#9679; Maritime</span>
        <span className="globe-tl-legend-item" style={{ color: '#ff6644' }}>&#9679; Infrastructure</span>
        <span className="globe-tl-legend-item" style={{ color: '#ff44ff' }}>&#9679; Escalation</span>
        <span className="globe-tl-legend-item" style={{ color: '#e74c3c' }}>&#9679; Airspace Closure</span>
      </div>
    </div>
  );
}
