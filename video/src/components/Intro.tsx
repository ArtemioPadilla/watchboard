import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from 'remotion';
import { DEFAULT_INTRO_STYLE, type IntroStyle } from '../data/slide-style';

interface IntroProps {
  date: string;
  theme?: 'dark' | 'day';
  style?: Partial<IntroStyle>;
}

export const Intro: React.FC<IntroProps> = ({ date, theme = 'dark', style }) => {
  const I: IntroStyle = { ...DEFAULT_INTRO_STYLE, ...(style || {}) };
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Format date nicely: "APRIL 12, 2026"
  const formatted = formatDate(date);

  // Fade in from black over first 15 frames
  const fadeIn = interpolate(frame, [0, I.fadeInFrames], [0, 1], {
    extrapolateRight: 'clamp',
  });

  // Logo spring entry
  const logoSpring = spring({
    frame: Math.max(0, frame - I.logoDelayFrames),
    fps,
    config: { damping: 12, stiffness: 100, mass: 0.8 },
  });
  const logoScale = interpolate(logoSpring, [0, 1], [0.6, 1]);
  const logoOpacity = interpolate(logoSpring, [0, 1], [0, 1]);

  // Subtitle appears after logo
  const subtitleSpring = spring({
    frame: Math.max(0, frame - I.subtitleDelayFrames),
    fps,
    config: { damping: 18, stiffness: 140, mass: 0.6 },
  });
  const subtitleOpacity = interpolate(subtitleSpring, [0, 1], [0, 1]);
  const subtitleY = interpolate(subtitleSpring, [0, 1], [20, 0]);

  // Date appears last
  const dateSpring = spring({
    frame: Math.max(0, frame - I.dateDelayFrames),
    fps,
    config: { damping: 20, stiffness: 160, mass: 0.5 },
  });
  const dateOpacity = interpolate(dateSpring, [0, 1], [0, 1]);
  const dateY = interpolate(dateSpring, [0, 1], [15, 0]);

  // Red accent line grows
  const lineWidth = interpolate(frame, [20, I.lineGrowEndFrame], [0, I.lineWidthFinal], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Subtle glow pulse on logo
  const glowIntensity = interpolate(Math.sin(frame * 0.06), [-1, 1], [I.glowMin, I.glowMax]);

  return (
    <AbsoluteFill
      style={{
        opacity: fadeIn,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        transform: `translateY(${I.verticalOffset}px)`,
      }}
    >
      {/* Logo */}
      <div
        style={{
          opacity: logoOpacity,
          transform: `scale(${logoScale})`,
          fontFamily: I.logoFontFamily,
          fontSize: I.logoFontSize,
          fontWeight: I.logoFontWeight,
          color: theme === 'day' ? I.logoColorDay : I.logoColorDark,
          letterSpacing: `${I.logoLetterSpacing}px`,
          textShadow: theme === 'day'
            ? `0 0 ${glowIntensity}px rgba(255, 255, 255, 0.35), 0 0 60px rgba(240, 165, 0, 0.2)`
            : `0 0 ${glowIntensity}px rgba(231, 76, 60, 0.5)`,
          marginBottom: I.logoMarginBottom,
        }}
      >
        WATCHBOARD
      </div>

      {/* Red accent line */}
      <div
        style={{
          width: lineWidth,
          height: I.lineHeight,
          background: theme === 'day'
            ? 'linear-gradient(90deg, transparent, #f0a500, transparent)'
            : 'linear-gradient(90deg, transparent, #e74c3c, transparent)',
          marginBottom: I.lineMarginBottom,
          borderRadius: 2,
        }}
      />

      {/* Subtitle */}
      <div
        style={{
          opacity: subtitleOpacity,
          transform: `translateY(${subtitleY}px)`,
          fontFamily: I.subtitleFontFamily,
          fontSize: theme === 'day' ? I.subtitleFontSizeDay : I.subtitleFontSizeDark,
          fontWeight: I.subtitleFontWeight,
          color: theme === 'day' ? I.subtitleColorDay : I.subtitleColorDark,
          letterSpacing: `${theme === 'day' ? I.subtitleLetterSpacingDay : I.subtitleLetterSpacingDark}px`,
          marginBottom: I.subtitleMarginBottom,
        }}
      >
        {theme === 'day' ? I.subtitleTextDay : I.subtitleTextDark}
      </div>

      {/* Date */}
      <div
        style={{
          opacity: dateOpacity,
          transform: `translateY(${dateY}px)`,
          fontFamily: I.dateFontFamily,
          fontSize: theme === 'day' ? I.dateFontSizeDay : I.dateFontSizeDark,
          fontWeight: I.dateFontWeight,
          color: theme === 'day' ? I.dateColorDay : I.dateColorDark,
          letterSpacing: `${I.dateLetterSpacing}px`,
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
