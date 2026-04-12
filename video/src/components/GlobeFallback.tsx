import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';

interface GlobeFallbackProps {
  center: { lat: number; lon: number };
  accentColor: string;
}

/**
 * CSS-only animated globe fallback for when Three.js fails in headless Chrome.
 * Dark circle with rotating grid lines and a pulsing dot.
 */
export const GlobeFallback: React.FC<GlobeFallbackProps> = ({
  center,
  accentColor,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const entrySpring = spring({
    frame,
    fps,
    config: { damping: 16, stiffness: 100, mass: 1 },
  });
  const scale = interpolate(entrySpring, [0, 1], [0.7, 1]);
  const opacity = interpolate(entrySpring, [0, 1], [0, 1]);

  // Rotation animation
  const rotation = interpolate(frame, [0, 150], [0, 25]);

  // Dot position (simple plate carree mapping onto circle)
  const dotX = 200 + (center.lon / 180) * 140;
  const dotY = 200 - (center.lat / 90) * 140;

  // Pulse
  const pulse = interpolate(Math.sin(frame * 0.15), [-1, 1], [6, 12]);
  const pulseOuter = interpolate(Math.sin(frame * 0.1), [-1, 1], [18, 30]);
  const ringOpacity = interpolate(Math.sin(frame * 0.1), [-1, 1], [0.15, 0.35]);
  const dotOpacity = interpolate(frame, [30, 45], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Generate grid lines
  const meridians = Array.from({ length: 12 }, (_, i) => i * 30);
  const parallels = [-60, -30, 0, 30, 60];

  return (
    <div
      style={{
        width: 400,
        height: 400,
        position: 'relative',
        opacity,
        transform: `scale(${scale})`,
      }}
    >
      {/* Atmosphere glow */}
      <div
        style={{
          position: 'absolute',
          inset: -20,
          borderRadius: '50%',
          background:
            'radial-gradient(circle, rgba(52,152,219,0.12) 45%, transparent 70%)',
        }}
      />

      <svg viewBox="0 0 400 400" width={400} height={400}>
        {/* Globe body */}
        <circle cx={200} cy={200} r={180} fill="#0d1117" />

        {/* Clip for grid */}
        <defs>
          <clipPath id="globe-clip">
            <circle cx={200} cy={200} r={178} />
          </clipPath>
        </defs>

        <g clipPath="url(#globe-clip)">
          {/* Meridians (vertical ellipses) */}
          {meridians.map((deg) => {
            const offset = Math.sin(((deg + rotation) * Math.PI) / 180) * 180;
            const scaleX = Math.abs(
              Math.cos(((deg + rotation) * Math.PI) / 180),
            );
            return (
              <ellipse
                key={`m-${deg}`}
                cx={200 + offset * 0.5}
                cy={200}
                rx={Math.max(1, 180 * scaleX * 0.3)}
                ry={178}
                fill="none"
                stroke="#1a2535"
                strokeWidth={0.8}
                opacity={0.5 * Math.max(0.2, scaleX)}
              />
            );
          })}

          {/* Parallels (horizontal lines, curved) */}
          {parallels.map((lat) => {
            const y = 200 - (lat / 90) * 170;
            const radiusAtLat = Math.sqrt(
              Math.max(0, 178 * 178 - (y - 200) * (y - 200)),
            );
            return (
              <ellipse
                key={`p-${lat}`}
                cx={200}
                cy={y}
                rx={radiusAtLat}
                ry={radiusAtLat * 0.15}
                fill="none"
                stroke="#1a2535"
                strokeWidth={0.8}
                opacity={0.5}
              />
            );
          })}
        </g>

        {/* Rim highlight */}
        <circle
          cx={200}
          cy={200}
          r={179}
          fill="none"
          stroke="#3498db"
          strokeWidth={1.5}
          opacity={0.2}
        />

        {/* Pulsing rings at location */}
        <circle
          cx={dotX}
          cy={dotY}
          r={pulseOuter}
          fill="none"
          stroke={accentColor}
          strokeWidth={1}
          opacity={ringOpacity * dotOpacity}
        />
        <circle
          cx={dotX}
          cy={dotY}
          r={pulse}
          fill="none"
          stroke={accentColor}
          strokeWidth={1.5}
          opacity={ringOpacity * 1.5 * dotOpacity}
        />

        {/* Dot glow */}
        <circle
          cx={dotX}
          cy={dotY}
          r={8}
          fill={accentColor}
          opacity={0.3 * dotOpacity}
        />
        <circle
          cx={dotX}
          cy={dotY}
          r={4}
          fill={accentColor}
          opacity={0.7 * dotOpacity}
        />
        <circle
          cx={dotX}
          cy={dotY}
          r={2}
          fill="#ffffff"
          opacity={0.9 * dotOpacity}
        />
      </svg>
    </div>
  );
};
