import React from 'react';
import {
  AbsoluteFill,
  Sequence,
  useCurrentFrame,
  interpolate,
  Audio,
  staticFile,
} from 'remotion';
import { Background } from './components/Background';
import { CanvasGlobe } from './components/CanvasGlobe';
import { Intro } from './components/Intro';
import { TrackerSlide } from './components/TrackerSlide';
import { Outro } from './components/Outro';
import type { BreakingData, GeoFeature } from './data/types';
import { SLIDE_ACCENTS, SAMPLE_DATA } from './data/types';

/**
 * Frame layout (30fps):
 *
 * Intro:     0-89    (3s)
 * Tracker 1: 90-239  (5s)
 * Tracker 2: 240-389 (5s)  — globe ROTATES to new location (this IS the transition)
 * Tracker 3: 390-539 (5s)
 * Outro:     540-689 (5s)
 *
 * Total: 690 frames = 23s at 30fps
 */

const INTRO_FRAMES = 90;
const SLIDE_FRAMES = 150;
const OUTRO_FRAMES = 150;

interface VideoProps {
  data?: BreakingData;
  narrationSrc?: string;
  geoFeatures?: GeoFeature[];
  earthTexture?: string;
}

export const Video: React.FC<VideoProps> = ({ data, narrationSrc, geoFeatures = [], earthTexture = '' }) => {
  const breakingData = data ?? SAMPLE_DATA;
  const frame = useCurrentFrame();

  const trackerCount = Math.min(breakingData.trackers.length, 3);
  const trackers = breakingData.trackers.slice(0, 3);

  // Determine which tracker is active based on current frame
  // -1 = intro or outro (free rotation)
  const getActiveTrackerIndex = (f: number): number => {
    if (f < INTRO_FRAMES) return -1; // intro
    const afterIntro = f - INTRO_FRAMES;
    const idx = Math.floor(afterIntro / SLIDE_FRAMES);
    if (idx >= trackerCount) return -1; // outro
    return idx;
  };

  const activeTrackerIndex = getActiveTrackerIndex(frame);

  // Current accent color for the globe dot
  const currentAccent =
    activeTrackerIndex >= 0
      ? SLIDE_ACCENTS[activeTrackerIndex % SLIDE_ACCENTS.length]
      : '#e74c3c';

  // Global fade in from black
  const globalFadeIn = interpolate(frame, [0, 8], [0, 1], {
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ backgroundColor: '#0a0b0e', opacity: globalFadeIn }}>
      {/* Starfield — persistent */}
      <Background />

      {/* Globe — persistent, rotates between trackers */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '45%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <CanvasGlobe
          width={600}
          height={600}
          geoFeatures={geoFeatures}
          trackers={trackers}
          activeTrackerIndex={activeTrackerIndex}
          globalFrame={frame}
          accentColor={currentAccent}
          earthTexture={earthTexture}
        />
      </div>

      {/* Background music — loops if video is longer than track */}
      <Audio src={staticFile('bg-music.mp3')} volume={0.6} loop />

      {/* Optional narration track */}
      {narrationSrc && (
        <Sequence from={INTRO_FRAMES} name="Narration">
          <Audio src={narrationSrc} volume={0.85} />
        </Sequence>
      )}

      {/* Intro */}
      <Sequence from={0} durationInFrames={INTRO_FRAMES} name="Intro">
        <Intro date={breakingData.date} />
      </Sequence>

      {/* Tracker slides — text overlays only */}
      {trackers.map((tracker, i) => {
        const slideStart = INTRO_FRAMES + i * SLIDE_FRAMES;
        return (
          <Sequence
            key={tracker.slug}
            from={slideStart}
            durationInFrames={SLIDE_FRAMES}
            name={`Tracker: ${tracker.name}`}
          >
            <TrackerSlide
              tracker={tracker}
              accentColor={SLIDE_ACCENTS[i % SLIDE_ACCENTS.length]}
            />
          </Sequence>
        );
      })}

      {/* Outro */}
      <Sequence
        from={INTRO_FRAMES + trackerCount * SLIDE_FRAMES}
        durationInFrames={OUTRO_FRAMES}
        name="Outro"
      >
        <Outro />
      </Sequence>

      {/* Bottom-right persistent watermark */}
      <div
        style={{
          position: 'absolute',
          bottom: 40,
          right: 40,
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 14,
          color: '#5a5e6e',
          letterSpacing: '2px',
          opacity: interpolate(frame, [30, 50], [0, 0.6], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
        }}
      >
        WATCHBOARD.DEV
      </div>
    </AbsoluteFill>
  );
};

/** Calculate total duration based on number of trackers */
export function calculateDuration(trackerCount: number): number {
  const count = Math.min(Math.max(trackerCount, 1), 3);
  return INTRO_FRAMES + count * SLIDE_FRAMES + OUTRO_FRAMES;
}
