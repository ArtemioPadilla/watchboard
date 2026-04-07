import { useMemo, useState, useEffect } from 'react';
import type { FlatEvent } from '../../lib/timeline-utils';
import type { MapLine } from '../../lib/schemas';
import MissionTimelineHeader from './CesiumGlobe/MissionTimelineHeader';
import {
  type TimelineZoomLevel,
  type StatsData,
  ZOOM_LABELS,
  computeZoomWindow,
  availableZoomLevels,
  shiftPeriod,
  dateToDay,
  dayToDate,
  formatDate,
  formatTZ,
  formatHHMM,
  prevEventDate,
  nextEventDate,
  EVENT_TYPE_COLORS,
  LINE_CAT_COLORS,
  SPEEDS_2D,
  SPEEDS_3D,
} from '../../lib/timeline-bar-utils';

// ── Re-exports for downstream consumers ──

export type { TimelineZoomLevel, StatsData } from '../../lib/timeline-bar-utils';

// ── Props (discriminated union on context) ──

interface BaseProps {
  minDate: string;
  maxDate: string;
  currentDate: string;
  isPlaying: boolean;
  playbackSpeed: number;
  events: FlatEvent[];
  lines?: MapLine[];
  onDateChange: (date: string) => void;
  onTogglePlay: () => void;
  onSpeedChange: (speed: number) => void;
  onGoLive: () => void;
  persistLines?: boolean;
  onTogglePersist?: () => void;
  isHistorical?: boolean;
  clocks?: { label: string; offsetHours: number }[];
  stats?: StatsData;
  speeds?: { label: string; value: number }[];
  zoomLevel?: TimelineZoomLevel;
  onZoomChange?: (level: TimelineZoomLevel) => void;
  legendItems?: { label: string; color: string }[];
  missionTrajectory?: { vehicle: string; phases: { label: string; startTime: string; endTime: string }[]; launchTime: string } | null;
  telemetryRef?: React.MutableRefObject<any>;
  showMissionHeader?: boolean;
}

interface MapContext extends BaseProps {
  context: '2d';
}

interface GlobeContext extends BaseProps {
  context: '3d';
  simTimeRef: React.RefObject<number>;
  onTimeChange?: (ms: number) => void;
}

type Props = MapContext | GlobeContext;

// ── Default legend items (from CesiumTimelineBar) ──

const DEFAULT_LEGEND: { label: string; color: string }[] = [
  { label: 'Kinetic', color: '#e74c3c' },
  { label: 'Retaliation', color: '#f39c12' },
  { label: 'Civilian Impact', color: '#ffaa00' },
  { label: 'Maritime', color: '#00aaff' },
  { label: 'Infrastructure', color: '#ff6644' },
  { label: 'Escalation', color: '#ff44ff' },
  { label: 'Airspace Closure', color: '#e74c3c' },
];

// ── Component ──

