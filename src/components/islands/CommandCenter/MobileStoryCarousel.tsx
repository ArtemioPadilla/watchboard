import { useRef, useCallback, useEffect } from 'react';
import type { TrackerCardData } from '../../../lib/tracker-directory-utils';
import { haptic } from '../../../lib/haptic';
import { relativeTime } from '../../../lib/event-utils';
import { t, getPreferredLocale } from '../../../i18n/translations';
import ImageCarousel from './ImageCarousel';
import { useStoryState } from './useStoryState';

// ── Types ──

interface Props {
  trackers: TrackerCardData[];
  basePath: string;
  followedSlugs?: string[];
  onTrackerChange?: (slug: string) => void;
}

// ── Constants ──

const SWIPE_THRESHOLD_PX = 50;

const KPI_COLORS = [
  'var(--accent-red)',
  'var(--accent-amber)',
  'var(--accent-blue)',
] as const;

const DOMAIN_GRADIENTS: Record<string, string> = {
  military: 'linear-gradient(135deg, #1a0a0a, #2c1010, #0d1117)',
  conflict: 'linear-gradient(135deg, #1a0a0a, #2c1010, #0d1117)',
  politics: 'linear-gradient(135deg, #0a0a1a, #101030, #0d1117)',
  sports: 'linear-gradient(135deg, #0a1a0a, #102010, #0d1117)',
  crisis: 'linear-gradient(135deg, #1a0f00, #2c1a05, #0d1117)',
  culture: 'linear-gradient(135deg, #1a0a1a, #2c102c, #0d1117)',
  default: 'linear-gradient(135deg, #12141a, #181b23, #0d1117)',
};

const LIVE_THRESHOLD_MS = 6 * 3600_000;

// ── Helpers ──

function mapTileUrl(lat: number, lon: number, zoom = 5): string {
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lon + 180) / 360) * n);
  const y = Math.floor(
    ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n,
  );
  return `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`;
}

function isLive(dateStr: string): boolean {
  return Date.now() - new Date(dateStr).getTime() < LIVE_THRESHOLD_MS;
}

function domainGradient(domain?: string): string {
  if (!domain) return DOMAIN_GRADIENTS.default;
  return DOMAIN_GRADIENTS[domain] ?? DOMAIN_GRADIENTS.default;
}

// ── Component ──

