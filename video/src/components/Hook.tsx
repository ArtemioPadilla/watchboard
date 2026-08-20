import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from 'remotion';

/**
 * Hook card — the opening two seconds, replacing the logo intro.
 *
 * #157's central claim: "Videos open with 'Daily Intelligence Brief - Date'
 * which is an index, not a cliffhanger. Users scroll past in 1.5 seconds."
 * A logo spends the only moment that decides whether anyone watches on
 * something the viewer already knows.
 *
 * So this shows the single most escalated tracker's headline at display size
 * and nothing else. No logo, no date, no chrome — branding belongs in the
 * outro, where it costs nothing.
 *
 * Type is kept inside the centre-safe zone: vertical video is cropped
 * differently by every platform's chrome, and edge-anchored text is the first
 * thing to disappear.
 */
export interface HookProps {
  /** The headline. Kept short by the caller — this renders at display size. */
  headline: string;
  /** Optional supporting stat, e.g. "47 sorties in 24 hours". */
  stat?: string;
  theme?: 'dark' | 'day';
  accent?: string;
}

export const Hook: React.FC<HookProps> = ({
  headline,
  stat,
  theme = 'dark',
  accent = '#e74c3c',
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const ground = theme === 'day' ? '#f4f4f2' : '#08090c';
  const ink = theme === 'day' ? '#101114' : '#f2f4f8';
  const inkSoft = theme === 'day' ? '#4a4d54' : '#9aa1ad';

  // No fade from black: the first frame must already carry information.
  // A fade spends the scroll-stop window on an empty screen.
  const rise = spring({ frame, fps, config: { damping: 16, stiffness: 120, mass: 0.7 } });
  const y = interpolate(rise, [0, 1], [40, 0]);
  const opacity = interpolate(frame, [0, 6], [0, 1], { extrapolateRight: 'clamp' });

  const statOpacity = interpolate(frame, [10, 20], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Accent rule wipes in under the headline — motion that points at the words
  // rather than decorating around them.
  const ruleWidth = interpolate(frame, [6, 22], [0, 100], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: ground,
        justifyContent: 'center',
        alignItems: 'center',
        // Centre-safe zone: generous horizontal padding so platform chrome
        // never clips the headline.
        padding: '0 140px',
      }}
    >
      <div style={{ transform: `translateY(${y}px)`, opacity, width: '100%' }}>
        {stat ? (
          <div
            style={{
              fontFamily: 'JetBrains Mono, ui-monospace, monospace',
              fontSize: 38,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: accent,
              opacity: statOpacity,
              marginBottom: 28,
            }}
          >
            {stat}
          </div>
        ) : null}

        <div
          style={{
            fontFamily: 'Inter, -apple-system, system-ui, sans-serif',
            fontWeight: 800,
            fontSize: headline.length > 64 ? 84 : 104,
            lineHeight: 1.04,
            letterSpacing: '-0.03em',
            color: ink,
            textWrap: 'balance',
          }}
        >
          {headline}
        </div>

        <div
          style={{
            marginTop: 36,
            height: 8,
            width: `${ruleWidth}%`,
            maxWidth: 420,
            backgroundColor: accent,
            borderRadius: 2,
          }}
        />
      </div>

      <div
        style={{
          position: 'absolute',
          bottom: 120,
          fontFamily: 'JetBrains Mono, ui-monospace, monospace',
          fontSize: 26,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          color: inkSoft,
          opacity: statOpacity,
        }}
      >
        watchboard.dev
      </div>
    </AbsoluteFill>
  );
};