export default function UnifiedTimelineBar(props: Props) {
  const {
    minDate,
    maxDate,
    currentDate,
    isPlaying,
    playbackSpeed,
    events,
    lines = [],
    onDateChange,
    onTogglePlay,
    onSpeedChange,
    onGoLive,
    persistLines,
    onTogglePersist,
    isHistorical = false,
    clocks,
    stats,
    speeds,
    legendItems,
    context,
  } = props;

  const [showSpeeds, setShowSpeeds] = useState(false);
  const [clockTick, setClockTick] = useState(0);

  // Internal zoom state — used only when parent does not control zoom
  const [internalZoom, setInternalZoom] = useState<TimelineZoomLevel>('all');
  const zoomLevel = props.zoomLevel ?? internalZoom;
  const onZoomChange = props.onZoomChange ?? setInternalZoom;

  // Tick clocks every second for live time displays
  useEffect(() => {
    const id = setInterval(() => setClockTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Compute simulation time in milliseconds
  const simMs = useMemo(() => {
    // clockTick forces re-evaluation each second
    void clockTick;
    if (context === '3d') {
      return (props as GlobeContext).simTimeRef.current ?? Date.now();
    }
    if (isHistorical) {
      return new Date(currentDate + 'T00:00:00Z').getTime();
    }
    return Date.now();
  }, [context, isHistorical, currentDate, clockTick, props]);

  const onTimeChange = context === '3d' ? (props as GlobeContext).onTimeChange : undefined;

  // Speed options: prop override, else context-appropriate defaults
  const speedOptions = speeds ?? (context === '2d' ? SPEEDS_2D : SPEEDS_3D);
  const currentSpeedLabel = speedOptions.find(s => s.value === playbackSpeed)?.label ?? speedOptions[0].label;

  const totalDays = dateToDay(maxDate, minDate);

  // Zoom window computation
  const zoomLevels = useMemo(() => availableZoomLevels(totalDays), [totalDays]);
  const showZoom = zoomLevels.length > 1;
  const { viewMin, viewMax } = useMemo(
    () => computeZoomWindow(currentDate, minDate, maxDate, zoomLevel),
    [currentDate, minDate, maxDate, zoomLevel],
  );
  const viewTotalDays = dateToDay(viewMax, viewMin);
  const viewCurrentDay = dateToDay(currentDate, viewMin);
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

  // Count events for current date (badge)
  const currentEventCount = useMemo(
    () => events.filter(ev => ev.resolvedDate === currentDate).length,
    [events, currentDate],
  );

  const isLive = currentDate === maxDate;

  // Hour markers for intra-day — more granular at DAY zoom
  const intradayHours = zoomLevel === 'day'
    ? [0, 3, 6, 9, 12, 15, 18, 21]
    : [0, 6, 12, 18];

  // Intra-day time change handler
  const handleIntradayChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!onTimeChange) return;
    const min = Number(e.target.value);
    const dayStart = new Date(currentDate + 'T00:00:00Z').getTime();
    onTimeChange(dayStart + min * 60000);
  };

  // Shared intra-day row renderer
  const renderIntradayRow = () => (
    <div className="utl-intraday">
      <span className="utl-intraday-label">
        {formatHHMM(currentMinute)} UTC
      </span>
      <div className="utl-intraday-track">
        {intradayHours.map(h => (
          <span
            key={h}
            className="utl-intraday-hour"
            style={{ left: `${(h / 24) * 100}%` }}
          >
            {h.toString().padStart(2, '0')}
          </span>
        ))}
        {intradayTicks.map((t, i) => (
          <div
            key={i}
            className="utl-intraday-tick"
            style={{
              left: `${(t.minute / 1440) * 100}%`,
              backgroundColor: t.color,
            }}
            title={t.label}
          />
        ))}
        <input
          type="range"
          className="utl-slider utl-intraday-slider"
          min={0}
          max={1440}
          value={currentMinute}
          aria-label="Intra-day time selector"
          aria-valuetext={formatHHMM(currentMinute)}
          onChange={handleIntradayChange}
        />
      </div>
      <span className="utl-intraday-label">24:00</span>
    </div>
  );

  const legend = legendItems ?? DEFAULT_LEGEND;

  return (
    <div className="utl-bar" data-context={context}>
      {props.showMissionHeader && props.missionTrajectory && props.telemetryRef && (
        <MissionTimelineHeader
          telemetryRef={props.telemetryRef}
          vehicle={props.missionTrajectory.vehicle}
          phases={props.missionTrajectory.phases}
        />
      )}
      {/* ── Row 1: Controls ── */}
      <div className="utl-controls">
        {/* Prev event */}
        <button
          className="utl-btn"
          onClick={() => onDateChange(prevEventDate(currentDate, eventDates))}
          disabled={prevEventDate(currentDate, eventDates) === currentDate}
          aria-label="Previous event"
          title="Previous event date"
        >
          &#9664;
        </button>

        {/* Play/Pause */}
        <button
          className="utl-btn utl-play"
          onClick={onTogglePlay}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? '\u275A\u275A' : '\u25B6'}
        </button>

        {/* Next event */}
        <button
          className="utl-btn"
          onClick={() => onDateChange(nextEventDate(currentDate, eventDates))}
          disabled={nextEventDate(currentDate, eventDates) === currentDate}
          aria-label="Next event"
          title="Next event date"
        >
          &#9654;
        </button>

        {/* Speed selector — gear popup */}
        <div className="utl-settings">
          <button
            className="utl-btn utl-gear"
            onClick={() => setShowSpeeds(prev => !prev)}
            title="Playback speed"
          >
            &#9881; <span className="utl-speed-badge">{currentSpeedLabel}</span>
          </button>
          {showSpeeds && (
            <div className="utl-speed-popup">
              {speedOptions.map(s => (
                <button
                  key={s.value}
                  className={`utl-speed-btn${playbackSpeed === s.value ? ' active' : ''}`}
                  onClick={() => { onSpeedChange(s.value); setShowSpeeds(false); }}
                  title={`${s.label} per second`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Persist toggle (from 2D TimelineSlider) */}
        {onTogglePersist != null && (
          <button
            className={`utl-persist${persistLines ? ' active' : ''}`}
            onClick={onTogglePersist}
            title={persistLines ? 'Showing all lines up to date' : 'Showing only current day'}
          >
            {persistLines ? 'ALL' : 'DAY'}
          </button>
        )}

        {/* LIVE button — only for non-historical trackers */}
        {!isHistorical && (
          <button
            className={`utl-live${isLive ? ' active' : ''}`}
            onClick={onGoLive}
          >
            <span className="utl-live-dot" />
            LIVE
          </button>
        )}

        {/* Current date + event count badge */}
        <span className="utl-current-date">
          {formatDate(currentDate)}
          {currentEventCount > 0 && (
            <span className="utl-event-badge">{currentEventCount}</span>
          )}
        </span>

        {/* Clocks */}
        <div className="utl-clocks">
          {isHistorical ? (
            <span className="utl-clock">
              <span className="utl-clock-label">SIM</span> {formatTZ(simMs, 0)}
            </span>
          ) : (
            (clocks ?? [{ label: 'UTC', offsetHours: 0 }]).map(c => (
              <span key={c.label} className="utl-clock">
                <span className="utl-clock-label">{c.label}</span> {formatTZ(simMs, c.offsetHours)}
              </span>
            ))
          )}
        </div>
      </div>

      {/* ── Row 2: Zoom controls + Day slider (when not at DAY zoom) ── */}
      {showZoom && (
        <div className="utl-zoom-controls">
          <button
            className="utl-btn utl-zoom-shift"
            disabled={zoomLevel === 'all'}
            onClick={() => onDateChange(shiftPeriod(currentDate, minDate, maxDate, zoomLevel, -1))}
            title="Previous period"
          >
            &laquo;
          </button>
          {zoomLevels.map(level => (
            <button
              key={level}
              className={`utl-zoom-btn${zoomLevel === level ? ' active' : ''}`}
              onClick={() => onZoomChange(level)}
            >
              {ZOOM_LABELS[level]}
            </button>
          ))}
          <button
            className="utl-btn utl-zoom-shift"
            disabled={zoomLevel === 'all'}
            onClick={() => onDateChange(shiftPeriod(currentDate, minDate, maxDate, zoomLevel, 1))}
            title="Next period"
          >
            &raquo;
          </button>

          {/* Minimap — only when zoomed in */}
          {zoomLevel !== 'all' && totalDays > 0 && (
            <div className="utl-minimap">
              <div
                className="utl-minimap-viewport"
                style={{
                  left: `${(dateToDay(viewMin, minDate) / totalDays) * 100}%`,
                  width: `${Math.max(2, (viewTotalDays / totalDays) * 100)}%`,
                }}
              />
              <div
                className="utl-minimap-cursor"
                style={{
                  left: `${(dateToDay(currentDate, minDate) / totalDays) * 100}%`,
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* ── Row 2b/3: Day slider track + Intra-day row ──
          At DAY zoom: only the intra-day row replaces the day slider.
          At other zooms: day slider is shown, THEN intra-day row is ALWAYS shown below it.
      */}
      {zoomLevel === 'day' ? (
        renderIntradayRow()
      ) : (
        <>
          {/* Day-level slider with event ticks */}
          <div className="utl-track-container">
            <span className="utl-date-edge">{formatDate(viewMin)}</span>
            <div className="utl-track">
              {ticks.map((tick, i) => (
                <div
                  key={i}
                  className="utl-tick"
                  style={{
                    left: `${tick.pct}%`,
                    backgroundColor: EVENT_TYPE_COLORS[tick.type] || '#888',
                  }}
                  title={`${tick.title} (${tick.date})`}
                />
              ))}
              <input
                type="range"
                className="utl-slider"
                min={0}
                max={viewTotalDays}
                value={clampedViewDay}
                aria-label="Timeline date selector"
                aria-valuetext={formatDate(currentDate)}
                onChange={e => onDateChange(dayToDate(Number(e.target.value), viewMin))}
              />
            </div>
            <span className="utl-date-edge">{formatDate(viewMax)}</span>
          </div>

          {/* Intra-day row — ALWAYS visible regardless of timed events */}
          {renderIntradayRow()}
        </>
      )}

      {/* ── Row 4: Stats ── */}
      {stats && (
        <div className="utl-stats">
          <span>{stats.locations} locations</span>
          <span className="utl-stats-sep">&middot;</span>
          <span>{stats.vectors} vectors</span>
          {stats.sats != null && (
            <>
              <span className="utl-stats-sep">&middot;</span>
              <span style={{ color: '#00ff88' }}>{stats.sats} sats</span>
            </>
          )}
          {stats.fov != null && (
            <>
              <span className="utl-stats-sep">&middot;</span>
              <span style={{ color: '#ff8844' }}>{stats.fov} FOV</span>
            </>
          )}
          {stats.flights != null ? (
            <>
              <span className="utl-stats-sep">&middot;</span>
              <span style={{ color: '#00aaff' }}>{stats.flights} flights</span>
            </>
          ) : stats.flightStatus === 'rate-limited' ? (
            <>
              <span className="utl-stats-sep">&middot;</span>
              <span style={{ color: '#666', fontSize: '0.45rem' }}>flights: retrying...</span>
            </>
          ) : stats.flightStatus === 'loading' ? (
            <>
              <span className="utl-stats-sep">&middot;</span>
              <span style={{ color: '#666', fontSize: '0.45rem' }}>flights: loading...</span>
            </>
          ) : null}
          {stats.quakes != null && (
            <>
              <span className="utl-stats-sep">&middot;</span>
              <span style={{ color: '#ff6644' }}>{stats.quakes} quakes</span>
            </>
          )}
          {stats.wx != null && (
            <>
              <span className="utl-stats-sep">&middot;</span>
              <span style={{ color: '#88ccff' }}>{stats.wx} wx</span>
            </>
          )}
          {stats.nfz != null && (
            <>
              <span className="utl-stats-sep">&middot;</span>
              <span style={{ color: '#e74c3c' }}>{stats.nfz} NFZ</span>
            </>
          )}
          {stats.ships != null ? (
            <>
              <span className="utl-stats-sep">&middot;</span>
              <span style={{ color: '#00ddaa' }}>{stats.ships} ships</span>
            </>
          ) : stats.shipNoKey ? (
            <>
              <span className="utl-stats-sep">&middot;</span>
              <span style={{ color: '#666', fontSize: '0.45rem' }}>ships: need AIS key</span>
            </>
          ) : null}
          {stats.gpsJam != null && (
            <>
              <span className="utl-stats-sep">&middot;</span>
              <span style={{ color: '#ff2244' }}>{stats.gpsJam} GPS JAM</span>
            </>
          )}
          {stats.internetBlackout != null && (
            <>
              <span className="utl-stats-sep">&middot;</span>
              <span style={{ color: '#ff6644' }}>{stats.internetBlackout} BLACKOUT</span>
            </>
          )}
          {stats.groundTruth != null && (
            <>
              <span className="utl-stats-sep">&middot;</span>
              <span style={{ color: '#ffaa00' }}>{stats.groundTruth} GT</span>
            </>
          )}
          {stats.historical && (
            <>
              <span className="utl-stats-sep">&middot;</span>
              <span style={{ color: '#9498a8' }}>HISTORICAL</span>
            </>
          )}
        </div>
      )}

      {/* ── Row 4b: Legend ── */}
      <div className="utl-legend">
        {legend.map(item => (
          <span key={item.label} className="utl-legend-item" style={{ color: item.color }}>
            &#9679; {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}
