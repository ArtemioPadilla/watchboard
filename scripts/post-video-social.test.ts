import { describe, it, expect } from 'vitest';
import { narratedName } from './post-video-social';

/**
 * The post record's `narrationFile`.
 *
 * The workflow passes the narrated cut as the video to publish, and this
 * derivation appended the suffix a second time — every record written since
 * the narrated cut became the default names a file that has never existed:
 *
 *   "narrationFile": "watchboard-2026-10-19-narrated-en-narrated-en.mp4"
 *
 * Nothing reads the field yet. /videos could.
 */
describe('narratedName', () => {
  it('derives the narrated cut from a base render', () => {
    expect(narratedName('watchboard-2026-10-19.mp4')).toBe('watchboard-2026-10-19-narrated-en.mp4');
    expect(narratedName('watchboard-2026-10-19-progress.mp4')).toBe('watchboard-2026-10-19-progress-narrated-en.mp4');
  });

  it('leaves an already-narrated name alone, in any language', () => {
    expect(narratedName('watchboard-2026-10-19-narrated-en.mp4')).toBe('watchboard-2026-10-19-narrated-en.mp4');
    expect(narratedName('watchboard-2026-10-19-narrated-es.mp4')).toBe('watchboard-2026-10-19-narrated-es.mp4');
    expect(narratedName('watchboard-2026-10-19-progress-narrated-en.mp4')).toBe('watchboard-2026-10-19-progress-narrated-en.mp4');
  });

  it('is idempotent, which is the property that was missing', () => {
    const once = narratedName('watchboard-2026-10-19.mp4');
    expect(narratedName(once)).toBe(once);
  });
});
