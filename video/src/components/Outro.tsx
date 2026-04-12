import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from 'remotion';
import type { BreakingTracker } from '../data/types';

interface OutroProps {
  trackers: BreakingTracker[];
  /** Absolute frame where outro starts */
  startFrame: number;
}

export const Outro: React.FC<OutroProps> = ({ trackers, startFrame }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const localFrame = frame - startFrame;

  // Main entry
  const entrySpring = spring({
    frame: Math.max(0, localFrame),
    fps,
    config: { damping: 14, stiffness: 100, mass: 0.9 },
  });
  const mainOpacity = interpolate(entrySpring, [0, 1], [0, 1]);
  const mainScale = interpolate(entrySpring, [0, 1], [0.9, 1]);

  // Tracker icons stagger
  const iconEntries = trackers.map((_, i) =>
    spring({
      frame: Math.max(0, localFrame - 15 - i * 8),
      fps,
      config: { damping: 10, stiffness: 200, mass: 0.5 },
    }),
  );

  // URL text
  const urlSpring = spring({
    frame: Math.max(0, localFrame - 40),
    fps,
    config: { damping: 16, stiffness: 120, mass: 0.7 },
  });
  const urlOpacity = interpolate(urlSpring, [0, 1], [0, 1]);
  const urlScale = interpolate(urlSpring, [0, 1], [0.8, 1]);

  // Stats line
  const statsSpring = spring({
    frame: Math.max(0, localFrame - 55),
    fps,
    config: { damping: 18, stiffness: 140, mass: 0.6 },
  });
  const statsOpacity = interpolate(statsSpring, [0, 1], [0, 1]);
  const statsY = interpolate(statsSpring, [0, 1], [15, 0]);

  // CTA
  const ctaSpring = spring({
    frame: Math.max(0, localFrame - 70),
    fps,
    config: { damping: 18, stiffness: 160, mass: 0.5 },
  });
  const ctaOpacity = interpolate(ctaSpring, [0, 1], [0, 1]);

  // Fade to black at end
  const fadeOut = interpolate(localFrame, [120, 148], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Red line
  const lineWidth = interpolate(localFrame, [30, 60], [0, 320], {
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
      {/* Tracker icons row */}
      <div
        style={{
          display: 'flex',
          gap: 28,
          marginBottom: 20,
        }}
      >
        {trackers.map((t, i) => {
          const scale = interpolate(iconEntries[i], [0, 1], [0.2, 1]);
          const opacity = interpolate(iconEntries[i], [0, 1], [0, 1]);
          return (
            <div
              key={t.slug}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 10,
                opacity,
                transform: `scale(${scale})`,
              }}
            >
              <div
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: 16,
                  background: '#181b23',
                  border: '1px solid #2a2d3a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 40,
                }}
              >
                {t.icon}
              </div>
              <span
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 16,
                  color: '#9498a8',
                  fontWeight: 500,
                  textAlign: 'center',
                  maxWidth: 100,
                }}
              >
                {t.name}
              </span>
            </div>
          );
        })}
      </div>

      {/* Red accent line */}
      <div
        style={{
          width: lineWidth,
          height: 2,
          background: 'linear-gradient(90deg, transparent, #e74c3c, transparent)',
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
        51 TRACKERS &middot; UPDATED DAILY &middot; FREE &amp; OPEN SOURCE
      </div>

      {/* watchboard.dev */}
      <div
        style={{
          opacity: urlOpacity,
          transform: `scale(${urlScale})`,
          fontFamily: "'DM Sans', sans-serif",
          fontSize: 56,
          fontWeight: 700,
          color: '#e74c3c',
          letterSpacing: '2px',
          textShadow: '0 0 40px rgba(231, 76, 60, 0.4)',
        }}
      >
        watchboard.dev
      </div>

      {/* CTA */}
      <div
        style={{
          opacity: ctaOpacity,
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 22,
          fontWeight: 500,
          color: '#5a5e6e',
          letterSpacing: '4px',
          marginTop: 12,
        }}
      >
        FOLLOW FOR DAILY UPDATES
      </div>
    </AbsoluteFill>
  );
};
