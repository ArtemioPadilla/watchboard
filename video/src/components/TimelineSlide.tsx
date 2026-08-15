import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from 'remotion';
import type { BreakingTracker } from '../data/types';

interface TimelineSlideProps {
  tracker: BreakingTracker;
  accentColor: string;
  theme?: 'dark' | 'day';
}

function stripEmoji(text: string): string {
  return text
    .replace(
      /[\u{1F600}-\u{1F9FF}\u{1FA00}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{1F100}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu,
      '',
    )
    .trim();
}

function smartTruncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const breakPoints = [' — ', '; ', '. ', ' – '];
  for (const bp of breakPoints) {
    const idx = text.indexOf(bp, 40);
    if (idx > 0 && idx < maxChars) return text.slice(0, idx);
  }
  const truncated = text.slice(0, maxChars);
  const lastSpace = truncated.lastIndexOf(' ');
  return (lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated) + '…';
}

export const TimelineSlide: React.FC<TimelineSlideProps> = ({
  tracker,
  accentColor,
  theme = 'dark',
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const isDark = theme === 'dark';
  const textColor = isDark ? '#e8e9ed' : '#f0f0f0';
  const subColor = isDark ? '#8a8d9e' : '#b0b8cc';
  const bgCard = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.08)';
  const borderCard = `rgba(${isDark ? '255,255,255' : '200,200,255'},0.08)`;

  // --- Enter animation ---
  const enterSpring = spring({ frame, fps, config: { damping: 18, stiffness: 100, mass: 0.9 } });
  const enterY = interpolate(enterSpring, [0, 1], [80, 0]);
  const enterOpacity = interpolate(enterSpring, [0, 1], [0, 1]);

  // --- Exit animation ---
  const exitStart = durationInFrames - 20;
  const exitOpacity = interpolate(frame, [exitStart, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const opacity = enterOpacity * exitOpacity;

  // Name underline grow
  const lineWidth = interpolate(frame, [10, 40], [0, 220], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Headline
  const headlineSpring = spring({
    frame: Math.max(0, frame - 8),
    fps,
    config: { damping: 16, stiffness: 100, mass: 0.9 },
  });
  const headlineOpacity = interpolate(headlineSpring, [0, 1], [0, 1]);
  const headlineY = interpolate(headlineSpring, [0, 1], [20, 0]);

  // Events staggered
  const events = (tracker.events ?? []).slice(0, 4);

  const displayName = stripEmoji(tracker.name || tracker.slug).toUpperCase();
  const headline = smartTruncate(tracker.headline || '', 110);

  return (
    <AbsoluteFill
      style={{
        opacity,
        transform: `translateY(${enterY}px)`,
        paddingLeft: 54,
        paddingRight: 54,
        paddingTop: 60,
        paddingBottom: 60,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-start',
      }}
    >
      {/* Tracker name */}
      <div style={{ marginBottom: 10 }}>
        <div
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 32,
            fontWeight: 700,
            color: accentColor,
            letterSpacing: 4,
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
            boxShadow: `0 0 8px ${accentColor}88`,
          }}
        />
      </div>

      {/* Headline */}
      <div
        style={{
          opacity: headlineOpacity,
          transform: `translateY(${headlineY}px)`,
          fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
          fontSize: 36,
          fontWeight: 700,
          color: textColor,
          lineHeight: 1.3,
          marginBottom: 40,
          maxWidth: 900,
        }}
      >
        {headline}
      </div>

      {/* Divider */}
      <div
        style={{
          width: '100%',
          height: 1,
          background: `linear-gradient(90deg, ${accentColor}88 0%, transparent 100%)`,
          marginBottom: 32,
          opacity: headlineOpacity,
        }}
      />

      {/* Timeline events */}
      {events.map((event, i) => {
        const delay = 18 + i * 14;
        const evSpring = spring({
          frame: Math.max(0, frame - delay),
          fps,
          config: { damping: 16, stiffness: 110, mass: 0.8 },
        });
        const evOpacity = interpolate(evSpring, [0, 1], [0, 1]);
        const evX = interpolate(evSpring, [0, 1], [-30, 0]);

        const title = smartTruncate(event.title || '', 70);
        const date = event.date || '';

        return (
          <div
            key={i}
            style={{
              opacity: evOpacity,
              transform: `translateX(${evX}px)`,
              marginBottom: 22,
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: 18,
            }}
          >
            {/* Dot + line */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                paddingTop: 6,
                minWidth: 18,
              }}
            >
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: accentColor,
                  boxShadow: `0 0 8px ${accentColor}`,
                  flexShrink: 0,
                }}
              />
              {i < events.length - 1 && (
                <div
                  style={{
                    width: 2,
                    flex: 1,
                    minHeight: 28,
                    background: `${accentColor}33`,
                    marginTop: 4,
                  }}
                />
              )}
            </div>

            {/* Content */}
            <div style={{ flex: 1 }}>
              {date && (
                <div
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 20,
                    color: accentColor,
                    letterSpacing: 1,
                    marginBottom: 4,
                    opacity: 0.85,
                  }}
                >
                  {date}
                </div>
              )}
              <div
                style={{
                  background: bgCard,
                  border: `1px solid ${borderCard}`,
                  borderRadius: 10,
                  padding: '14px 18px',
                }}
              >
                <div
                  style={{
                    fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
                    fontSize: 26,
                    fontWeight: 600,
                    color: textColor,
                    lineHeight: 1.35,
                  }}
                >
                  {title}
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {/* Bottom watermark */}
      <div
        style={{
          marginTop: 'auto',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 20,
          color: subColor,
          letterSpacing: 2,
          opacity: headlineOpacity,
        }}
      >
        watchboard.dev
      </div>
    </AbsoluteFill>
  );
};
