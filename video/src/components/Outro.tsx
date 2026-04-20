import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from 'remotion';

export const Outro: React.FC<{ theme?: 'dark' | 'day'; trackerCount?: number }> = ({ theme = 'dark', trackerCount = 64 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Main entry
  const entrySpring = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 100, mass: 0.9 },
  });
  const mainOpacity = interpolate(entrySpring, [0, 1], [0, 1]);
  const mainScale = interpolate(entrySpring, [0, 1], [0.9, 1]);

  // URL text (delay ~20)
  const urlSpring = spring({
    frame: Math.max(0, frame - 20),
    fps,
    config: { damping: 16, stiffness: 120, mass: 0.7 },
  });
  const urlOpacity = interpolate(urlSpring, [0, 1], [0, 1]);
  const urlScale = interpolate(urlSpring, [0, 1], [0.8, 1]);

  // Stats line (delay ~40)
  const statsSpring = spring({
    frame: Math.max(0, frame - 40),
    fps,
    config: { damping: 18, stiffness: 140, mass: 0.6 },
  });
  const statsOpacity = interpolate(statsSpring, [0, 1], [0, 1]);
  const statsY = interpolate(statsSpring, [0, 1], [15, 0]);

  // Fade to black at end
  const fadeOut = interpolate(frame, [120, 148], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Red accent line
  const lineWidth = interpolate(frame, [10, 45], [0, 320], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        opacity: mainOpacity * fadeOut,
        transform: `scale(${mainScale})`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 32,
      }}
    >
      {/* watchboard.dev */}
      <div
        style={{
          opacity: urlOpacity,
          transform: `scale(${urlScale})`,
          fontFamily: "'DM Sans', sans-serif",
          fontSize: 72,
          fontWeight: 700,
          color: '#e8e9ed',
          letterSpacing: '2px',
        }}
      >
        watchboard.dev
      </div>

      {/* Red accent line */}
      <div
        style={{
          width: lineWidth,
          height: 2,
          background: theme === 'day'
            ? 'linear-gradient(90deg, transparent, #f0a500, transparent)'
            : 'linear-gradient(90deg, transparent, #e74c3c, transparent)',
          borderRadius: 2,
        }}
      />

      {/* Stats line */}
      <div
        style={{
          opacity: statsOpacity,
          transform: `translateY(${statsY}px)`,
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 20,
          fontWeight: 500,
          color: '#9498a8',
          letterSpacing: '2px',
          textAlign: 'center',
          lineHeight: 1.6,
        }}
      >
        {theme === 'day' ? 'TRACK WHAT\'S GOING RIGHT' : `${trackerCount} TRACKERS · UPDATED BY AI · FREE AND OPEN SOURCE`}
        {theme === 'day' && (
          <div style={{ fontSize: 16, color: '#f0a500', opacity: 0.7, marginTop: 8, letterSpacing: '2px' }}>
            SCIENCE DOESN&apos;T TAKE DAYS OFF
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};
