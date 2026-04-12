import React from 'react';
import { useCurrentFrame, spring, useVideoConfig, interpolate } from 'remotion';

interface KpiCounterProps {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  /** Frame at which counting begins */
  startFrame: number;
  accentColor: string;
}

export const KpiCounter: React.FC<KpiCounterProps> = ({
  label,
  value,
  prefix = '',
  suffix = '',
  startFrame,
  accentColor,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const localFrame = frame - startFrame;

  // Entry animation
  const entryProgress = spring({
    frame: Math.max(0, localFrame),
    fps,
    config: { damping: 14, stiffness: 120, mass: 0.8 },
  });

  const opacity = interpolate(entryProgress, [0, 1], [0, 1]);
  const scale = interpolate(entryProgress, [0, 1], [0.85, 1]);

  // Counter animation: count up over ~30 frames
  const countProgress = interpolate(localFrame, [5, 40], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Ease out cubic for satisfying count
  const eased = 1 - Math.pow(1 - countProgress, 3);
  const displayValue = Math.round(eased * value);

  // Glow pulse once counting completes
  const glowOpacity =
    countProgress >= 1
      ? interpolate(Math.sin((localFrame - 40) * 0.08), [-1, 1], [0.15, 0.4])
      : 0;

  return (
    <div
      style={{
        opacity,
        transform: `scale(${scale})`,
        textAlign: 'left',
      }}
    >
      {/* Label */}
      <div
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 22,
          fontWeight: 500,
          color: '#9498a8',
          letterSpacing: '3px',
          textTransform: 'uppercase',
          marginBottom: 8,
        }}
      >
        {label}
      </div>

      {/* Value */}
      <div
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 96,
          fontWeight: 700,
          color: accentColor,
          lineHeight: 1,
          textShadow: `0 0 30px ${accentColor}${Math.round(glowOpacity * 255)
            .toString(16)
            .padStart(2, '0')}`,
          position: 'relative',
        }}
      >
        {prefix}
        {displayValue.toLocaleString()}
        {suffix}
      </div>
    </div>
  );
};
