import { memo, useRef, useEffect } from 'react';
import type { TrackerCardData } from '../../../lib/tracker-directory-utils';
import { relativeTime } from '../../../lib/event-utils';
import { t, type Locale } from '../../../i18n/translations';

interface Props {
  tracker: TrackerCardData;
  isHovered: boolean;
  isFollowed: boolean;
  isCompared: boolean;
  isLive: boolean;
  isDimmed: boolean;
  basePath: string;
  locale: Locale;
  onSelect: (slug: string | null) => void;
  onHover: (slug: string | null) => void;
  onToggleFollow: (slug: string) => void;
  onToggleCompare: (slug: string) => void;
}

export default memo(function FeedRow({
  tracker,
  isHovered,
  isFollowed,
  isCompared,
  isLive,
  isDimmed,
  basePath: _basePath,
  locale,
  onSelect,
  onHover,
  onToggleFollow,
  onToggleCompare,
}: Props) {
  const rowRef = useRef<HTMLDivElement>(null);

  // Auto-scroll into view when hovered (mirrors old TrackerRow behavior)
  useEffect(() => {
    if (isHovered && rowRef.current) {
      rowRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [isHovered]);

  const headline = (locale === 'es' && tracker.headlineEs) ? tracker.headlineEs : tracker.headline;

  return (
    <div
      ref={rowRef}
      className={`cc-feed-row${isLive ? ' cc-tracker-live' : ''}${isDimmed ? ' cc-feed-row-dim' : ''}`}
      data-tracker-slug={tracker.slug}
      onClick={(e) => {
        if (e.shiftKey) {
          onToggleCompare(tracker.slug);
        } else {
          onSelect(tracker.slug);
        }
      }}
      onMouseEnter={() => onHover(tracker.slug)}
      onMouseLeave={() => onHover(null)}
      title={tracker.shortName}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(tracker.slug);
        }
      }}
    >
      <span className="cc-feed-icon">{tracker.icon ?? ''}</span>
      <div className="cc-feed-body">
        <div className="cc-feed-top">
          <span className="cc-feed-name">{tracker.shortName}</span>
          {isLive && <span className="cc-feed-live-dot" role="status" aria-label="Live" />}
        </div>
        {headline && <div className="cc-feed-headline">{headline}</div>}
      </div>
      <div className="cc-feed-right">
        <span className="cc-feed-time" suppressHydrationWarning>
          {relativeTime(tracker.lastUpdated)}
        </span>
        <div className="cc-feed-actions">
          <button
            type="button"
            className={`cc-feed-action cc-feed-follow${isFollowed ? ' is-on' : ''}`}
            onClick={(e) => { e.stopPropagation(); onToggleFollow(tracker.slug); }}
            title={isFollowed ? t('sidebar.unfollow', locale) : t('sidebar.follow', locale)}
            aria-label={isFollowed ? t('sidebar.unfollow', locale) : t('sidebar.follow', locale)}
          >
            {isFollowed ? '★' : '☆'}
          </button>
          <button
            type="button"
            className={`cc-feed-action cc-feed-compare${isCompared ? ' is-on' : ''}`}
            onClick={(e) => { e.stopPropagation(); onToggleCompare(tracker.slug); }}
            title={isCompared ? t('sidebar.removeFromComparison', locale) : t('sidebar.addToComparison', locale)}
            aria-label={isCompared ? t('sidebar.removeFromComparison', locale) : t('sidebar.addToComparison', locale)}
          >
            {isCompared ? '◆' : '◇'}
          </button>
        </div>
      </div>
    </div>
  );
});
