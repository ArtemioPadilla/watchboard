import { useRef, useEffect, type MutableRefObject } from 'react';
import type { TelemetryState } from './mission-helpers';

interface MissionPhase {
  label: string;
  startTime: string;
  endTime: string;
}

interface Props {
  telemetryRef: MutableRefObject<TelemetryState>;
  vehicle: string;
  phases: MissionPhase[];
}

export default function MissionTimelineHeader({ telemetryRef, vehicle, phases }: Props) {
  const progressRef = useRef<HTMLDivElement>(null);
  const phaseRef = useRef<HTMLSpanElement>(null);
  const altRef = useRef<HTMLSpanElement>(null);
  const velRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let raf: number;
    const update = () => {
      const t = telemetryRef.current;
      if (progressRef.current) {
        progressRef.current.style.width = `${(t.overallProgress ?? 0) * 100}%`;
      }
      if (phaseRef.current) phaseRef.current.textContent = t.currentPhase?.label ?? 'Pre-Launch';
      if (altRef.current) altRef.current.textContent = formatDistanceKm(t.altitudeKm ?? 0);
      if (velRef.current) velRef.current.textContent = formatVelocityKmS(t.velocityKmS ?? 0);
      raf = requestAnimationFrame(update);
    };
    raf = requestAnimationFrame(update);
    return () => cancelAnimationFrame(raf);
  }, [telemetryRef]);

  return (
    <div style={S.wrapper}>
      {/* Status row */}
      <div style={S.statusRow}>
        <span style={S.vehicle}>{vehicle}</span>
        <span style={S.phase} ref={phaseRef}>Pre-Launch</span>
        <span style={S.sep}>|</span>
        <span style={S.metricLabel}>ALT</span>
        <span style={S.metricValue} ref={altRef}>0 km</span>
        <span style={S.sep}>|</span>
        <span style={S.metricLabel}>VEL</span>
        <span style={S.metricValue} ref={velRef}>0 m/s</span>
      </div>
      {/* Phase progress */}
      <div style={S.phaseRow}>
        {phases.map((phase, i) => (
          <span key={i} style={S.phaseLabel}>
            {phase.label.length > 14 ? phase.label.slice(0, 12) + '\u2026' : phase.label}
          </span>
        ))}
      </div>
      <div style={S.progressTrack}>
        <div ref={progressRef} style={S.progressFill} />
      </div>
    </div>
  );
}

function formatDistanceKm(km: number): string {
  if (km >= 1000) return `${Math.round(km).toLocaleString()} km`;
  if (km >= 1) return `${km.toFixed(1)} km`;
  return `${Math.round(km * 1000)} m`;
}

function formatVelocityKmS(kmS: number): string {
  if (kmS >= 1) return `${kmS.toFixed(1)} km/s`;
  return `${Math.round(kmS * 1000)} m/s`;
}

const S: Record<string, React.CSSProperties> = {
  wrapper: {
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    padding: '6px 10px 4px',
  },
  statusRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.65rem',
    color: 'rgba(232,233,237,0.7)',
    marginBottom: '4px',
  },
  vehicle: {
    color: '#4ade80',
    fontWeight: 700,
  },
  phase: {
    color: 'rgba(232,233,237,0.9)',
  },
  sep: {
    color: 'rgba(255,255,255,0.15)',
  },
  metricLabel: {
    color: 'rgba(232,233,237,0.4)',
    fontSize: '0.55rem',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  metricValue: {
    color: 'rgba(232,233,237,0.9)',
  },
  phaseRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '0.55rem',
    color: 'rgba(232,233,237,0.4)',
    marginBottom: '2px',
  },
  phaseLabel: {},
  progressTrack: {
    height: '3px',
    background: 'rgba(255,255,255,0.06)',
    borderRadius: '2px',
    overflow: 'hidden',
    marginBottom: '2px',
  },
  progressFill: {
    height: '100%',
    width: '0%',
    background: 'linear-gradient(90deg, #4ade80, #58a6ff, #f59e0b, #a855f6)',
    borderRadius: '2px',
    transition: 'width 0.5s ease',
  },
};
