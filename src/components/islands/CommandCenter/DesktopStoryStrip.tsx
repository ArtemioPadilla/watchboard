import { useRef, useEffect, useMemo } from 'react';
import type { TrackerCardData } from '../../../lib/tracker-directory-utils';
import { relativeTime } from '../../../lib/event-utils';
import { t, getPreferredLocale } from '../../../i18n/translations';

// ── Types ──

interface Props {
  basePath: string;
  trackerQueue: TrackerCardData[];
  featuredTracker: TrackerCardData | null;
  currentIndex: number;
  progress: number;            // 0..1
  isPaused: boolean;
  pauseCountdown: number;
  onCircleClick: (slug: string) => void;
  onCardClick: () => void;
}

// ── Constants ──

const MAX_CIRCLES = 20;

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
  basePath,
  trackerQueue,
  featuredTracker,
  currentIndex,
  progress,
  isPaused,
  pauseCountdown,
  onCircleClick,
  onCardClick,
}: Props) {
  const locale = getPreferredLocale();
  const circlesRef = useRef<HTMLDivElement>(null);
  const seenRef = useRef<Set<string>>(new Set());

  // Accumulate "seen" slugs as cycle advances
  useEffect(() => {
    if (featuredTracker) seenRef.current.add(featuredTracker.slug);
  }, [featuredTracker]);

  // Auto-scroll circle column to keep active circle visible
  useEffect(() => {
    const container = circlesRef.current;
    if (!container) return;
    const activeCircle = container.children[currentIndex] as HTMLElement | undefined;
    if (activeCircle) {
      activeCircle.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [currentIndex]);

  const visibleCircles = useMemo(
    () => trackerQueue.slice(0, MAX_CIRCLES),
    [trackerQueue],
  );

  if (visibleCircles.length === 0 || !featuredTracker) return null;

  const kpis = featuredTracker.topKpis.slice(0, 2);
  const progressPct = Math.max(0, Math.min(100, progress * 100));

  return (
    <div className="desktop-story-strip">
      {/* Circle column */}
      <div className="desktop-story-circles" ref={circlesRef}>
        {visibleCircles.map((tr, i) => (
          <div
            key={tr.slug}
            className={
              `desktop-story-circle` +
              (i === currentIndex ? ' active' : '') +
              (seenRef.current.has(tr.slug) && i !== currentIndex ? ' seen' : '')
            }
            onClick={() => onCircleClick(tr.slug)}
            title={tr.shortName}
          >
            {tr.icon ?? '?'}
          </div>
        ))}
      </div>

      {/* Story card */}
      <div
        key={featuredTracker.slug}
        className="desktop-story-card desktop-story-card-enter"
        onClick={onCardClick}
      >
        {/* Single progress bar driven by broadcast progress */}
        <div className="desktop-story-progress">
          <div className="desktop-story-progress-seg">
            <div
              className="desktop-story-progress-fill"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Image */}
        <div className="desktop-story-image">
          <DesktopStoryImage tracker={featuredTracker} />
        </div>

        {/* Paused badge */}
        {isPaused && (
          <div className="desktop-story-paused">
            {t('story.paused', locale)} · {pauseCountdown}s
          </div>
        )}

        {/* Header: icon + name + age */}
        <div className="desktop-story-header">
          <span className="desktop-story-icon">{featuredTracker.icon ?? '?'}</span>
          <span className="desktop-story-name">{featuredTracker.shortName}</span>
          <span className="desktop-story-age" suppressHydrationWarning>
            {relativeTime(featuredTracker.lastUpdated)}
          </span>
        </div>

        {/* Headline */}
        {featuredTracker.headline && (
          <div className="desktop-story-content">
            <p className="desktop-story-headline">{featuredTracker.headline}</p>
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
          href={`${basePath}${featuredTracker.slug}/`}
          onClick={(e) => e.stopPropagation()}
        >
          {t('story.readMore', locale)}
        </a>
      </div>
    </div>
  );
}

// ── Image Sub-component (3-tier fallback) ──

function DesktopStoryImage({ tracker }: { tracker: TrackerCardData }) {
  const slideImage = tracker.eventImages?.[0];
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
