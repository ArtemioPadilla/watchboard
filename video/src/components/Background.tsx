import React, { useMemo } from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';

const STAR_COUNT = 120;
const GRID_LINES = 12;

interface Star {
  x: number;
  y: number;
  size: number;
  baseOpacity: number;
  pulseSpeed: number;
  pulseOffset: number;
}

export const Background: React.FC = () => {
  const frame = useCurrentFrame();

  const stars = useMemo<Star[]>(() => {
    const result: Star[] = [];
    // Deterministic pseudo-random using a simple seed
    let seed = 42;
    const rand = () => {
      seed = (seed * 16807 + 0) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < STAR_COUNT; i++) {
      result.push({
        x: rand() * 1080,
        y: rand() * 1920,
        size: rand() * 2 + 0.5,
        baseOpacity: rand() * 0.4 + 0.1,
        pulseSpeed: rand() * 0.03 + 0.01,
        pulseOffset: rand() * Math.PI * 2,
      });
    }
    return result;
  }, []);

  return (
    <AbsoluteFill
      style={{
        background: 'linear-gradient(180deg, #0a0b0e 0%, #0d0f15 40%, #0a0b0e 100%)',
      }}
    >
      {/* Animated grid */}
      <svg
        width="1080"
        height="1920"
        style={{ position: 'absolute', top: 0, left: 0 }}
        viewBox="0 0 1080 1920"
      >
        {/* Horizontal grid lines */}
        {Array.from({ length: GRID_LINES }, (_, i) => {
          const y = (i + 1) * (1920 / (GRID_LINES + 1));
          const opacity = interpolate(
            Math.sin(frame * 0.015 + i * 0.5),
            [-1, 1],
            [0.02, 0.06],
          );
          return (
            <line
              key={`h-${i}`}
              x1="0"
              y1={y}
              x2="1080"
              y2={y}
              stroke="#2a2d3a"
              strokeWidth="0.5"
              opacity={opacity}
            />
          );
        })}
        {/* Vertical grid lines */}
        {Array.from({ length: 8 }, (_, i) => {
          const x = (i + 1) * (1080 / 9);
          const opacity = interpolate(
            Math.sin(frame * 0.012 + i * 0.7),
            [-1, 1],
            [0.02, 0.05],
          );
          return (
            <line
              key={`v-${i}`}
              x1={x}
              y1="0"
              x2={x}
              y2="1920"
              stroke="#2a2d3a"
              strokeWidth="0.5"
              opacity={opacity}
            />
          );
        })}
      </svg>

      {/* Stars */}
      {stars.map((star, i) => {
        const pulse = Math.sin(frame * star.pulseSpeed + star.pulseOffset);
        const opacity = star.baseOpacity + pulse * 0.15;
        // Slow drift
        const driftX = Math.sin(frame * 0.005 + star.pulseOffset) * 3;
        const driftY = Math.cos(frame * 0.004 + star.pulseOffset) * 2;

        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: star.x + driftX,
              top: star.y + driftY,
              width: star.size,
              height: star.size,
              borderRadius: '50%',
              backgroundColor: '#e8e9ed',
              opacity,
            }}
          />
        );
      })}

      {/* Subtle radial vignette */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse at center, transparent 30%, rgba(10, 11, 14, 0.6) 100%)',
        }}
      />

      {/* Top scanline effect */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 4,
          background: `linear-gradient(90deg, transparent, rgba(231, 76, 60, ${interpolate(
            Math.sin(frame * 0.08),
            [-1, 1],
            [0, 0.15],
          )}), transparent)`,
          transform: `translateY(${(frame * 2) % 1920}px)`,
        }}
      />
    </AbsoluteFill>
  );
};
