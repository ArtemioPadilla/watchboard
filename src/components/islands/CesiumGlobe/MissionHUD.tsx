import { useEffect, useRef, type MutableRefObject } from 'react';
import type { TelemetryState } from './mission-helpers';
import { formatMET, formatDistance, formatVelocity } from './mission-helpers';
import type { MissionPhase } from '../../../lib/schemas';

interface Props {
  telemetryRef: MutableRefObject<TelemetryState>;
  vehicle: string;
  phases: MissionPhase[];
}

export default function MissionHUD({ telemetryRef, vehicle, phases }: Props) {
  const rafRef = useRef<number>(0);
  const phaseRef = useRef<HTMLDivElement>(null);
  const metRef = useRef<HTMLDivElement>(null);
  const altRef = useRef<HTMLDivElement>(null);
  const velRef = useRef<HTMLDivElement>(null);
  const moonDistRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tick = () => {
      const t = telemetryRef.current;
      if (phaseRef.current) phaseRef.current.textContent = t.currentPhase?.label ?? 'Pre-Launch';
      if (metRef.current) metRef.current.textContent = `MET ${formatMET(t.metSeconds)}`;
      if (altRef.current) altRef.current.textContent = formatDistance(t.altitudeKm);
      if (velRef.current) velRef.current.textContent = formatVelocity(t.velocityKmS);
      if (moonDistRef.current) moonDistRef.current.textContent = formatDistance(t.distToMoonKm);
      if (progressRef.current) progressRef.current.style.width = `${(t.overallProgress * 100).toFixed(1)}%`;
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [telemetryRef]);

  const totalDuration = phases.reduce((sum, p) => {
    return sum + (new Date(p.end).getTime() - new Date(p.start).getTime());
  }, 0);

  const panelStyle: React.CSSProperties = {
    background: 'rgba(0,0,0,0.75)',
    border: '1px solid #333',
    borderRadius: 6,
    padding: '8px 14px',
    fontFamily: "'JetBrains Mono', monospace",
  };

  return (
    <div style={{ pointerEvents: 'none' }}>
      {/* Top-left: Mission identity */}
      <div style={{ ...panelStyle, position: 'absolute', top: 12, left: 12, zIndex: 100 }}>
        <div style={{ color: '#4ade80', fontWeight: 'bold', fontSize: 15 }}>{vehicle}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80' }} />
          <div ref={phaseRef} style={{ color: '#ccc', fontSize: 12 }}>Pre-Launch</div>
        </div>
        <div ref={metRef} style={{ color: '#888', fontSize: 11, marginTop: 4 }}>MET 00:00:00:00</div>
      </div>

      {/* Top-right: Telemetry */}
      <div style={{ ...panelStyle, position: 'absolute', top: 12, right: 12, zIndex: 100, textAlign: 'right' }}>
        <div style={{ fontSize: 10, color: '#60a5fa', textTransform: 'uppercase' }}>Altitude</div>
        <div ref={altRef} style={{ fontSize: 16, color: '#fff', marginBottom: 4 }}>0 km</div>
        <div style={{ fontSize: 10, color: '#f59e0b', textTransform: 'uppercase' }}>Velocity</div>
        <div ref={velRef} style={{ fontSize: 16, color: '#fff', marginBottom: 4 }}>0 m/s</div>
        <div style={{ fontSize: 10, color: '#a78bfa', textTransform: 'uppercase' }}>Distance to Moon</div>
        <div ref={moonDistRef} style={{ fontSize: 16, color: '#fff' }}>0 km</div>
      </div>

      {/* Bottom: Phase timeline */}
      <div style={{ ...panelStyle, position: 'absolute', bottom: 12, left: 12, right: 12, zIndex: 100 }}>
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
    </div>
  );
}
