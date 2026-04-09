import { useEffect, useRef, type MutableRefObject } from 'react';
import { Cartesian3 } from 'cesium';
import type { TelemetryState } from './mission-helpers';
import { formatDistance, formatVelocity } from './mission-helpers';
import type { VectorSet } from './mission-vectors';
import type { VectorToggles } from './useMissionVectors';

interface Props {
  telemetryRef: MutableRefObject<TelemetryState>;
  vectorsRef?: MutableRefObject<VectorSet | null>;
  vectorToggles?: VectorToggles;
}

const panelStyle: React.CSSProperties = {
  background: 'rgba(0,0,0,0.75)',
  border: '1px solid #333',
  borderRadius: 6,
  padding: '8px 14px',
  fontFamily: "'JetBrains Mono', monospace",
  textAlign: 'right',
};

function formatAccel(ms2: number): string {
  if (ms2 < 0.0001) return '0 m/s²';
  if (ms2 < 0.01) return ms2.toFixed(4) + ' m/s²';
  if (ms2 < 1) return ms2.toFixed(3) + ' m/s²';
  return ms2.toFixed(2) + ' m/s²';
}

export default function MissionTelemetry({ telemetryRef, vectorsRef, vectorToggles }: Props) {
  const rafRef = useRef<number>(0);
  const altRef = useRef<HTMLDivElement>(null);
  const velRef = useRef<HTMLDivElement>(null);
  const moonDistRef = useRef<HTMLDivElement>(null);
  const gEarthRef = useRef<HTMLDivElement>(null);
  const gMoonRef = useRef<HTMLDivElement>(null);
  const thrustRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tick = () => {
      const t = telemetryRef.current;
      if (altRef.current) altRef.current.textContent = formatDistance(t.altitudeKm);
      if (velRef.current) velRef.current.textContent = formatVelocity(t.velocityKmS);
      if (moonDistRef.current) moonDistRef.current.textContent = formatDistance(t.distToMoonKm);

      // Vector magnitudes
      const v = vectorsRef?.current;
      if (v) {
        if (gEarthRef.current) gEarthRef.current.textContent = formatAccel(Cartesian3.magnitude(v.gravityEarth));
        if (gMoonRef.current) gMoonRef.current.textContent = formatAccel(Cartesian3.magnitude(v.gravityMoon));
        if (thrustRef.current) thrustRef.current.textContent = formatAccel(Cartesian3.magnitude(v.thrust));
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [telemetryRef, vectorsRef]);

  const anyVectors = vectorToggles && (vectorToggles.gravityEarth || vectorToggles.gravityMoon || vectorToggles.thrust);

  return (
    <div style={panelStyle}>
      <div style={{ fontSize: 10, color: '#60a5fa', textTransform: 'uppercase' }}>Altitude</div>
      <div ref={altRef} style={{ fontSize: 16, color: '#fff', marginBottom: 4 }}>0 km</div>
      <div style={{ fontSize: 10, color: '#00ffaa', textTransform: 'uppercase' }}>Velocity</div>
      <div ref={velRef} style={{ fontSize: 16, color: '#fff', marginBottom: 4 }}>0 m/s</div>
      <div style={{ fontSize: 10, color: '#a78bfa', textTransform: 'uppercase' }}>Distance to Moon</div>
      <div ref={moonDistRef} style={{ fontSize: 16, color: '#fff' }}>0 km</div>

      {anyVectors && (
        <>
          <div style={{ borderTop: '1px solid #333', margin: '6px 0' }} />
          {vectorToggles.gravityEarth && (
            <>
              <div style={{ fontSize: 10, color: '#ff9500', textTransform: 'uppercase' }}>Earth Gravity</div>
              <div ref={gEarthRef} style={{ fontSize: 14, color: '#fff', marginBottom: 2 }}>0 m/s²</div>
            </>
          )}
          {vectorToggles.gravityMoon && (
            <>
              <div style={{ fontSize: 10, color: '#bf7fff', textTransform: 'uppercase' }}>Moon Gravity</div>
              <div ref={gMoonRef} style={{ fontSize: 14, color: '#fff', marginBottom: 2 }}>0 m/s²</div>
            </>
          )}
          {vectorToggles.thrust && (
            <>
              <div style={{ fontSize: 10, color: '#ff3333', textTransform: 'uppercase' }}>Thrust</div>
              <div ref={thrustRef} style={{ fontSize: 14, color: '#fff' }}>0 m/s²</div>
            </>
          )}
        </>
      )}
    </div>
  );
}
