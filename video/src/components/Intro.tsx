import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from 'remotion';

interface IntroProps {
  date: string;
  theme?: 'dark' | 'day';
}

export const Intro: React.FC<IntroProps> = ({ date, theme = 'dark' }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Format date nicely: "APRIL 12, 2026"
  const formatted = formatDate(date);

  // Fade in from black over first 15 frames
  const fadeIn = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: 'clamp',
  });

  // Logo spring entry
  const logoSpring = spring({
    frame: Math.max(0, frame - 8),
    fps,
    config: { damping: 12, stiffness: 100, mass: 0.8 },
  });
  const logoScale = interpolate(logoSpring, [0, 1], [0.6, 1]);
  const logoOpacity = interpolate(logoSpring, [0, 1], [0, 1]);

  // Subtitle appears after logo
  const subtitleSpring = spring({
    frame: Math.max(0, frame - 30),
    fps,
    config: { damping: 18, stiffness: 140, mass: 0.6 },
  });
  const subtitleOpacity = interpolate(subtitleSpring, [0, 1], [0, 1]);
  const subtitleY = interpolate(subtitleSpring, [0, 1], [20, 0]);

  // Date appears last
  const dateSpring = spring({
    frame: Math.max(0, frame - 50),
    fps,
    config: { damping: 20, stiffness: 160, mass: 0.5 },
  });
  const dateOpacity = interpolate(dateSpring, [0, 1], [0, 1]);
  const dateY = interpolate(dateSpring, [0, 1], [15, 0]);

  // Red accent line grows
  const lineWidth = interpolate(frame, [20, 55], [0, 280], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Subtle glow pulse on logo
  const glowIntensity = interpolate(Math.sin(frame * 0.06), [-1, 1], [20, 45]);

  return (
    <AbsoluteFill
      style={{
        opacity: fadeIn,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Logo */}
      <div
        style={{
          opacity: logoOpacity,
          transform: `scale(${logoScale})`,
          fontFamily: "'DM Sans', sans-serif",
          fontSize: 96,
          fontWeight: 700,
          color: theme === 'day' ? '#ffffff' : '#e74c3c',
          letterSpacing: '6px',
          textShadow: theme === 'day'
            ? `0 0 ${glowIntensity}px rgba(255, 255, 255, 0.35), 0 0 60px rgba(240, 165, 0, 0.2)`
            : `0 0 ${glowIntensity}px rgba(231, 76, 60, 0.5)`,
          marginBottom: 20,
        }}
      >
        WATCHBOARD
      </div>

      {/* Red accent line */}
      <div
        style={{
          width: lineWidth,
          height: 3,
          background: theme === 'day'
            ? 'linear-gradient(90deg, transparent, #f0a500, transparent)'
            : 'linear-gradient(90deg, transparent, #e74c3c, transparent)',
          marginBottom: 24,
          borderRadius: 2,
        }}
      />

      {/* Subtitle */}
      <div
        style={{
          opacity: subtitleOpacity,
          transform: `translateY(${subtitleY}px)`,
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: theme === 'day' ? 30 : 28,
          fontWeight: 600,
          color: theme === 'day' ? '#f0c060' : '#9498a8',
          letterSpacing: theme === 'day' ? '6px' : '4px',
          marginBottom: 16,
        }}
      >
        {theme === 'day' ? 'PROGRESS BRIEF' : 'DAILY INTELLIGENCE BRIEF'}
      </div>

      {/* Date */}
      <div
        style={{
          opacity: dateOpacity,
          transform: `translateY(${dateY}px)`,
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: theme === 'day' ? 26 : 30,
          fontWeight: 500,
          color: theme === 'day' ? 'rgba(255,255,255,0.6)' : '#e8e9ed',
          letterSpacing: '3px',
        }}
      >
        {formatted}
      </div>
    </AbsoluteFill>
  );
};

function formatDate(dateStr: string): string {
  try {
    const [year, month, day] = dateStr.split('-').map(Number);
    const d = new Date(year, month - 1, day);
    return d
      .toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
      .toUpperCase();
  } catch {
    return dateStr.toUpperCase();
  }
}
