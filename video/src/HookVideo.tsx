import React from 'react';
import { AbsoluteFill, Sequence, Audio, staticFile } from 'remotion';
import { Hook } from './components/Hook';
import { Cta } from './components/Cta';
import { TrackerSlide } from './components/TrackerSlide';
import { Background } from './components/Background';
import { DEFAULT_SLIDE_STYLE, mergeStyle, type SlideStyle } from './data/slide-style';
import { SAMPLE_DATA, type BreakingData } from './data/types';
import { deriveHookHeadline } from './data/hook-headline';

/**
 * Hook-first variant, proposed in #157.
 *
 * Deliberately a SEPARATE composition rather than a rewrite of `Video`. The
 * daily brief publishes unattended every night; swapping its structure on the
 * strength of a proposal, before anyone has watched the result, risks a week of
 * bad videos going out before the problem is noticed. Render both in Studio,
 * compare, then decide.
 *
 * Structure, and where it departs from the issue:
 *
 *   Hook     0-59    (2s)   the top-ranked headline, no logo, no date
 *   Slide 1  60-209  (5s)   the hook's own tracker, in depth
 *   Slide 2  210-329 (4s)   secondary
 *   Slide 3  330-449 (4s)   secondary
 *   CTA      450-539 (3s)
 *
 *   Total 540 frames = 18s
 *
 * The issue describes a 60-second cut. The current brief is 23s, and stretching
 * it 2.6x to fill a proposed timeline would be a much larger bet than the one
 * being tested here — which is only whether opening on a headline beats opening
 * on a logo. Secondary slides are shortened rather than lengthened, which is
 * also the issue's own "faster cuts, not 1s fades" instinct.
 */

const HOOK_FRAMES = 60;
const LEAD_SLIDE_FRAMES = 150;
const SECONDARY_SLIDE_FRAMES = 120;
const CTA_FRAMES = 90;

export function calculateHookDuration(trackerCount: number): number {
  const secondaries = Math.max(0, Math.min(trackerCount, 3) - 1);
  return HOOK_FRAMES + LEAD_SLIDE_FRAMES + secondaries * SECONDARY_SLIDE_FRAMES + CTA_FRAMES;
}

export interface HookVideoProps {
  /** Optional with a SAMPLE_DATA fallback, matching Video — Studio renders the
   *  composition before any data file exists on a fresh clone. */
  data?: BreakingData;
  theme?: 'dark' | 'day';
  slideStyle?: Partial<SlideStyle>;
  /** Overrides the derived headline — lets Studio try alternatives live. */
  hookHeadline?: string;
  hookStat?: string;
  ctaHandle?: string;
}

export const HookVideo: React.FC<HookVideoProps> = ({
  data,
  theme = 'dark',
  slideStyle,
  hookHeadline,
  hookStat,
  ctaHandle,
}) => {
  const S: SlideStyle = mergeStyle(DEFAULT_SLIDE_STYLE, slideStyle);
  const breakingData = data ?? SAMPLE_DATA;
  const trackers = breakingData.trackers.slice(0, 3);
  const lead = trackers[0];

  // Raw tracker headlines are dashboard copy — several developments joined by
  // semicolons — and rendering one at display size fills half the frame. See
  // deriveHookHeadline. This is a deterministic floor, not a substitute for
  // the generated hooks #157 asks for.
  const headline = hookHeadline ?? deriveHookHeadline(lead?.headline, lead?.name ?? 'Breaking');
  const accent = theme === 'day' ? '#27ae60' : '#e74c3c';

  return (
    <AbsoluteFill style={{ backgroundColor: theme === 'day' ? '#f4f4f2' : '#08090c' }}>
      <Background theme={theme} />

      <Sequence from={0} durationInFrames={HOOK_FRAMES} name="Hook">
        <Hook headline={headline} stat={hookStat} theme={theme} accent={accent} />
      </Sequence>

      {trackers.map((t, i) => {
        const from = i === 0
          ? HOOK_FRAMES
          : HOOK_FRAMES + LEAD_SLIDE_FRAMES + (i - 1) * SECONDARY_SLIDE_FRAMES;
        const duration = i === 0 ? LEAD_SLIDE_FRAMES : SECONDARY_SLIDE_FRAMES;
        return (
          <Sequence key={t.slug ?? i} from={from} durationInFrames={duration} name={`Slide ${i + 1}`}>
            <TrackerSlide
              tracker={t}
              accentColor={accent}
              thumbnailBase64={t.thumbnailBase64}
              theme={theme}
              style={S}
            />
          </Sequence>
        );
      })}

      <Sequence
        from={calculateHookDuration(trackers.length) - CTA_FRAMES}
        durationInFrames={CTA_FRAMES}
        name="CTA"
      >
        <Cta handle={ctaHandle} theme={theme} accent={accent} />
      </Sequence>

      <Audio src={staticFile('bg-music.mp3')} volume={0.6} loop />
    </AbsoluteFill>
  );
};
