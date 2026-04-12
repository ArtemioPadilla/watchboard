import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from 'remotion';
import { Headline } from './Headline';
import { KpiCounter } from './KpiCounter';
import { MapDot } from './MapDot';
import type { BreakingTracker } from '../data/types';

interface TrackerSlideProps {
  tracker: BreakingTracker;
  accentColor: string;
  /** Absolute frame where this slide starts in the composition */
  slideStartFrame: number;
}

const TIER_LABELS: Record<number, string> = {
  1: 'TIER 1 \u2014 OFFICIAL',
  2: 'TIER 2 \u2014 MAJOR OUTLET',
  3: 'TIER 3 \u2014 INSTITUTIONAL',
  4: 'TIER 4 \u2014 UNVERIFIED',
};

export const TrackerSlide: React.FC<TrackerSlideProps> = ({
  tracker,
  accentColor,
  slideStartFrame,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const localFrame = frame - slideStartFrame;

  // Slide entry from right
  const entrySpring = spring({
    frame: Math.max(0, localFrame),
    fps,
    config: { damping: 16, stiffness: 100, mass: 1.0 },
  });

  const slideX = interpolate(entrySpring, [0, 1], [400, 0]);
  const slideOpacity = interpolate(entrySpring, [0, 1], [0, 1]);

  // Exit fade (last 10 frames of the 150-frame slide)
  const exitOpacity = interpolate(localFrame, [130, 148], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Accent border glow
  const borderGlow = interpolate(
    Math.sin(localFrame * 0.06),
    [-1, 1],
    [0.4, 0.8],
  );

  // Icon bounce entry
  const iconSpring = spring({
    frame: Math.max(0, localFrame - 10),
    fps,
    config: { damping: 10, stiffness: 200, mass: 0.5 },
  });
  const iconScale = interpolate(iconSpring, [0, 1], [0.3, 1]);

  // Source tier badge
  const badgeOpacity = interpolate(localFrame, [50, 60], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        opacity: slideOpacity * exitOpacity,
        transform: `translateX(${slideX}px)`,
      }}
    >
      {/* Card container */}
      <div
        style={{
          position: 'absolute',
          top: 200,
          left: 50,
          right: 50,
          bottom: 200,
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
        }}
      >
        {/* Map section (top half) */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: 40,
            paddingTop: 60,
          }}
        >
          <MapDot
            center={tracker.mapCenter}
            startFrame={slideStartFrame + 5}
            accentColor={accentColor}
          />
        </div>

        {/* Content card */}
        <div
          style={{
            background: '#181b23',
            borderRadius: 20,
            border: `1px solid #2a2d3a`,
            borderLeft: `4px solid ${accentColor}`,
            boxShadow: `0 0 30px rgba(0,0,0,0.5), -4px 0 20px ${accentColor}${Math.round(
              borderGlow * 60,
            )
              .toString(16)
              .padStart(2, '0')}`,
            padding: '48px 44px',
            display: 'flex',
            flexDirection: 'column',
            gap: 28,
            flex: 1,
          }}
        >
          {/* Tracker name row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
            }}
          >
            <span
              style={{
                fontSize: 48,
                transform: `scale(${iconScale})`,
                display: 'inline-block',
              }}
            >
              {tracker.icon}
            </span>
            <span
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 38,
                fontWeight: 700,
                color: '#e8e9ed',
                letterSpacing: '1px',
              }}
            >
              {tracker.name}
            </span>
          </div>

          {/* Headline */}
          <Headline
            text={tracker.headline}
            startFrame={slideStartFrame + 15}
            fontSize={36}
            color="#e8e9ed"
            maxWidth={900}
            lineHeight={1.4}
          />

          {/* KPI */}
          <div style={{ marginTop: 16 }}>
            <KpiCounter
              label={tracker.kpiLabel}
              value={tracker.kpiValue}
              prefix={tracker.kpiPrefix}
              suffix={tracker.kpiSuffix}
              startFrame={slideStartFrame + 25}
              accentColor={accentColor}
            />
          </div>

          {/* Source tier badge */}
          <div
            style={{
              opacity: badgeOpacity,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginTop: 'auto',
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
      </div>
    </AbsoluteFill>
  );
};
