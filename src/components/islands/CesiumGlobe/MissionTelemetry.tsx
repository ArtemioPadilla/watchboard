import { useEffect, useRef, type MutableRefObject } from 'react';
import type { TelemetryState } from './mission-helpers';
import { formatDistance, formatVelocity } from './mission-helpers';

interface Props {
  telemetryRef: MutableRefObject<TelemetryState>;
}

const panelStyle: React.CSSProperties = {
  background: 'rgba(0,0,0,0.75)',
  border: '1px solid #333',
  borderRadius: 6,
  padding: '8px 14px',
  fontFamily: "'JetBrains Mono', monospace",
  textAlign: 'right',
};

export default function MissionTelemetry({ telemetryRef }: Props) {
  const rafRef = useRef<number>(0);
  const altRef = useRef<HTMLDivElement>(null);
  const velRef = useRef<HTMLDivElement>(null);
  const moonDistRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tick = () => {
      const t = telemetryRef.current;
      if (altRef.current) altRef.current.textContent = formatDistance(t.altitudeKm);
      if (velRef.current) velRef.current.textContent = formatVelocity(t.velocityKmS);
      if (moonDistRef.current) moonDistRef.current.textContent = formatDistance(t.distToMoonKm);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [telemetryRef]);

  return (
    <div style={panelStyle}>
      <div style={{ fontSize: 10, color: '#60a5fa', textTransform: 'uppercase' }}>Altitude</div>
      <div ref={altRef} style={{ fontSize: 16, color: '#fff', marginBottom: 4 }}>0 km</div>
      <div style={{ fontSize: 10, color: '#f59e0b', textTransform: 'uppercase' }}>Velocity</div>
      <div ref={velRef} style={{ fontSize: 16, color: '#fff', marginBottom: 4 }}>0 m/s</div>
      <div style={{ fontSize: 10, color: '#a78bfa', textTransform: 'uppercase' }}>Distance to Moon</div>
      <div ref={moonDistRef} style={{ fontSize: 16, color: '#fff' }}>0 km</div>
    </div>
  );
}
