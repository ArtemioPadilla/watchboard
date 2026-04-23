import { memo } from 'react';
import type { TrackerCardData } from '../../../lib/tracker-directory-utils';
import { relativeTime } from '../../../lib/event-utils';
import { t, type Locale } from '../../../i18n/translations';

const DOMAIN_GRADIENTS: Record<string, string> = {
  military: 'linear-gradient(135deg, #1a0a0a, #2c1010, #0d1117)',
  conflict: 'linear-gradient(135deg, #1a0a0a, #2c1010, #0d1117)',
  politics: 'linear-gradient(135deg, #0a0a1a, #101030, #0d1117)',
  sports: 'linear-gradient(135deg, #0a1a0a, #102010, #0d1117)',
  crisis: 'linear-gradient(135deg, #1a0f00, #2c1a05, #0d1117)',
  culture: 'linear-gradient(135deg, #1a0a1a, #2c102c, #0d1117)',
  default: 'linear-gradient(135deg, #12141a, #181b23, #0d1117)',
};

interface Props {
  tracker: TrackerCardData;
  isBroadcastFeatured: boolean;
  basePath: string;
  locale: Locale;
  onSelect: (slug: string) => void;
}

export default memo(function HeroCard({
  tracker,
  isBroadcastFeatured,
  basePath: _basePath,
  locale,
  onSelect,
}: Props) {
  const thumbUrl = tracker.latestEventMedia?.url ?? tracker.eventImages?.[0]?.url ?? null;
  const gradient = DOMAIN_GRADIENTS[tracker.domain ?? 'default'] ?? DOMAIN_GRADIENTS.default;
  const headline = (locale === 'es' && tracker.headlineEs) ? tracker.headlineEs : tracker.headline;
  const source = tracker.latestEventMedia?.source;
  const tier = tracker.latestEventMedia?.tier;

  const handleClick = () => onSelect(tracker.slug);
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(tracker.slug);
    }
  };

  return (
    <div
      className={`cc-hero-card${isBroadcastFeatured ? ' cc-hero-card-live' : ''}`}
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-label={`Open ${tracker.shortName} dashboard`}
    >
      <div
        className="cc-hero-thumb"
        style={thumbUrl ? undefined : { background: gradient }}
      >
        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <span className="cc-hero-thumb-icon">{tracker.icon ?? '?'}</span>
        )}
      </div>
      <div className="cc-hero-body">
        <div className="cc-hero-context">
          {tracker.dayCount > 0 && `${t('hero.day', locale)} ${tracker.dayCount} · `}
          {(tracker.domain ?? '').toUpperCase()}
        </div>
        <div className="cc-hero-name-row">
          <span className="cc-hero-name">{tracker.shortName}</span>
          {isBroadcastFeatured && (
            <span className="cc-hero-live" role="status" aria-label="Currently featured by broadcast">
              <span className="cc-hero-live-dot" />LIVE
            </span>
          )}
        </div>
        {headline && <div className="cc-hero-headline">{headline}</div>}
        <div className="cc-hero-meta">
          {source && tier != null && (
            <span className="cc-hero-source">T{tier} · {source}</span>
          )}
          <span className="cc-hero-time" suppressHydrationWarning>
            {relativeTime(tracker.lastUpdated).toUpperCase()}
          </span>
        </div>
      </div>
    </div>
  );
});
