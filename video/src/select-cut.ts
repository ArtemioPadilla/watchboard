/**
 * select-cut.ts — which composition publishes, and why that is a variable.
 *
 * `WatchboardDaily-Hook` has rendered alongside the daily brief since #228 so
 * both could be compared before anything changed what goes out unattended
 * every night. Measured on the same data (#243): both carry 15.0s of news; the
 * daily spends 8.0s on a logo intro and an outro, the hook 3.0s on an on-screen
 * CTA, and the hook has a real headline on screen at ~1s against ~4s.
 *
 * Which of those is the better product is a judgement about audience, not about
 * the video, so it lives in a repository variable rather than in the renderer:
 * `VIDEO_CUT=hook` switches, anything else keeps today's behaviour. Same shape
 * as X_POSTING_ENABLED — the owner decides, the code does not.
 */

export type VideoCut = 'daily' | 'hook';

export interface CutSelection {
  cut: VideoCut;
  compositionId: 'WatchboardDaily' | 'WatchboardDaily-Hook';
}

/**
 * `mode` is the renderer's own mode string; only the breaking brief has a hook
 * variant. The progress brief is the same component with a day theme, so a
 * stray VIDEO_CUT must not silently change it.
 */
export function selectCut(mode: string | undefined, env: Record<string, string | undefined>): CutSelection {
  const asked = env.VIDEO_CUT?.trim().toLowerCase();
  const useHook = mode !== 'positive' && asked === 'hook';
  return useHook
    ? { cut: 'hook', compositionId: 'WatchboardDaily-Hook' }
    : { cut: 'daily', compositionId: 'WatchboardDaily' };
}
