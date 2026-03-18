import { useMemo, useState, useEffect } from 'react';
import type { FlatEvent } from '../../../lib/timeline-utils';
import type { MapLine } from '../../../lib/schemas';

// ── Zoom types & helpers ──

export type TimelineZoomLevel = 'all' | 'year' | 'quarter' | 'month' | 'week' | 'day';

const ZOOM_DAYS: Record<TimelineZoomLevel, number> = {
  all: Infinity,
  year: 365,
  quarter: 90,
  month: 30,
  week: 7,
  day: 1,
};

const ZOOM_LABELS: Record<TimelineZoomLevel, string> = {
  all: 'ALL',
  year: 'YR',
  quarter: 'QTR',
  month: 'MO',
  week: 'WK',
  day: 'DAY',
};

function computeZoomWindow(
  currentDate: string,
  minDate: string,
  maxDate: string,
  zoomLevel: TimelineZoomLevel,
): { viewMin: string; viewMax: string } {
  if (zoomLevel === 'all') return { viewMin: minDate, viewMax: maxDate };

  const windowDays = ZOOM_DAYS[zoomLevel];
  const halfWindow = Math.floor(windowDays / 2);
  const currentMs = new Date(currentDate + 'T00:00:00Z').getTime();
  const minMs = new Date(minDate + 'T00:00:00Z').getTime();
  const maxMs = new Date(maxDate + 'T00:00:00Z').getTime();
  const dayMs = 86400000;

  let viewMinMs = currentMs - halfWindow * dayMs;
  let viewMaxMs = viewMinMs + windowDays * dayMs;

  // Clamp to full range
  if (viewMinMs < minMs) {
    viewMinMs = minMs;
    viewMaxMs = Math.min(minMs + windowDays * dayMs, maxMs);
  }
  if (viewMaxMs > maxMs) {
    viewMaxMs = maxMs;
    viewMinMs = Math.max(maxMs - windowDays * dayMs, minMs);
  }

  return {
    viewMin: new Date(viewMinMs).toISOString().split('T')[0],
    viewMax: new Date(viewMaxMs).toISOString().split('T')[0],
  };
}

function availableZoomLevels(totalDays: number): TimelineZoomLevel[] {
  if (totalDays <= 1) return [];
  const levels: TimelineZoomLevel[] = ['all'];
  if (totalDays > 365) levels.push('year');
  if (totalDays > 90) levels.push('quarter');
  if (totalDays > 30) levels.push('month');
  if (totalDays > 7) levels.push('week');
  if (totalDays > 1) levels.push('day');
  return levels;
}

function shiftPeriod(
  currentDate: string,
  minDate: string,
  maxDate: string,
  zoomLevel: TimelineZoomLevel,
  direction: 1 | -1,
): string {
  if (zoomLevel === 'all') return currentDate;
  const shiftDays = ZOOM_DAYS[zoomLevel];
  const currentMs = new Date(currentDate + 'T00:00:00Z').getTime();
  const minMs = new Date(minDate + 'T00:00:00Z').getTime();
  const maxMs = new Date(maxDate + 'T00:00:00Z').getTime();
  const newMs = Math.max(minMs, Math.min(maxMs, currentMs + direction * shiftDays * 86400000));
  return new Date(newMs).toISOString().split('T')[0];
}

export interface StatsData {
  locations: number;
  vectors: number;
  sats?: number;
  fov?: number;
  flights?: number;
  flightStatus?: string;
  quakes?: number;
  wx?: number;
  nfz?: number;
  ships?: number;
  shipNoKey?: boolean;
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
  zoomLevel?: TimelineZoomLevel;
  onZoomChange?: (level: TimelineZoomLevel) => void;
  isHistorical?: boolean;
  clocks?: { label: string; offsetHours: number }[];
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
  { label: '2x',   value: 2 },
  { label: '5x',   value: 5 },
  { label: '10x',  value: 10 },
  { label: '30x',  value: 30 },
  { label: '1m',   value: 60 },
  { label: '5m',   value: 300 },
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
    (new Date(date + 'T00:00:00Z').getTime() - new Date(minDate + 'T00:00:00Z').getTime()) / 86400000,
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
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
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
  zoomLevel = 'all',
  onZoomChange,
  isHistorical = false,
  clocks,
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

  // Zoom window
  const zoomLevels = useMemo(() => availableZoomLevels(totalDays), [totalDays]);
  const showZoom = zoomLevels.length > 1;
  const { viewMin, viewMax } = useMemo(
    () => computeZoomWindow(currentDate, minDate, maxDate, zoomLevel),
    [currentDate, minDate, maxDate, zoomLevel],
  );
  const viewTotalDays = dateToDay(viewMax, viewMin);
  const viewCurrentDay = dateToDay(currentDate, viewMin);
  // Clamp to visible range
  const clampedViewDay = Math.max(0, Math.min(viewTotalDays, viewCurrentDay));

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

