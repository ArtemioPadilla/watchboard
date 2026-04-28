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
import { DEFAULT_SLIDE_STYLE, alpha, type SlideStyle } from '../data/slide-style';

interface TrackerSlideProps {
  tracker: BreakingTracker;
  accentColor: string;
  thumbnailBase64?: string;
  theme?: 'dark' | 'day';
  /**
   * Optional style overrides. Any value not provided falls back to DEFAULT_SLIDE_STYLE.
   * The Studio's "Default Props" panel can edit this object live for visual tuning.
   */
  style?: Partial<SlideStyle>;
}

/** Deep-merge a partial style override on top of defaults. */
function mergeStyle(override?: Partial<SlideStyle>): SlideStyle {
  if (!override) return DEFAULT_SLIDE_STYLE;
  const out: SlideStyle = JSON.parse(JSON.stringify(DEFAULT_SLIDE_STYLE));
  for (const key of Object.keys(override) as Array<keyof SlideStyle>) {
    Object.assign(out[key] as object, override[key] as object);
  }
  return out;
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
  style,
}) => {
  const S = mergeStyle(style);
  // Day theme overrides the tier badge text color to stay readable
  const badgeTextColor = theme === 'day' ? '#0a0e1a' : '#0a0b0e';
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // --- Enter animation ---
  const enterSpring = spring({
    frame,
    fps,
    config: { damping: S.animation.enterSpringDamping, stiffness: S.animation.enterSpringStiffness, mass: S.animation.enterSpringMass },
    durationInFrames: S.animation.enterDurationFrames,
  });
  const enterY = interpolate(enterSpring, [0, 1], [120, 0]);
  const enterOpacity = interpolate(enterSpring, [0, 1], [0, 1]);

  // --- Exit animation ---
  const exitStart = durationInFrames - S.animation.exitDurationFrames;
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

  const lineWidth = interpolate(frame, [10, 40], [0, S.trackerName.underlineWidthFinal], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const headlineSpring = spring({
    frame: Math.max(0, frame - S.animation.headlineDelayFrames),
    fps,
    config: { damping: 16, stiffness: 100, mass: 0.9 },
  });
  const headlineOpacity = interpolate(headlineSpring, [0, 1], [0, 1]);
  const headlineY = interpolate(headlineSpring, [0, 1], [30, 0]);

  const kpiSpring = spring({
    frame: Math.max(0, frame - S.animation.kpiDelayFrames),
    fps,
    config: { damping: 14, stiffness: 110, mass: 0.8 },
  });
  const kpiOpacity = interpolate(kpiSpring, [0, 1], [0, 1]);
  const kpiScale = interpolate(kpiSpring, [0, 1], [0.8, 1]);

  const sourceSpring = spring({
    frame: Math.max(0, frame - S.animation.sourceDelayFrames),
    fps,
    config: { damping: 18, stiffness: 140, mass: 0.6 },
  });
  const sourceOpacity = interpolate(sourceSpring, [0, 1], [0, 1]);

  // --- Image card animation (delayed after globe settles) ---
  const imageSpring = spring({
    frame: Math.max(0, frame - S.animation.imageDelayFrames),
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
            top: `${S.imageCard.topPct}%`,
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
              width: S.imageCard.width,
              maxHeight: S.imageCard.maxHeight,
              borderRadius: S.imageCard.borderRadius,
              border: `${S.imageCard.borderWidthPx}px solid ${accentColor}`,
              boxShadow: `0 0 20px ${alpha(accentColor, S.imageCard.glowOpacity)}, 0 4px ${S.imageCard.shadowBlur}px rgba(0,0,0,0.6)`,
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
          top: thumbnailBase64 ? `${S.textBlock.topPctWithThumb}%` : `${S.textBlock.topPctNoThumb}%`,
          left: 0,
          right: 0,
          bottom: 0,
          paddingLeft: S.textBlock.paddingLeft,
          paddingRight: S.textBlock.paddingRight,
          paddingTop: S.textBlock.paddingTop,
          paddingBottom: S.textBlock.paddingBottom,
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
            marginBottom: S.trackerName.blockMarginBottom,
          }}
        >
          <div
            style={{
              fontFamily: S.trackerName.fontFamily,
              fontSize: S.trackerName.fontSize,
              fontWeight: S.trackerName.fontWeight,
              color: accentColor,
              letterSpacing: `${S.trackerName.letterSpacing}px`,
              textTransform: 'uppercase',
            }}
          >
            {displayName}
          </div>
          <div
            style={{
              width: lineWidth,
              height: S.trackerName.underlineHeight,
              background: accentColor,
              marginTop: S.trackerName.nameUnderlineGap,
              borderRadius: 2,
              boxShadow: `0 0 8px ${alpha(accentColor, S.trackerName.underlineGlowOpacity)}`,
            }}
          />
        </div>

        {/* Headline — large, centered, full width */}
        <div
          style={{
            opacity: headlineOpacity,
            transform: `translateY(${headlineY}px)`,
            fontFamily: S.headline.fontFamily,
            fontSize: thumbnailBase64 ? S.headline.fontSizeWithThumb : S.headline.fontSizeNoThumb,
            fontWeight: S.headline.fontWeight,
            color: S.headline.color,
            lineHeight: S.headline.lineHeight,
            textAlign: 'center',
            maxWidth: S.headline.maxWidth,
            maxHeight: '5em',
            overflow: 'hidden' as const,
            marginBottom: S.headline.marginBottom,
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
              fontFamily: S.kpi.labelFontFamily,
              fontSize: S.kpi.labelFontSize,
              fontWeight: S.kpi.labelFontWeight,
              color: S.kpi.labelColor,
              letterSpacing: `${S.kpi.labelLetterSpacing}px`,
              textTransform: 'uppercase',
              marginBottom: S.kpi.labelMarginBottom,
            }}
          >
            {safeKpiLabel}
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: S.kpi.chevronGap,
            }}
          >
            <span
              style={{
                fontFamily: S.kpi.valueFontFamily,
                fontSize: S.kpi.chevronFontSize,
                fontWeight: 700,
                color: accentColor,
                opacity: S.kpi.chevronOpacity,
              }}
            >
              {chevronChar}
            </span>
            <span
              style={{
                fontFamily: S.kpi.valueFontFamily,
                fontSize: thumbnailBase64 ? S.kpi.valueFontSizeWithThumb : S.kpi.valueFontSizeNoThumb,
                fontWeight: S.kpi.valueFontWeight,
                color: accentColor,
                lineHeight: 1,
                textShadow: `0 0 40px ${alpha(accentColor, S.kpi.valueGlowOuter)}, 0 0 80px ${alpha(accentColor, S.kpi.valueGlowSpread)}`,
              }}
            >
              {kpiDisplay}
            </span>
            <span
              style={{
                fontFamily: S.kpi.valueFontFamily,
                fontSize: S.kpi.chevronFontSize,
                fontWeight: 700,
                color: accentColor,
                opacity: S.kpi.chevronOpacity,
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
              gap: S.source.rowGap,
            }}
          >
            <div
              style={{
                background: accentColor,
                borderRadius: S.source.badgeBorderRadius,
                padding: `${S.source.badgePadY}px ${S.source.badgePadX}px`,
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: S.source.badgeFontSize,
                fontWeight: S.source.badgeFontWeight,
                color: badgeTextColor,
                letterSpacing: `${S.source.badgeLetterSpacing}px`,
              }}
            >
              {TIER_LABELS[tracker.sourceTier] ?? 'TIER 2'}
            </div>
            <span
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: S.source.sourceFontSize,
                color: S.source.sourceColor,
                // Truncate to a single ellipsised line so long source labels
                // (e.g. "NATO Annual Report 2025 (released Mar 26, 2026); 19.6%
                // surge in allied expenditure reported") don't overflow the
                // canvas. Ellipsis falls outside; flex shrinks to fit.
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                minWidth: 0,
                flex: 1,
              }}
            >
              {smartTruncate(tracker.sourceLabel, 60)}
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
      {theme === 'day' && S.breakthrough.enabled && (
        <div
          style={{
            position: 'absolute',
            top: S.breakthrough.top,
            right: S.breakthrough.right,
            background: 'rgba(240, 165, 0, 0.18)',
            border: '1.5px solid rgba(240, 165, 0, 0.6)',
            borderRadius: S.breakthrough.borderRadius,
            padding: `${S.breakthrough.paddingY}px ${S.breakthrough.paddingX}px`,
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: S.breakthrough.fontSize,
            fontWeight: S.breakthrough.fontWeight,
            color: S.breakthrough.color,
            letterSpacing: `${S.breakthrough.letterSpacing}px`,
          }}
        >
          ↑ BREAKTHROUGH
        </div>
      )}
    </AbsoluteFill>
  );
};
