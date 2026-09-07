/**
 * media-utils.ts — which media items a surface may show.
 *
 * A thumbnail flagged `suspect` by the nightly fingerprint check is a URL
 * whose body changed since we captioned it. Showing it would attach a
 * confident caption to a photo we have not seen, so every surface treats
 * it as absent and degrades to its next fallback tier.
 */
import type { MediaItem } from './schemas';

export function isSuspectMedia(m: Pick<MediaItem, 'suspect'>): boolean {
  return m.suspect === true;
}

/** Media items safe to render (drops suspect ones, keeps order). */
export function usableMedia<T extends Pick<MediaItem, 'suspect'>>(media: readonly T[] | undefined | null): T[] {
  if (!media) return [];
  return media.filter((m) => !isSuspectMedia(m));
}

/** First usable thumbnail URL, or undefined. */
export function firstThumbnail<T extends Pick<MediaItem, 'suspect' | 'thumbnail'>>(media: readonly T[] | undefined | null): T | undefined {
  return usableMedia(media).find((m) => !!m.thumbnail);
}
