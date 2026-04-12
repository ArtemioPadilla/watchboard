import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { TrackerCardData } from '../../../lib/tracker-directory-utils';
import { sortByRelevance } from '../../../lib/relevance';
import { haptic } from '../../../lib/haptic';
import { relativeTime } from '../../../lib/event-utils';
import ImageCarousel from './ImageCarousel';

// ── Types ──

interface Props {
  trackers: TrackerCardData[];
  basePath: string;
  followedSlugs?: string[];
  onTrackerChange?: (slug: string) => void;
}

// ── Constants ──

const AUTO_ADVANCE_DURATION_MS = 10_000;
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
const SEEN_STORAGE_KEY = 'watchboard:stories:seen';
const SEEN_TTL_MS = 24 * 3600_000; // Expire seen status after 24h

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

function filterAndSort(trackers: TrackerCardData[], followedSlugs: string[] = []): TrackerCardData[] {
  const eligible = trackers.filter((t) => t.status === 'active' && t.headline);
  return sortByRelevance(eligible, followedSlugs);
}

// ── Component ──

export default function MobileStoryCarousel({ trackers, basePath, followedSlugs = [], onTrackerChange }: Props) {
  const eligible = useMemo(() => filterAndSort(trackers, followedSlugs), [trackers, followedSlugs]);

  // Start at the first unseen story instead of always index 0
  const [currentIndex, setCurrentIndex] = useState(() => {
    const firstUnseen = eligible.findIndex((t) => !seenSlugs.has(t.slug));
    return firstUnseen >= 0 ? firstUnseen : 0;
  });
  const [paused, setPaused] = useState(false);
  const [seenSlugs, setSeenSlugs] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(SEEN_STORAGE_KEY);
      if (!stored) return new Set();
      const parsed: Record<string, number> = JSON.parse(stored);
      const now = Date.now();
      // Only restore entries that haven't expired
      const valid = Object.entries(parsed)
        .filter(([, ts]) => now - ts < SEEN_TTL_MS)
        .map(([slug]) => slug);
      return new Set(valid);
    } catch {
      return new Set();
    }
  });
  const [pauseCountdown, setPauseCountdown] = useState(0);

  // I4 fix: drive progress via rAF + ref to avoid 10 re-renders/sec
  const progressRef = useRef(0);
  const progressBarRef = useRef<HTMLDivElement>(null);

  const touchStartY = useRef<number | null>(null);
  const touchStartX = useRef<number | null>(null);
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
        // Persist to localStorage with timestamps
        try {
          const stored = localStorage.getItem(SEEN_STORAGE_KEY);
          const data: Record<string, number> = stored ? JSON.parse(stored) : {};
          data[slug] = Date.now();
          // Prune expired entries while we're at it
          const now = Date.now();
          for (const key of Object.keys(data)) {
            if (now - data[key] > SEEN_TTL_MS) delete data[key];
          }
          localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(data));
        } catch { /* localStorage unavailable */ }
        return next;
      });
      onTrackerChange?.(slug);
    }
  }, [currentIndex, eligible, onTrackerChange]);

  // Auto-scroll circle row to keep active circle visible
  useEffect(() => {
    const container = circlesRef.current;
    if (!container) return;
    const activeCircle = container.children[currentIndex] as HTMLElement | undefined;
    if (activeCircle) {
      activeCircle.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [currentIndex]);

  // I4 fix: auto-advance via rAF — direct DOM update, no state re-renders
  useEffect(() => {
    if (paused || eligible.length === 0) return;
    let start = performance.now();
    let rafId: number;

    const tick = (now: number) => {
      const pct = Math.min((now - start) / AUTO_ADVANCE_DURATION_MS, 1);
      progressRef.current = pct;
      if (progressBarRef.current) {
        progressBarRef.current.style.width = `${pct * 100}%`;
      }
      if (pct >= 1) {
        setCurrentIndex(idx => (idx + 1) % eligible.length);
        progressRef.current = 0;
        start = now;
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [paused, eligible.length]);

  // Reset rAF progress when navigating
  const resetProgress = useCallback(() => {
    progressRef.current = 0;
    if (progressBarRef.current) progressBarRef.current.style.width = '0%';
  }, []);

  const goTo = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(index, eligible.length - 1));
      setCurrentIndex(clamped);
      resetProgress();
    },
    [eligible.length, resetProgress],
  );

  const goNext = useCallback(() => {
    setCurrentIndex(idx => (idx + 1) % eligible.length);
    resetProgress();
  }, [eligible.length, resetProgress]);

  const goPrev = useCallback(() => {
    setCurrentIndex(idx => (idx - 1 + eligible.length) % eligible.length);
    resetProgress();
  }, [eligible.length, resetProgress]);

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

  // Swipe detection: horizontal (#5) + vertical (existing)
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

      // Horizontal swipe to navigate between stories
      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > SWIPE_THRESHOLD_PX) {
        if (deltaX > 0) { goNext(); haptic(); } // swipe left = next
        else { goPrev(); haptic(); }             // swipe right = prev
        return;
      }
    },
    [goNext, goPrev],
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
        {/* Progress bars — I4: current bar driven by rAF ref, no state re-renders */}
        <div className="story-progress">
          {eligible.map((_, i) => (
            <div key={i} className="story-progress-segment">
              <div
                ref={i === currentIndex ? progressBarRef : undefined}
                className={`story-progress-fill${i < currentIndex ? ' complete' : ''}${i > currentIndex ? ' upcoming' : ''}`}
                style={i === currentIndex ? { width: '0%' } : undefined}
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
        </div>

        {/* Briefing */}
        {(tracker.digestSummary || tracker.description) && (
          <div className={`story-briefing ${paused ? 'story-briefing-expanded' : ''}`}>
            <div className="story-briefing-label">
              <span className="story-briefing-dot" />
              BRIEFING
              {tracker.digestSectionsUpdated && tracker.digestSectionsUpdated.length > 0 && (
                <span className="story-briefing-sections">
                  {tracker.digestSectionsUpdated.length} sections updated
                </span>
              )}
            </div>
            <p className="story-briefing-text">
              {tracker.digestSummary ?? tracker.description}
            </p>
          </div>
        )}

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
          Read more →
        </a>

        {/* Swipe hint */}
        <div className="story-swipe-hint">
          {paused ? 'TAP TO RESUME' : '\u2190 SWIPE \u2192 \u00b7 TAP TO PAUSE'}
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
