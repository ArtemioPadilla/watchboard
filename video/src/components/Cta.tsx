import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from 'remotion';

/**
 * Closing call-to-action.
 *
 * #157: "Weak CTA — no clear 'follow for more' conversion moment." The current
 * outro ends on branding, which tells a viewer who you are but never asks them
 * for anything.
 *
 * Deliberately NOT narrated. A spoken CTA eats a second of a short video and
 * reads as an ad; on screen it costs nothing and is still there when someone
 * watches muted, which most people do.
 */
export interface CtaProps {
  handle?: string;
  line?: string;
  theme?: 'dark' | 'day';
  accent?: string;
}

export const Cta: React.FC<CtaProps> = ({
  handle = '@watchboard.dev',
  line = 'Daily OSINT briefs',
  theme = 'dark',
  accent = '#e74c3c',
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const ground = theme === 'day' ? '#f4f4f2' : '#08090c';
  const ink = theme === 'day' ? '#101114' : '#f2f4f8';
  const inkSoft = theme === 'day' ? '#4a4d54' : '#9aa1ad';

  const pop = spring({ frame, fps, config: { damping: 14, stiffness: 140, mass: 0.6 } });
  const scale = interpolate(pop, [0, 1], [0.94, 1]);
  const opacity = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: ground,
        justifyContent: 'center',
        alignItems: 'center',
        padding: '0 140px',
      }}
    >
      <div style={{ transform: `scale(${scale})`, opacity, textAlign: 'center' }}>
        <div
          style={{
            fontFamily: 'JetBrains Mono, ui-monospace, monospace',
            fontSize: 30,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: inkSoft,
            marginBottom: 32,
          }}
        >
          {line}
        </div>
        <div
          style={{
            fontFamily: 'Inter, -apple-system, system-ui, sans-serif',
            fontWeight: 800,
            fontSize: 92,
            letterSpacing: '-0.03em',
            color: ink,
            lineHeight: 1.05,
          }}
        >
          Follow
        </div>
        <div
          style={{
            fontFamily: 'JetBrains Mono, ui-monospace, monospace',
            fontWeight: 600,
            fontSize: 52,
            letterSpacing: '-0.01em',
            color: accent,
            marginTop: 18,
          }}
        >
          {handle}
        </div>
      </div>
    </AbsoluteFill>
  );
};
