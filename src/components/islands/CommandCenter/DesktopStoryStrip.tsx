import { useRef, useEffect, useCallback } from 'react';
import type { TrackerCardData } from '../../../lib/tracker-directory-utils';
import { useStoryState } from './useStoryState';
import { relativeTime } from '../../../lib/event-utils';
import { t, getPreferredLocale } from '../../../i18n/translations';

// ── Types ──

interface Props {
  trackers: TrackerCardData[];
  basePath: string;
  followedSlugs: string[];
  onTrackerChange?: (slug: string) => void;
}

// ── Constants ──

const MAX_CIRCLES = 20;
const AUTO_ADVANCE_MS = 12_000;

const KPI_COLORS = [
  'var(--accent-red)',
  'var(--accent-amber)',
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

// ── Helpers ──

function domainGradient(domain?: string): string {
  if (!domain) return DOMAIN_GRADIENTS.default;
  return DOMAIN_GRADIENTS[domain] ?? DOMAIN_GRADIENTS.default;
}

// ── Component ──

export default function DesktopStoryStrip({
  trackers,
  basePath,
  followedSlugs,
  onTrackerChange,
}: Props) {
  const locale = getPreferredLocale();

  const story = useStoryState({
    trackers,
    followedSlugs,
    autoAdvanceMs: AUTO_ADVANCE_MS,
    onTrackerChange,
  });

  const circlesRef = useRef<HTMLDivElement>(null);

  // Auto-scroll circle column to keep active circle visible
  useEffect(() => {
    const container = circlesRef.current;
    if (!container) return;
    const activeCircle = container.children[story.currentIndex] as HTMLElement | undefined;
    if (activeCircle) {
      activeCircle.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [story.currentIndex]);

  // Circle click: go to that index and resume if paused
  const handleCircleClick = useCallback(
    (index: number) => {
      story.goTo(index);
      if (story.paused) story.handleResume();
    },
    [story.goTo, story.paused, story.handleResume],
  );

  // Card click: toggle pause/resume
  const handleCardClick = useCallback(
    (e: React.MouseEvent) => {
      // Don't toggle when clicking nav zones or links
      const target = e.target as HTMLElement;
      if (target.closest('.desktop-story-nav-left, .desktop-story-nav-right, .desktop-story-open')) return;

      if (story.paused) {
        story.handleResume();
      } else {
        story.handlePause();
      }
    },
    [story.paused, story.handlePause, story.handleResume],
  );

  // Nav zone clicks
  const handlePrev = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!story.paused) story.goPrev();
    },
    [story.paused, story.goPrev],
  );

  const handleNext = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!story.paused) story.goNext();
    },
    [story.paused, story.goNext],
  );

  if (story.eligible.length === 0) return null;

  const tracker = story.eligible[story.currentIndex];
  const slideCount = Math.max(1, tracker.eventImages?.length ?? 1);
  const kpis = tracker.topKpis.slice(0, 2);

  return (
    <div className="desktop-story-strip">
      {/* Circle column */}
      <div className="desktop-story-circles" ref={circlesRef}>
        {story.eligible.slice(0, MAX_CIRCLES).map((t, i) => (
          <div
            key={t.slug}
            className={`desktop-story-circle${i === story.currentIndex ? ' active' : ''}${story.seenSlugs.has(t.slug) && i !== story.currentIndex ? ' seen' : ''}`}
            onClick={() => handleCircleClick(i)}
            title={t.shortName}
          >
            {t.icon ?? '?'}
          </div>
        ))}
      </div>

      {/* Story card */}
      <div
        key={tracker.slug}
        className="desktop-story-card desktop-story-card-enter"
        onClick={handleCardClick}
      >
        {/* Progress bars */}
        <div className="desktop-story-progress">
          {Array.from({ length: slideCount }, (_, i) => (
            <div key={i} className="desktop-story-progress-seg">
              <div
                ref={i === story.slideIndex ? story.progressBarRef : undefined}
                className={`desktop-story-progress-fill${i < story.slideIndex ? ' complete' : ''}${i > story.slideIndex ? ' upcoming' : ''}`}
                style={i === story.slideIndex ? { width: '0%' } : undefined}
              />
            </div>
          ))}
        </div>

        {/* Image */}
        <div className="desktop-story-image">
          <DesktopStoryImage tracker={tracker} slideIndex={story.slideIndex} />
        </div>

        {/* Paused badge */}
        {story.paused && (
          <div className="desktop-story-paused">
            {t('story.paused', locale)} · {story.pauseCountdown}s
          </div>
        )}

        {/* Header: icon + name + age */}
        <div className="desktop-story-header">
          <span className="desktop-story-icon">{tracker.icon ?? '?'}</span>
          <span className="desktop-story-name">{tracker.shortName}</span>
          <span className="desktop-story-age" suppressHydrationWarning>
            {relativeTime(tracker.lastUpdated)}
          </span>
        </div>

        {/* Headline */}
        {tracker.headline && (
          <div className="desktop-story-content">
            <p className="desktop-story-headline">{tracker.headline}</p>
          </div>
        )}

        {/* KPIs (max 2) */}
        {kpis.length > 0 && (
          <div className="desktop-story-kpis">
            {kpis.map((kpi, i) => (
              <div key={i} className="desktop-story-kpi">
                <div
                  className="desktop-story-kpi-value"
                  style={{ color: KPI_COLORS[i % KPI_COLORS.length] }}
                >
                  {kpi.value}
                </div>
                <div className="desktop-story-kpi-label">{kpi.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Read More link */}
        <a
          className="desktop-story-open"
          href={`${basePath}${tracker.slug}/`}
          onClick={(e) => e.stopPropagation()}
        >
          {t('story.readMore', locale)}
        </a>

        {/* Navigation zones (hidden when paused) */}
        {!story.paused && (
          <>
            <div className="desktop-story-nav-left" onClick={handlePrev} />
            <div className="desktop-story-nav-right" onClick={handleNext} />
          </>
        )}
      </div>
    </div>
  );
}

// ── Image Sub-component (3-tier fallback) ──

function DesktopStoryImage({
  tracker,
  slideIndex = 0,
}: {
  tracker: TrackerCardData;
  slideIndex?: number;
}) {
  // Tier 0: Slide-indexed event image
  const slideImage = tracker.eventImages?.[slideIndex];
  if (slideImage) {
    return (
      <>
        <img
          src={slideImage.url}
          alt={tracker.headline ?? tracker.shortName}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
        <div className="desktop-story-image-gradient" />
      </>
    );
  }

  // Tier 1: Latest event media
  if (tracker.latestEventMedia) {
    return (
      <>
        <img
          src={tracker.latestEventMedia.url}
          alt={tracker.headline ?? tracker.shortName}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
        <div className="desktop-story-image-gradient" />
      </>
    );
  }

  // Tier 2: Domain gradient + emoji fallback
  return (
    <>
      <div
        style={{
          background: domainGradient(tracker.domain),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '36px',
          width: '100%',
          height: '100%',
        }}
      >
        {tracker.icon ?? '?'}
      </div>
      <div className="desktop-story-image-gradient" />
    </>
  );
}