  // Event ticks positioned by date — scoped to zoom window
  const ticks = useMemo(() => {
    const seen = new Set<string>();
    return events
      .filter(ev => {
        const key = `${ev.resolvedDate}-${ev.type}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return ev.resolvedDate >= viewMin && ev.resolvedDate <= viewMax;
      })
      .map(ev => ({
        date: ev.resolvedDate,
        type: ev.type,
        title: ev.title,
        pct: viewTotalDays > 0 ? (dateToDay(ev.resolvedDate, viewMin) / viewTotalDays) * 100 : 0,
      }));
  }, [events, viewMin, viewMax, viewTotalDays]);

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

        {/* LIVE button — only for live trackers */}
        {!isHistorical && (
          <button
            className={`globe-tl-live ${mode === 'live' ? 'active' : ''}`}
            onClick={onGoLive}
          >
            <span className="globe-tl-live-dot" />
            LIVE
          </button>
        )}

        {/* Current date */}
        <span className="globe-tl-current-date">
          {formatDate(currentDate)}
          {currentEventCount > 0 && (
            <span className="globe-tl-event-badge">{currentEventCount}</span>
          )}
        </span>

        {/* Clocks — sim-time UTC for historical, configurable zones for live */}
        <div className="globe-tl-clocks">
          {isHistorical ? (
            <span className="globe-tl-clock"><span className="globe-tl-clock-label">SIM</span> {formatTZ(simMs, 0)}</span>
          ) : (
            (clocks || [{ label: 'UTC', offsetHours: 0 }]).map(c => (
              <span key={c.label} className="globe-tl-clock">
                <span className="globe-tl-clock-label">{c.label}</span> {formatTZ(simMs, c.offsetHours)}
              </span>
            ))
          )}
        </div>
      </div>

      {/* Zoom controls row */}
      {showZoom && (
        <div className="globe-tl-zoom-controls">
          <button
            className="globe-tl-btn globe-tl-zoom-shift"
            disabled={zoomLevel === 'all'}
            onClick={() => onDateChange(shiftPeriod(currentDate, minDate, maxDate, zoomLevel, -1))}
            title="Previous period"
          >
            &laquo;
          </button>
          {zoomLevels.map(level => (
            <button
              key={level}
              className={`globe-tl-zoom-btn ${zoomLevel === level ? 'active' : ''}`}
              onClick={() => onZoomChange?.(level)}
            >
              {ZOOM_LABELS[level]}
            </button>
          ))}
          <button
            className="globe-tl-btn globe-tl-zoom-shift"
            disabled={zoomLevel === 'all'}
            onClick={() => onDateChange(shiftPeriod(currentDate, minDate, maxDate, zoomLevel, 1))}
            title="Next period"
          >
            &raquo;
          </button>
          {/* Minimap — only when zoomed */}
          {zoomLevel !== 'all' && totalDays > 0 && (
            <div className="globe-tl-minimap">
              <div
                className="globe-tl-minimap-viewport"
                style={{
                  left: `${(dateToDay(viewMin, minDate) / totalDays) * 100}%`,
                  width: `${Math.max(2, (viewTotalDays / totalDays) * 100)}%`,
                }}
              />
              <div
                className="globe-tl-minimap-cursor"
                style={{
                  left: `${(dateToDay(currentDate, minDate) / totalDays) * 100}%`,
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* Timeline track with event ticks — or intra-day slider at DAY zoom */}
      {zoomLevel === 'day' ? (
        <div className="globe-tl-intraday">
          <span className="globe-tl-intraday-label">
            {formatHHMM(currentMinute)} UTC
          </span>
          <div className="globe-tl-intraday-track">
            {/* Hour markers */}
            {[0, 3, 6, 9, 12, 15, 18, 21].map(h => (
              <span
                key={h}
                className="globe-tl-intraday-hour"
                style={{ left: `${(h / 24) * 100}%` }}
              >
                {h.toString().padStart(2, '0')}
              </span>
            ))}
            {/* Intra-day event ticks */}
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
                const dayStart = new Date(currentDate + 'T00:00:00Z').getTime();
                onTimeChange(dayStart + min * 60000);
              }}
            />
          </div>
          <span className="globe-tl-intraday-label">24:00</span>
        </div>
      ) : (
        <div className="globe-tl-track-container">
          <span className="globe-tl-date-edge">{formatDate(viewMin)}</span>
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
              max={viewTotalDays}
              value={clampedViewDay}
              aria-label="Timeline date selector"
              aria-valuetext={formatDate(currentDate)}
              onChange={e => onDateChange(dayToDate(Number(e.target.value), viewMin))}
            />
          </div>
          <span className="globe-tl-date-edge">{formatDate(viewMax)}</span>
        </div>
      )}

      {/* Intra-day timeline — shows below date slider when current day has timed events (non-DAY zoom) */}
      {zoomLevel !== 'day' && hasIntradayEvents && (
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
          {stats.flights != null ? (
            <>
              <span className="globe-tl-stats-sep">&middot;</span>
              <span style={{ color: '#00aaff' }}>{stats.flights} flights</span>
            </>
          ) : stats.flightStatus === 'rate-limited' ? (
            <>
              <span className="globe-tl-stats-sep">&middot;</span>
              <span style={{ color: '#666', fontSize: '0.45rem' }}>flights: retrying...</span>
            </>
          ) : stats.flightStatus === 'loading' ? (
            <>
              <span className="globe-tl-stats-sep">&middot;</span>
              <span style={{ color: '#666', fontSize: '0.45rem' }}>flights: loading...</span>
            </>
          ) : null}
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
          {stats.ships != null ? (
            <>
              <span className="globe-tl-stats-sep">&middot;</span>
              <span style={{ color: '#00ddaa' }}>{stats.ships} ships</span>
            </>
          ) : stats.shipNoKey ? (
            <>
              <span className="globe-tl-stats-sep">&middot;</span>
              <span style={{ color: '#666', fontSize: '0.45rem' }}>ships: need AIS key</span>
            </>
          ) : null}
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
