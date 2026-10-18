import { describe, it, expect } from 'vitest';
import { selectCut } from '../video/src/select-cut.js';

describe('selectCut', () => {
  it('keeps the daily brief when nothing asks otherwise', () => {
    expect(selectCut('breaking', {})).toEqual({ cut: 'daily', compositionId: 'WatchboardDaily' });
    expect(selectCut(undefined, {})).toEqual({ cut: 'daily', compositionId: 'WatchboardDaily' });
  });

  it('switches to the hook cut on VIDEO_CUT=hook', () => {
    expect(selectCut('breaking', { VIDEO_CUT: 'hook' }))
      .toEqual({ cut: 'hook', compositionId: 'WatchboardDaily-Hook' });
  });

  it('tolerates the spacing and case a repository variable arrives with', () => {
    expect(selectCut('breaking', { VIDEO_CUT: ' Hook ' }).cut).toBe('hook');
    expect(selectCut('breaking', { VIDEO_CUT: 'HOOK' }).cut).toBe('hook');
  });

  it('ignores a value that is not a cut, rather than guessing', () => {
    for (const v of ['true', '1', 'yes', 'daily', '', '   ']) {
      expect(selectCut('breaking', { VIDEO_CUT: v }).cut, v).toBe('daily');
    }
  });

  it('never changes the progress brief, which has no hook variant', () => {
    // The progress cut is the same component with a day theme. A stray
    // variable must not silently swap it for a composition built around a
    // breaking headline.
    expect(selectCut('positive', { VIDEO_CUT: 'hook' }).compositionId).toBe('WatchboardDaily');
  });
});
