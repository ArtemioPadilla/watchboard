import { useEffect, useRef, type MutableRefObject } from 'react';
import type { TelemetryState } from './mission-helpers';
import { formatDistance, formatVelocity } from './mission-helpers';
import type { MissionPhase } from '../../../lib/schemas';

interface Props {
  telemetryRef: MutableRefObject<TelemetryState>;
  vehicle: string;
  phases: MissionPhase[];
  onTrackSpacecraft?: () => void;
}

const panelStyle: React.CSSProperties = {
  background: 'rgba(0,0,0,0.75)',
  border: '1px solid #333',
  borderRadius: 6,
  padding: '8px 14px',
  fontFamily: "'JetBrains Mono', monospace",
};

export default function MissionPhaseBar({ telemetryRef, vehicle, phases, onTrackSpacecraft }: Props) {
  const rafRef = useRef<number>(0);
  const progressRef = useRef<HTMLDivElement>(null);
  const compactPhaseRef = useRef<HTMLSpanElement>(null);
  const compactAltRef = useRef<HTMLSpanElement>(null);
  const compactVelRef = useRef<HTMLSpanElement>(null);

  const totalDuration = phases.reduce((sum, p) => {
    return sum + (new Date(p.end).getTime() - new Date(p.start).getTime());
  }, 0);

  useEffect(() => {
    const tick = () => {
      const t = telemetryRef.current;
      if (progressRef.current) progressRef.current.style.width = `${(t.overallProgress * 100).toFixed(1)}%`;
      if (compactPhaseRef.current) compactPhaseRef.current.textContent = t.currentPhase?.label ?? 'Pre-Launch';
      if (compactAltRef.current) compactAltRef.current.textContent = formatDistance(t.altitudeKm);
      if (compactVelRef.current) compactVelRef.current.textContent = formatVelocity(t.velocityKmS);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [telemetryRef]);

  return (
    <>
      {/* Desktop: full phase timeline */}
      <div className="mission-phase-bar--desktop" style={panelStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 10 }}>
          {phases.map((phase) => {
            const phaseDur = new Date(phase.end).getTime() - new Date(phase.start).getTime();
            const widthPct = (phaseDur / totalDuration) * 100;
            return (
              <div key={phase.id} style={{
                width: `${widthPct}%`, textAlign: 'center', color: '#888',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {phase.label}
              </div>
            );
          })}
        </div>
        <div style={{ height: 4, background: '#222', borderRadius: 2 }}>
          <div ref={progressRef} style={{
            height: 4, borderRadius: 2, width: '0%',
            background: 'linear-gradient(90deg, #4ade80, #60a5fa, #f59e0b, #a78bfa)',
            transition: 'width 0.3s ease',
          }} />
        </div>
      </div>

      {/* Mobile: compact single-row strip */}
      <div className="mission-phase-bar--mobile" style={{
        ...panelStyle,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        fontSize: 11,
      }}>
        <span style={{ color: '#4ade80', fontWeight: 'bold' }}>{vehicle}</span>
        <span ref={compactPhaseRef} style={{ color: '#ccc' }}>Pre-Launch</span>
        <span style={{ color: '#555' }}>|</span>
        <span style={{ color: '#60a5fa', fontSize: 10 }}>ALT</span>
        <span ref={compactAltRef} style={{ color: '#fff' }}>0 km</span>
        <span style={{ color: '#555' }}>|</span>
        <span style={{ color: '#f59e0b', fontSize: 10 }}>VEL</span>
        <span ref={compactVelRef} style={{ color: '#fff' }}>0 m/s</span>
        {onTrackSpacecraft && (
          <button
            onClick={onTrackSpacecraft}
            style={{
              marginLeft: 'auto', padding: '2px 8px', fontSize: 9,
              background: 'rgba(74, 222, 128, 0.15)', border: '1px solid #4ade80',
              borderRadius: 4, color: '#4ade80', cursor: 'pointer',
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            TRACK
          </button>
        )}
      </div>
    </>
  );
}