export default function MobileStoryCarousel({ trackers, basePath, followedSlugs = [], onTrackerChange }: Props) {
  const locale = getPreferredLocale();

  const story = useStoryState({ trackers, followedSlugs, onTrackerChange });

  const touchStartY = useRef<number | null>(null);
  const touchStartX = useRef<number | null>(null);
  const circlesRef = useRef<HTMLDivElement>(null);
  const lastTapTime = useRef<number>(0);

  // Auto-scroll circle row to keep active circle visible
  useEffect(() => {
    const container = circlesRef.current;
    if (!container) return;
    const activeCircle = container.children[story.currentIndex] as HTMLElement | undefined;
    if (activeCircle) {
      activeCircle.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [story.currentIndex]);

  const handleCardTap = useCallback(() => {
    const now = Date.now();
    const DOUBLE_TAP_MS = 300;

    if (now - lastTapTime.current < DOUBLE_TAP_MS) {
      // Double tap → open tracker
      haptic();
      window.location.href = `${basePath}${story.eligible[story.currentIndex]?.slug}/`;
      return;
    }
    lastTapTime.current = now;

    // Single tap → pause/resume
    if (story.paused) {
      story.handleResume();
    } else {
      story.handlePause();
    }
  }, [story.paused, story.handlePause, story.handleResume, basePath, story.eligible, story.currentIndex]);

  // Swipe detection: horizontal + vertical
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    touchStartX.current = e.touches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (touchStartY.current === null || touchStartX.current === null) return;
      const deltaY = touchStartY.current - e.changedTouches[0].clientY;
      const deltaX = touchStartX.current - e.changedTouches[0].clientX;
      touchStartY.current = null;
      touchStartX.current = null;

      // Horizontal swipe skips entire tracker (not individual slides)
      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > SWIPE_THRESHOLD_PX) {
        if (deltaX > 0) { story.skipToNextTracker(); haptic(); } // swipe left = next tracker
        else { story.skipToPrevTracker(); haptic(); }             // swipe right = prev tracker
        return;
      }
    },
    [story.skipToNextTracker, story.skipToPrevTracker],
  );

  if (story.eligible.length === 0) return null;

  const tracker = story.eligible[story.currentIndex];

  return (
    <div className="story-carousel">
      {/* Circle row */}
      <div className="story-circles" ref={circlesRef}>
        {story.eligible.map((t, i) => (
          <div key={t.slug} className="story-circle" onClick={() => { story.goTo(i); if (story.paused) story.handleResume(); }}>
            <div
              className={`story-circle-ring${i === story.currentIndex ? ' active' : ''}${story.seenSlugs.has(t.slug) && i !== story.currentIndex ? ' seen' : ''}`}
            >
              <div className="story-circle-inner">{t.icon ?? '?'}</div>
            </div>
            <span className="story-circle-label">{t.shortName}</span>
          </div>
        ))}
      </div>

      {/* Story card */}
      <div
        key={tracker.slug}
        className={`story-card story-card-enter ${story.paused ? 'story-card-paused' : ''}`}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onClick={handleCardTap}
      >
        {/* Progress bars — one segment per slide in current tracker */}
        <div className="story-progress">
          {Array.from({ length: Math.max(1, tracker.eventImages?.length ?? 1) }, (_, i) => (
            <div key={i} className="story-progress-segment">
              <div
                ref={i === story.slideIndex ? story.progressBarRef : undefined}
                className={`story-progress-fill${i < story.slideIndex ? ' complete' : ''}${i > story.slideIndex ? ' upcoming' : ''}`}
                style={i === story.slideIndex ? { width: '0%' } : undefined}
              />
            </div>
          ))}
        </div>

        {/* Paused indicator */}
        {story.paused && (
          <div className="story-paused-badge">
            {t('story.paused', locale)} · {t('story.resumingIn', locale)} {story.pauseCountdown}s
          </div>
        )}

        {/* Header */}
        <div className="story-header">
          <div className="story-avatar">{tracker.icon ?? '?'}</div>
          <div className="story-meta">
            <div className="story-name">{tracker.shortName}</div>
            <div className="story-date" suppressHydrationWarning>
              {t('story.day', locale)} {tracker.dayCount} &middot; {relativeTime(tracker.lastUpdated)}
            </div>
          </div>
          {isLive(tracker.lastUpdated) ? (
            <span className="story-live-badge" suppressHydrationWarning>{story.paused ? t('story.paused', locale) : t('story.live', locale)}</span>
          ) : (
            <span className="story-date" suppressHydrationWarning>{relativeTime(tracker.lastUpdated)}</span>
          )}
        </div>

        {/* Image area — carousel when paused, slide-indexed image otherwise */}
        <div className="story-image">
          {story.paused && tracker.eventImages && tracker.eventImages.length > 1 ? (
            <div className="story-image-carousel-wrap">
              <ImageCarousel
                images={tracker.eventImages}
                autoAdvance={true}
                fallbackIcon={tracker.icon}
                fallbackDomain={tracker.domain}
              />
            </div>
          ) : (
            <StoryImage tracker={tracker} slideIndex={story.slideIndex} />
          )}
          {(tracker.eventImages?.length ?? 0) > 1 && !story.paused && (
            <div className="story-slide-counter">{story.slideIndex + 1}/{tracker.eventImages!.length}</div>
          )}
        </div>

        {/* Content — expanded when paused; per-slide text for slides 1+ */}
        {(() => {
          const currentSlideImage = tracker.eventImages?.[story.slideIndex];
          const displayHeadline = (story.slideIndex > 0 && currentSlideImage?.eventTitle) ? currentSlideImage.eventTitle : tracker.headline;
          const displayBriefing = (story.slideIndex > 0 && currentSlideImage?.eventDetail) ? currentSlideImage.eventDetail : (tracker.digestSummary ?? tracker.description);
          return (
            <>
              <div className="story-content">
                {displayHeadline && <p className={`story-headline ${story.paused ? 'story-headline-expanded' : ''}`}>{displayHeadline}</p>}
              </div>
              {displayBriefing && (
                <div className={`story-briefing ${story.paused ? 'story-briefing-expanded' : ''}`}>
                  <div className="story-briefing-label">
                    <span className="story-briefing-dot" />
                    {t('story.briefing', locale)}
                    {story.slideIndex === 0 && tracker.digestSectionsUpdated && tracker.digestSectionsUpdated.length > 0 && (
                      <span className="story-briefing-sections">
                        {tracker.digestSectionsUpdated.length} {t('story.sectionsUpdated', locale)}
                      </span>
                    )}
                  </div>
                  <p className="story-briefing-text">
                    {displayBriefing}
                  </p>
                </div>
              )}
            </>
          );
        })()}

        {/* KPI strip */}
        {tracker.topKpis.length > 0 && (
          <div className="story-kpis">
            {tracker.topKpis.slice(0, 3).map((kpi, i) => (
              <div key={i} className="story-kpi">
                <div className="story-kpi-value" style={{ color: KPI_COLORS[i % KPI_COLORS.length] }}>
                  {kpi.value}
                </div>
                <div className="story-kpi-label">{kpi.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Read more link (always visible) */}
        <a
          className="story-open-link"
          href={`${basePath}${tracker.slug}/`}
          onClick={(e) => e.stopPropagation()}
        >
          {t('story.readMore', locale)}
        </a>

        {/* Swipe hint */}
        <div className="story-swipe-hint">
          {story.paused ? t('story.tapToResume', locale) : t('story.swipeHint', locale)}
        </div>

        {/* Touch zones (hidden when paused to allow full card tap) */}
        {!story.paused && (
          <>
            <div className="story-touch-left" onClick={(e) => { e.stopPropagation(); story.goPrev(); }} />
            <div className="story-touch-right" onClick={(e) => { e.stopPropagation(); story.goNext(); }} />
          </>
        )}
      </div>
    </div>
  );
}

// ── Story Image Sub-component (3-tier fallback) ──

function StoryImage({ tracker, slideIndex = 0 }: { tracker: TrackerCardData; slideIndex?: number }) {
  // Tier 0: Slide-indexed event image (multi-slide stories)
  const slideImage = tracker.eventImages?.[slideIndex];
  if (slideImage) {
    return (
      <>
        <img
          src={slideImage.url}
          alt={tracker.headline ?? tracker.shortName}
          className="story-image-map"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
        <div className="story-image-gradient" />
        <span className="story-image-attribution">
          {slideImage.source} &middot; T{slideImage.tier}
        </span>
      </>
    );
  }

  // Tier 1: Latest event media (single-image fallback)
  if (tracker.latestEventMedia) {
    return (
      <>
        <img
          src={tracker.latestEventMedia.url}
          alt={tracker.headline ?? tracker.shortName}
          className="story-image-map"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
        <div className="story-image-gradient" />
        <span className="story-image-attribution">
          {tracker.latestEventMedia.source} &middot; T{tracker.latestEventMedia.tier}
        </span>
      </>
    );
  }

  // Tier 2: Map tile from mapCenter
  if (tracker.mapCenter) {
    const { lat, lon } = tracker.mapCenter;
    return (
      <>
        <img
          src={mapTileUrl(lat, lon)}
          alt={`Map near ${tracker.shortName}`}
          className="story-image-map"
          loading="lazy"
        />
        <div className="story-map-markers">
          <div className="story-map-marker" style={{ top: '50%', left: '50%' }} />
        </div>
        <div className="story-image-gradient" />
      </>
    );
  }

  // Tier 3: Domain gradient + emoji
  return (
    <>
      <div
        className="story-image-map"
        style={{
          background: domainGradient(tracker.domain),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '64px',
          width: '100%',
          height: '100%',
        }}
      >
        {tracker.icon ?? '?'}
      </div>
      <div className="story-image-gradient" />
    </>
  );
}
