import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { TrackerCardData } from '../../../lib/tracker-directory-utils';
import { sortByRelevance } from '../../../lib/relevance';
import ImageCarousel from './ImageCarousel';

// ── Types ──

interface Props {
  trackers: TrackerCardData[];
  basePath: string;
  followedSlugs?: string[];
}

// ── Constants ──

const AUTO_ADVANCE_DURATION_MS = 10_000;
const TICK_INTERVAL_MS = 100;
const SWIPE_THRESHOLD_PX = 50;
const PAUSE_DURATION_S = 15;

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

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600_000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function isLive(dateStr: string): boolean {
  return Date.now() - new Date(dateStr).getTime() < LIVE_THRESHOLD_MS;
}

function domainGradient(domain?: string): string {
  if (!domain) return DOMAIN_GRADIENTS.default;
  return DOMAIN_GRADIENTS[domain] ?? DOMAIN_GRADIENTS.default;
}

function filterAndSort(trackers: TrackerCardData[], followedSlugs: string[] = []): TrackerCardData[] {
  const eligible = trackers.filter((t) => t.status === 'active' && t.headline);
  return sortByRelevance(eligible, followedSlugs);
}

// ── Component ──

export default function MobileStoryCarousel({ trackers, basePath, followedSlugs = [] }: Props) {
  const eligible = useMemo(() => filterAndSort(trackers, followedSlugs), [trackers, followedSlugs]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [seenSlugs, setSeenSlugs] = useState<Set<string>>(() => new Set());
  const [progress, setProgress] = useState(0);
  const [pauseCountdown, setPauseCountdown] = useState(0);

  const touchStartY = useRef<number | null>(null);
  const circlesRef = useRef<HTMLDivElement>(null);
  const pauseTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Mark current tracker as seen when index changes
  useEffect(() => {
    if (eligible.length === 0) return;
    const slug = eligible[currentIndex]?.slug;
    if (slug) {
      setSeenSlugs((prev) => {
        if (prev.has(slug)) return prev;
        const next = new Set(prev);
        next.add(slug);
        return next;
      });
    }
  }, [currentIndex, eligible]);

  // Auto-scroll circle row to keep active circle visible
  useEffect(() => {
    const container = circlesRef.current;
    if (!container) return;
    const activeCircle = container.children[currentIndex] as HTMLElement | undefined;
    if (activeCircle) {
      activeCircle.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [currentIndex]);

  // Auto-advance timer
  useEffect(() => {
    if (paused || eligible.length === 0) return;

    const interval = setInterval(() => {
      setProgress((prev) => {
        const next = prev + TICK_INTERVAL_MS / AUTO_ADVANCE_DURATION_MS;
        if (next >= 1) {
          setCurrentIndex((idx) => (idx + 1) % eligible.length);
          return 0;
        }
        return next;
      });
    }, TICK_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [paused, eligible.length]);

  // Reset progress when currentIndex changes externally (circle tap, touch zone tap)
  const goTo = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(index, eligible.length - 1));
      setCurrentIndex(clamped);
      setProgress(0);
    },
    [eligible.length],
  );

  const goNext = useCallback(() => {
    goTo((currentIndex + 1) % eligible.length);
  }, [currentIndex, eligible.length, goTo]);

  const goPrev = useCallback(() => {
    goTo((currentIndex - 1 + eligible.length) % eligible.length);
  }, [currentIndex, eligible.length, goTo]);

  // Pause/resume with auto-resume timer
  const clearPauseTimer = useCallback(() => {
    if (pauseTimerRef.current) {
      clearInterval(pauseTimerRef.current);
      pauseTimerRef.current = null;
    }
  }, []);

  const handlePause = useCallback(() => {
    setPaused(true);
    setPauseCountdown(PAUSE_DURATION_S);
    clearPauseTimer();
    let remaining = PAUSE_DURATION_S;
    pauseTimerRef.current = setInterval(() => {
      remaining--;
      setPauseCountdown(remaining);
      if (remaining <= 0) {
        clearPauseTimer();
        setPaused(false);
        setPauseCountdown(0);
      }
    }, 1000);
  }, [clearPauseTimer]);

  const handleResume = useCallback(() => {
    clearPauseTimer();
    setPaused(false);
    setPauseCountdown(0);
  }, [clearPauseTimer]);

  const handleCardTap = useCallback(() => {
    if (paused) {
      handleResume();
    } else {
      handlePause();
    }
  }, [paused, handlePause, handleResume]);

  // Cleanup
  useEffect(() => {
    return () => clearPauseTimer();
  }, [clearPauseTimer]);

  // Swipe up detection
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (touchStartY.current === null) return;
      const deltaY = touchStartY.current - e.changedTouches[0].clientY;
      touchStartY.current = null;
      if (deltaY > SWIPE_THRESHOLD_PX && eligible[currentIndex]) {
        window.location.href = basePath + eligible[currentIndex].slug + '/';
      }
    },
    [basePath, currentIndex, eligible],
  );

  if (eligible.length === 0) return null;

  const tracker = eligible[currentIndex];

  return (
    <div className="story-carousel">
      {/* Circle row */}
      <div className="story-circles" ref={circlesRef}>
        {eligible.map((t, i) => (
          <div key={t.slug} className="story-circle" onClick={() => { goTo(i); if (paused) handleResume(); }}>
            <div
              className={`story-circle-ring${i === currentIndex ? ' active' : ''}${seenSlugs.has(t.slug) && i !== currentIndex ? ' seen' : ''}`}
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
        className={`story-card story-card-enter ${paused ? 'story-card-paused' : ''}`}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onClick={handleCardTap}
      >
        {/* Progress bars */}
        <div className="story-progress">
          {eligible.map((_, i) => (
            <div key={i} className="story-progress-segment">
              <div
                className={`story-progress-fill${i < currentIndex ? ' complete' : ''}${i > currentIndex ? ' upcoming' : ''}`}
                style={i === currentIndex ? { width: `${progress * 100}%` } : undefined}
              />
            </div>
          ))}
        </div>

        {/* Paused indicator */}
        {paused && (
          <div className="story-paused-badge">
            PAUSED · Resuming in {pauseCountdown}s
          </div>
        )}

        {/* Header */}
        <div className="story-header">
          <div className="story-avatar">{tracker.icon ?? '?'}</div>
          <div className="story-meta">
            <div className="story-name">{tracker.shortName}</div>
            <div className="story-date" suppressHydrationWarning>
              DAY {tracker.dayCount} &middot; {relativeTime(tracker.lastUpdated)}
            </div>
          </div>
          {isLive(tracker.lastUpdated) ? (
            <span className="story-live-badge" suppressHydrationWarning>{paused ? 'PAUSED' : 'LIVE'}</span>
          ) : (
            <span className="story-date" suppressHydrationWarning>{relativeTime(tracker.lastUpdated)}</span>
          )}
        </div>

        {/* Image area — carousel when paused, single image otherwise */}
        <div className="story-image" onClick={paused ? (e: React.MouseEvent) => e.stopPropagation() : undefined}>
          {paused && tracker.eventImages && tracker.eventImages.length > 1 ? (
            <div className="story-image-carousel-wrap">
              <ImageCarousel
                images={tracker.eventImages}
                autoAdvance={true}
                fallbackIcon={tracker.icon}
                fallbackDomain={tracker.domain}
              />
            </div>
          ) : (
            <StoryImage tracker={tracker} />
          )}
        </div>

        {/* Content — expanded when paused */}
        <div className="story-content">
          {tracker.headline && <p className={`story-headline ${paused ? 'story-headline-expanded' : ''}`}>{tracker.headline}</p>}
          {tracker.digestSummary && <p className={`story-summary ${paused ? 'story-summary-expanded' : ''}`}>{tracker.digestSummary}</p>}
        </div>

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

        {/* Open Dashboard link (only when paused) */}
        {paused && (
          <a
            className="story-open-link"
            href={`${basePath}${tracker.slug}/`}
            onClick={(e) => e.stopPropagation()}
          >
            Open Dashboard →
          </a>
        )}

        {/* Swipe hint */}
        <div className="story-swipe-hint">
          {paused ? 'TAP TO RESUME · SWIPE UP TO OPEN ↑' : 'TAP TO PAUSE · SWIPE UP TO OPEN ↑'}
        </div>

        {/* Touch zones (hidden when paused to allow full card tap) */}
        {!paused && (
          <>
            <div className="story-touch-left" onClick={(e) => { e.stopPropagation(); goPrev(); }} />
            <div className="story-touch-right" onClick={(e) => { e.stopPropagation(); goNext(); }} />
          </>
        )}
      </div>
    </div>
  );
}

// ── Story Image Sub-component (3-tier fallback) ──

function StoryImage({ tracker }: { tracker: TrackerCardData }) {
  // Tier 1: Event media
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
