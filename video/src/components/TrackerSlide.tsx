import React from 'react';
import {
  AbsoluteFill,
  Img,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from 'remotion';
import type { BreakingTracker } from '../data/types';

interface TrackerSlideProps {
  tracker: BreakingTracker;
  accentColor: string;
  thumbnailBase64?: string;
  theme?: 'dark' | 'day';
}

const TIER_LABELS: Record<number, string> = {
  1: 'TIER 1 — OFFICIAL',
  2: 'TIER 2 — MAJOR OUTLET',
  3: 'TIER 3 — INSTITUTIONAL',
  4: 'TIER 4 — UNVERIFIED',
};

function smartTruncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const breakPoints = [' — ', '; ', '. ', ' – '];
  for (const bp of breakPoints) {
    const idx = text.indexOf(bp, 50);
    if (idx > 0 && idx < maxChars) {
      return text.slice(0, idx);
    }
  }
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
  thumbnailBase64,
  theme = 'dark',
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // --- Enter animation ---
  const enterSpring = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 120, mass: 0.8 },
    durationInFrames: 20,
  });
  const enterY = interpolate(enterSpring, [0, 1], [120, 0]);
  const enterOpacity = interpolate(enterSpring, [0, 1], [0, 1]);

  // --- Exit animation ---
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

  const lineWidth = interpolate(frame, [10, 40], [0, 160], {
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

  // --- Image card animation (delayed after globe settles) ---
  const imageSpring = spring({
    frame: Math.max(0, frame - 20),
    fps,
    config: { damping: 14, stiffness: 100, mass: 0.9 },
  });
  const imageOpacity = interpolate(imageSpring, [0, 1], [0, 1]);
  const imageScale = interpolate(imageSpring, [0, 1], [0.85, 1]);
  const imageY = interpolate(imageSpring, [0, 1], [20, 0]);

  // Safe defaults for all tracker fields
  const safeName = tracker.name || tracker.slug || 'Unknown';
  const safeHeadline = tracker.headline || tracker.name || 'Breaking news update';
  const safeKpiValue = tracker.kpiValue ?? '—';
  const safeKpiLabel = tracker.kpiLabel || 'STATUS';

  const displayName = stripEmoji(safeName).toUpperCase();
  const displayHeadline = smartTruncate(safeHeadline, 150);
  const kpiDisplay = `${tracker.kpiPrefix ?? ''}${safeKpiValue}${tracker.kpiSuffix ?? ''}`;

  // Determine chevron direction from kpiPrefix or kpiSuffix
  const hasUpTrend = (tracker.kpiPrefix ?? '').includes('+') || (tracker.kpiPrefix ?? '').includes('\u2191');
  const hasDownTrend = (tracker.kpiPrefix ?? '').includes('-') || (tracker.kpiPrefix ?? '').includes('\u2193');
  const chevronChar = hasDownTrend ? '\u00BB' : '\u00AB'; // » for down, « for up
  const chevronCharRight = hasDownTrend ? '\u00AB' : '\u00BB';

  return (
    <AbsoluteFill
      style={{
        position: 'relative',
        opacity,
        transform: `translateY(${translateY}px)`,
      }}
    >
      {/* Image card — popup card below globe when thumbnail available */}
      {thumbnailBase64 && (
        <div
          style={{
            position: 'absolute',
            top: '42%',
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'center',
            zIndex: 2,
            opacity: imageOpacity,
            transform: `scale(${imageScale}) translateY(${imageY}px)`,
          }}
        >
          <div
            style={{
              width: 400,
              maxHeight: 200,
              borderRadius: 8,
              border: `2px solid ${accentColor}`,
              boxShadow: `0 0 20px ${accentColor}40, 0 4px 24px rgba(0,0,0,0.6)`,
              overflow: 'hidden',
            }}
          >
            <Img
              src={thumbnailBase64}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: 'block',
              }}
            />
          </div>
        </div>
      )}

      {/* Text content — positioned in bottom portion */}
      <div
        style={{
          position: 'absolute',
          top: thumbnailBase64 ? '62%' : '55%',
          left: 0,
          right: 0,
          bottom: 0,
          paddingLeft: 70,
          paddingRight: 70,
          paddingTop: 10,
          paddingBottom: 30,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        {/* Tracker name with accent underline */}
        <div
          style={{
            transform: `translateY(${nameY}px)`,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            marginBottom: 14,
          }}
        >
          <div
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 24,
              fontWeight: 600,
              color: accentColor,
              letterSpacing: '4px',
              textTransform: 'uppercase',
            }}
          >
            {displayName}
          </div>
          <div
            style={{
              width: lineWidth,
              height: 3,
              background: accentColor,
              marginTop: 8,
              borderRadius: 2,
              boxShadow: `0 0 8px ${accentColor}80`,
            }}
          />
        </div>

        {/* Headline — large, centered, full width */}
        <div
          style={{
            opacity: headlineOpacity,
            transform: `translateY(${headlineY}px)`,
            fontFamily: "'DM Sans', sans-serif",
            fontSize: thumbnailBase64 ? 34 : 40,
            fontWeight: 700,
            color: '#e8e9ed',
            lineHeight: 1.25,
            textAlign: 'center',
            maxWidth: 940,
            maxHeight: '5em',
            overflow: 'hidden' as const,
            marginBottom: 18,
          }}
        >
          {displayHeadline}
        </div>

        {/* KPI section — centered with chevron arrows */}
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
              letterSpacing: '3px',
              textTransform: 'uppercase',
              marginBottom: 6,
            }}
          >
            {safeKpiLabel}
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
            }}
          >
            <span
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 48,
                fontWeight: 700,
                color: accentColor,
                opacity: 0.5,
              }}
            >
              {chevronChar}
            </span>
            <span
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: thumbnailBase64 ? 56 : 72,
                fontWeight: 700,
                color: accentColor,
                lineHeight: 1,
                textShadow: `0 0 40px ${accentColor}60, 0 0 80px ${accentColor}30`,
              }}
            >
              {kpiDisplay}
            </span>
            <span
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 48,
                fontWeight: 700,
                color: accentColor,
                opacity: 0.5,
              }}
            >
              {chevronCharRight}
            </span>
          </div>
        </div>

        {/* Bottom row: source badge left, watermark right */}
        <div
          style={{
            opacity: sourceOpacity,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            marginTop: 'auto',
          }}
        >
          <div
            style={{
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
                fontSize: 20,
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
                fontSize: 20,
                color: '#9498a8',
              }}
            >
              {tracker.sourceLabel}
            </span>
          </div>

          <div
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 20,
              color: '#5a5e6e',
              letterSpacing: '2px',
            }}
          >
          </div>
        </div>
      </div>
      {/* BREAKTHROUGH badge — only in day/progress theme */}
      {theme === 'day' && (
        <div
          style={{
            position: 'absolute',
            top: 48,
            right: 36,
            background: 'rgba(240, 165, 0, 0.18)',
            border: '1.5px solid rgba(240, 165, 0, 0.6)',
            borderRadius: 32,
            padding: '8px 20px',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 18,
            fontWeight: 700,
            color: '#f0c060',
            letterSpacing: '3px',
          }}
        >
          ↑ BREAKTHROUGH
        </div>
      )}
    </AbsoluteFill>
  );
};
