import React from 'react';
import { useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';

interface HeadlineProps {
  text: string;
  /** Frame at which the headline starts animating (relative to composition) */
  startFrame: number;
  fontSize?: number;
  color?: string;
  maxWidth?: number;
  lineHeight?: number;
}

export const Headline: React.FC<HeadlineProps> = ({
  text,
  startFrame,
  fontSize = 42,
  color = '#e8e9ed',
  maxWidth = 560,
  lineHeight = 1.35,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = text.split(' ');

  const STAGGER_FRAMES = 3; // frames between each word

  return (
    <div
      style={{
        maxWidth,
        display: 'flex',
        flexWrap: 'wrap',
        gap: `0 ${fontSize * 0.28}px`,
        lineHeight,
      }}
    >
      {words.map((word, i) => {
        const wordStart = startFrame + i * STAGGER_FRAMES;
        const localFrame = frame - wordStart;

        const opacity = interpolate(localFrame, [0, 6], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });

        const translateY = spring({
          frame: Math.max(0, localFrame),
          fps,
          config: {
            damping: 18,
            stiffness: 180,
            mass: 0.6,
          },
        });

        const y = interpolate(translateY, [0, 1], [14, 0]);

        return (
          <span
            key={i}
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize,
              fontWeight: 600,
              color,
              opacity,
              transform: `translateY(${y}px)`,
              display: 'inline-block',
              whiteSpace: 'pre',
            }}
          >
            {word}
          </span>
        );
      })}
    </div>
  );
};
