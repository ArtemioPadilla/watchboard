import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from 'remotion';
import { DEFAULT_OUTRO_STYLE, type OutroStyle } from '../data/slide-style';

export const Outro: React.FC<{ theme?: 'dark' | 'day'; trackerCount?: number; style?: Partial<OutroStyle> }> = ({ theme = 'dark', trackerCount = 64, style }) => {
  const O: OutroStyle = { ...DEFAULT_OUTRO_STYLE, ...(style || {}) };
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

  // URL text
  const urlSpring = spring({
    frame: Math.max(0, frame - O.urlDelayFrames),
    fps,
    config: { damping: 16, stiffness: 120, mass: 0.7 },
  });
  const urlOpacity = interpolate(urlSpring, [0, 1], [0, 1]);
  const urlScale = interpolate(urlSpring, [0, 1], [0.8, 1]);

  // Stats line
  const statsSpring = spring({
    frame: Math.max(0, frame - O.statsDelayFrames),
    fps,
    config: { damping: 18, stiffness: 140, mass: 0.6 },
  });
  const statsOpacity = interpolate(statsSpring, [0, 1], [0, 1]);
  const statsY = interpolate(statsSpring, [0, 1], [15, 0]);

  // Fade to black at end
  const fadeOut = interpolate(frame, [O.fadeOutStartFrame, O.fadeOutEndFrame], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Red accent line
  const lineWidth = interpolate(frame, [10, O.lineGrowEndFrame], [0, O.lineWidthFinal], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        opacity: mainOpacity * fadeOut,
        transform: `scale(${mainScale}) translateY(${O.verticalOffset}px)`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: O.rowGap,
      }}
    >
      {/* watchboard.dev */}
      <div
        style={{
          opacity: urlOpacity,
          transform: `scale(${urlScale})`,
          fontFamily: O.urlFontFamily,
          fontSize: O.urlFontSize,
          fontWeight: O.urlFontWeight,
          color: O.urlColor,
          letterSpacing: `${O.urlLetterSpacing}px`,
        }}
      >
        watchboard.dev
      </div>

      {/* Red accent line */}
      <div
        style={{
          width: lineWidth,
          height: O.lineHeight,
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
          fontFamily: O.statsFontFamily,
          fontSize: O.statsFontSize,
          fontWeight: O.statsFontWeight,
          color: O.statsColor,
          letterSpacing: `${O.statsLetterSpacing}px`,
          textAlign: 'center',
          lineHeight: O.statsLineHeight,
        }}
      >
        {theme === 'day' ? 'TRACK WHAT\'S GOING RIGHT' : `${trackerCount} TRACKERS · UPDATED BY AI · FREE AND OPEN SOURCE`}
        {theme === 'day' && (
          <div style={{ fontSize: O.daySubFontSize, color: O.daySubColor, opacity: 0.7, marginTop: O.daySubMarginTop, letterSpacing: '2px' }}>
            {O.daySubLabel}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};
