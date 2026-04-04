import { useEffect, useRef, type MutableRefObject } from 'react';
import type { TelemetryState } from './mission-helpers';
import { formatMET } from './mission-helpers';

interface Props {
  telemetryRef: MutableRefObject<TelemetryState>;
  vehicle: string;
  onTrackSpacecraft?: () => void;
}

const panelStyle: React.CSSProperties = {
  background: 'rgba(0,0,0,0.75)',
  border: '1px solid #333',
  borderRadius: 6,
  padding: '8px 14px',
  fontFamily: "'JetBrains Mono', monospace",
};

export default function MissionIdentity({ telemetryRef, vehicle, onTrackSpacecraft }: Props) {
  const rafRef = useRef<number>(0);
  const phaseRef = useRef<HTMLDivElement>(null);
  const metRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tick = () => {
      const t = telemetryRef.current;
      if (phaseRef.current) phaseRef.current.textContent = t.currentPhase?.label ?? 'Pre-Launch';
      if (metRef.current) metRef.current.textContent = `MET ${formatMET(t.metSeconds)}`;
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [telemetryRef]);

  return (
    <div style={panelStyle}>
      <div style={{ color: '#4ade80', fontWeight: 'bold', fontSize: 15 }}>{vehicle}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80' }} />
        <div ref={phaseRef} style={{ color: '#ccc', fontSize: 12 }}>Pre-Launch</div>
      </div>
      <div ref={metRef} style={{ color: '#888', fontSize: 11, marginTop: 4 }}>MET 00:00:00:00</div>
      {onTrackSpacecraft && (
        <button
          onClick={onTrackSpacecraft}
          style={{
            marginTop: 6, padding: '4px 10px', fontSize: 10,
            background: 'rgba(74, 222, 128, 0.15)', border: '1px solid #4ade80',
            borderRadius: 4, color: '#4ade80', cursor: 'pointer',
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          TRACK ORION
        </button>
      )}
    </div>
  );
}
