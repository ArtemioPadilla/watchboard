import React from 'react';
import { Composition } from 'remotion';
import { Video, calculateDuration } from './Video';
import { SAMPLE_DATA } from './data/types';

export const RemotionRoot: React.FC = () => {
  const trackerCount = Math.min(SAMPLE_DATA.trackers.length, 3);
  const durationInFrames = calculateDuration(trackerCount);

  return (
    <>
      <Composition
        id="WatchboardDaily"
        component={Video}
        durationInFrames={durationInFrames}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          data: SAMPLE_DATA,
          geoFeatures: [],
          earthTexture: '',
          theme: 'dark',
        }}
      />
      {/* Preview compositions for individual sections */}
      <Composition
        id="WatchboardDaily-Short"
        component={Video}
        durationInFrames={calculateDuration(1)}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          data: {
            ...SAMPLE_DATA,
            trackers: SAMPLE_DATA.trackers.slice(0, 1),
          },
          geoFeatures: [],
          theme: 'dark' as const,
        }}
      />
    </>
  );
};

import { registerRoot } from 'remotion';
registerRoot(RemotionRoot);
