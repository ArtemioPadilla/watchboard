import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from 'remotion';
import type { BreakingTracker } from '../data/types';

interface TrackerSlideProps {
  tracker: BreakingTracker;
  accentColor: string;
}

const TIER_LABELS: Record<number, string> = {
  1: 'TIER 1 \u2014 OFFICIAL',
  2: 'TIER 2 \u2014 MAJOR OUTLET',
  3: 'TIER 3 \u2014 INSTITUTIONAL',
  4: 'TIER 4 \u2014 UNVERIFIED',
};

function smartTruncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  // Try to break at sentence boundaries (after at least 50 chars)
  const breakPoints = [' — ', '; ', '. ', ' – '];
  for (const bp of breakPoints) {
    const idx = text.indexOf(bp, 50);
    if (idx > 0 && idx < maxChars) {
      return text.slice(0, idx);
    }
  }
  // Fallback: word boundary
  const truncated = text.slice(0, maxChars);
  const lastSpace = truncated.lastIndexOf(' ');
  return (lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated) + '...';
}

/** Strip emoji and other non-BMP characters that fail in headless Chrome */
function stripEmoji(text: string): string {
  return text
    .replace(
      /[\u{1F600}-\u{1F9FF}\u{1FA00}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{1F100}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu,
      '',
    )
    .trim();
}

export const TrackerSlide: React.FC<TrackerSlideProps> = ({
  tracker,
  accentColor,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // --- Enter: slide up from bottom (first 15 frames) ---
  const enterSpring = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 120, mass: 0.8 },
    durationInFrames: 20,
  });
  const enterY = interpolate(enterSpring, [0, 1], [120, 0]);
  const enterOpacity = interpolate(enterSpring, [0, 1], [0, 1]);

  // --- Exit: slide down (last 15 frames) ---
  const exitStart = durationInFrames - 15;
  const exitProgress = interpolate(frame, [exitStart, durationInFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const exitY = interpolate(exitProgress, [0, 1], [0, 80]);
  const exitOpacity = interpolate(exitProgress, [0, 1], [1, 0]);

  const translateY = enterY + exitY;
  const opacity = enterOpacity * exitOpacity;

  // --- Staggered content animations ---
  const nameSpring = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 120, mass: 0.8 },
  });
  const nameY = interpolate(nameSpring, [0, 1], [20, 0]);

  const lineWidth = interpolate(frame, [10, 40], [0, 200], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const headlineSpring = spring({
    frame: Math.max(0, frame - 20),
    fps,
    config: { damping: 16, stiffness: 100, mass: 0.9 },
  });
  const headlineOpacity = interpolate(headlineSpring, [0, 1], [0, 1]);
  const headlineY = interpolate(headlineSpring, [0, 1], [30, 0]);

  const kpiSpring = spring({
    frame: Math.max(0, frame - 35),
    fps,
    config: { damping: 14, stiffness: 110, mass: 0.8 },
  });
  const kpiOpacity = interpolate(kpiSpring, [0, 1], [0, 1]);
  const kpiScale = interpolate(kpiSpring, [0, 1], [0.8, 1]);

  const sourceSpring = spring({
    frame: Math.max(0, frame - 50),
    fps,
    config: { damping: 18, stiffness: 140, mass: 0.6 },
  });
  const sourceOpacity = interpolate(sourceSpring, [0, 1], [0, 1]);

  // Accent strip glow pulse
  const glowIntensity = interpolate(
    Math.sin(frame * 0.06),
    [-1, 1],
    [15, 35],
  );

  const displayName = stripEmoji(tracker.name).toUpperCase();
  const displayHeadline = smartTruncate(tracker.headline, 150);
  const kpiDisplay = `${tracker.kpiPrefix ?? ''}${tracker.kpiValue}${tracker.kpiSuffix ?? ''}`;

  return (
    <AbsoluteFill
      style={{
        opacity,
        transform: `translateY(${translateY}px)`,
      }}
    >
      {/* Left accent strip with glow */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: 6,
          height: '100%',
          background: accentColor,
          boxShadow: `0 0 ${glowIntensity}px ${accentColor}, 0 0 ${glowIntensity * 2}px ${accentColor}40`,
        }}
      />

      {/* Text content — positioned in bottom 55% to leave room for globe */}
      <div
        style={{
          position: 'absolute',
          top: '45%',
          left: 0,
          right: 0,
          bottom: 0,
          paddingRight: 60,
          paddingBottom: 40,
          paddingLeft: 80,
          paddingTop: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
        }}
      >
        {/* Tracker name */}
        <div
          style={{
            transform: `translateY(${nameY}px)`,
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 28,
            fontWeight: 700,
            color: accentColor,
            letterSpacing: '3px',
            textTransform: 'uppercase',
          }}
        >
          {displayName}
        </div>

        {/* Accent line */}
        <div
          style={{
            width: lineWidth,
            height: 3,
            background: accentColor,
            marginTop: 8,
            marginBottom: 14,
            borderRadius: 2,
            boxShadow: `0 0 8px ${accentColor}80`,
          }}
        />

        {/* Headline */}
        <div
          style={{
            opacity: headlineOpacity,
            transform: `translateY(${headlineY}px)`,
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 34,
            fontWeight: 700,
            color: '#e8e9ed',
            lineHeight: 1.25,
            maxWidth: 900,
            maxHeight: '4.8em',
            overflow: 'hidden' as const,
          }}
        >
          {displayHeadline}
        </div>

        {/* KPI section */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: kpiOpacity,
            transform: `scale(${kpiScale})`,
          }}
        >
          <div
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 18,
              fontWeight: 500,
              color: '#9498a8',
              letterSpacing: '2px',
              textTransform: 'uppercase',
              marginBottom: 8,
            }}
          >
            {tracker.kpiLabel}
          </div>

          <div
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 64,
              fontWeight: 700,
              color: accentColor,
              lineHeight: 1,
              textShadow: `0 0 40px ${accentColor}60, 0 0 80px ${accentColor}30`,
            }}
          >
            {kpiDisplay}
          </div>
        </div>

        {/* Source tier badge */}
        <div
          style={{
            opacity: sourceOpacity,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <div
            style={{
              background: accentColor,
              borderRadius: 4,
              padding: '4px 12px',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 14,
              fontWeight: 600,
              color: '#0a0b0e',
              letterSpacing: '1px',
            }}
          >
            {TIER_LABELS[tracker.sourceTier] ?? 'TIER 2'}
          </div>
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 16,
              color: '#9498a8',
            }}
          >
            {tracker.sourceLabel}
          </span>
        </div>
      </div>
    </AbsoluteFill>
  );
};
