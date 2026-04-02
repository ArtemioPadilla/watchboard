import { useState, useEffect, useRef, useCallback } from 'react';
import { t, getPreferredLocale } from '../../../i18n/translations';
import type { BroadcastPhase } from './useBroadcastMode';
import ImageCarousel from './ImageCarousel';
import { useDragScrub } from './useDragScrub';

interface TrackerForOverlay {
  slug: string;
  shortName: string;
  icon?: string;
  headline?: string;
  domain?: string;
  color?: string;
  topKpis: Array<{ value: string; label: string }>;
  latestEventMedia?: { url: string; source: string; tier: number };
  eventImages?: Array<{ url: string; source: string; tier: number }>;
  mapCenter?: { lon: number; lat: number };
  dayCount?: number;
  digestSummary?: string;
}

interface BroadcastOverlayProps {
  featuredTracker: TrackerForOverlay | null;
  phase: BroadcastPhase;
  progress: number;
  trackerQueue: TrackerForOverlay[];
  currentIndex: number;
  onJumpTo: (slug: string) => void;
  isUserPaused: boolean;
  pauseCountdown: number;
  onUserPause: () => void;
  onUserResume: () => void;
  onResetPauseTimer: () => void;
  onGoToNext: () => void;
  onGoToPrev: () => void;
  basePath: string;
}

const HOVER_GRACE_MS = 500;

export default function BroadcastOverlay({
  featuredTracker,
  phase,
  progress,
  trackerQueue,
  currentIndex,
  onJumpTo,
  isUserPaused,
  pauseCountdown,
  onUserPause,
  onUserResume,
  onResetPauseTimer,
  onGoToNext,
  onGoToPrev,
  basePath,
}: BroadcastOverlayProps) {
  const locale = getPreferredLocale();
  const isPaused = phase === 'paused';
  const isVisible = phase === 'dwelling' || phase === 'transitioning';
  const graceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickerTrackRef = useRef<HTMLDivElement>(null);
  const activeItemRefs = useRef<Map<number, HTMLSpanElement>>(new Map());

  // Ticker: scroll to center the active item whenever currentIndex changes
  // The broadcast cycle drives the ticker position, keeping card + ticker in sync
  useEffect(() => {
    const el = activeItemRefs.current.get(currentIndex);
    if (el && tickerTrackRef.current) {
      const track = tickerTrackRef.current;
      const itemLeft = el.offsetLeft;
      const itemWidth = el.offsetWidth;
      const trackWidth = track.clientWidth;
      const targetScroll = itemLeft - (trackWidth / 2) + (itemWidth / 2);
      track.scrollTo({ left: Math.max(0, targetScroll), behavior: 'smooth' });
    }
  }, [currentIndex]);

  // Hover grace period for moving between card and ticker
  const handleMouseEnter = useCallback(() => {
    if (graceTimerRef.current) {
      clearTimeout(graceTimerRef.current);
      graceTimerRef.current = null;
    }
    if (!isUserPaused) {
      onUserPause();
    }
  }, [isUserPaused, onUserPause]);

  const handleMouseLeave = useCallback(() => {
    if (!isUserPaused) return;
    graceTimerRef.current = setTimeout(() => {
      onUserResume();
    }, HOVER_GRACE_MS);
  }, [isUserPaused, onUserResume]);

  // Cleanup grace timer
  useEffect(() => {
    return () => {
      if (graceTimerRef.current) clearTimeout(graceTimerRef.current);
    };
  }, []);

  // Ticker: detect which item is centered after user scrolls, update card to match
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userScrollingRef = useRef(false);

  const handleTickerScroll = useCallback(() => {
    // Mark as user-initiated scroll
    if (!userScrollingRef.current) {
      userScrollingRef.current = true;
      if (!isUserPaused) onUserPause();
    }
    // Debounce: detect centered item after scroll stops
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      userScrollingRef.current = false;
      const track = tickerTrackRef.current;
      if (!track) return;
      const trackCenter = track.scrollLeft + track.clientWidth / 2;
      let closestIdx = 0;
      let closestDist = Infinity;
      activeItemRefs.current.forEach((el, idx) => {
        const itemCenter = el.offsetLeft + el.offsetWidth / 2;
        const dist = Math.abs(itemCenter - trackCenter);
        if (dist < closestDist) {
          closestDist = dist;
          closestIdx = idx;
        }
      });
      if (closestIdx !== currentIndex) {
        onJumpTo(trackerQueue[closestIdx]?.slug);
        onResetPauseTimer();
      }
    }, 200);
  }, [isUserPaused, onUserPause, currentIndex, onJumpTo, trackerQueue, onResetPauseTimer]);

  // Cleanup scroll timeout
  useEffect(() => {
    return () => { if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current); };
  }, []);

  // Mouse drag-to-scroll with inertia
  const dragStartXRef = useRef<number | null>(null);
  const dragScrollStartRef = useRef(0);
  const dragLastXRef = useRef(0);
  const dragVelocityRef = useRef(0);
  const inertiaRafRef = useRef<number>(0);
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    cancelAnimationFrame(inertiaRafRef.current);
    dragStartXRef.current = e.clientX;
    dragLastXRef.current = e.clientX;
    dragVelocityRef.current = 0;
    dragScrollStartRef.current = tickerTrackRef.current?.scrollLeft ?? 0;
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;
    const onMouseMove = (e: MouseEvent) => {
      if (dragStartXRef.current === null || !tickerTrackRef.current) return;
      const dx = dragStartXRef.current - e.clientX;
      tickerTrackRef.current.scrollLeft = dragScrollStartRef.current + dx;
      // Track velocity for inertia
      dragVelocityRef.current = dragLastXRef.current - e.clientX;
      dragLastXRef.current = e.clientX;
    };
    const onMouseUp = () => {
      dragStartXRef.current = null;
      setIsDragging(false);
      // Apply inertia
      let velocity = dragVelocityRef.current;
      const friction = 0.95;
      const tick = () => {
        if (Math.abs(velocity) < 0.5 || !tickerTrackRef.current) return;
        tickerTrackRef.current.scrollLeft += velocity;
        velocity *= friction;
        inertiaRafRef.current = requestAnimationFrame(tick);
      };
      inertiaRafRef.current = requestAnimationFrame(tick);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isDragging]);

  // Cleanup inertia on unmount
  useEffect(() => {
    return () => cancelAnimationFrame(inertiaRafRef.current);
  }, []);

  // Card drag (swipe left/right on the lower-third)
  const cardDrag = useDragScrub({
    onPrev: () => { onGoToPrev(); onResetPauseTimer(); },
    onNext: () => { onGoToNext(); onResetPauseTimer(); },
    onDragStart: () => { if (!isUserPaused) onUserPause(); },
  });

  // Double-click card → navigate
  const handleCardDoubleClick = useCallback(() => {
    if (featuredTracker) {
      window.location.href = `${basePath}${featuredTracker.slug}/`;
    }
  }, [featuredTracker, basePath]);

  // Click ticker item → jump + pause
  const handleTickerItemClick = useCallback((slug: string) => {
    onJumpTo(slug);
    if (!isUserPaused) {
      onUserPause();
    } else {
      onResetPauseTimer();
    }
  }, [onJumpTo, isUserPaused, onUserPause, onResetPauseTimer]);

  return (
    <>
      {/* Dim overlay when user-paused */}
      {isUserPaused && (
        <div className="broadcast-dim-overlay" />
      )}

      {/* LIVE / PAUSED Badge */}
      <div className={`broadcast-live-badge ${isPaused ? 'paused' : ''}`}>
        <div className="broadcast-live-dot" />
        <span className="broadcast-live-text">
          {isPaused ? t('broadcast.paused', locale) : t('broadcast.live', locale)}
        </span>
      </div>

      {/* Auto-resume countdown */}
      {isUserPaused && pauseCountdown > 0 && (
        <div className="broadcast-countdown-badge">
          ▶ Resuming in {pauseCountdown}s
        </div>
      )}

      {/* Lower-Third — compact or expanded */}
      {featuredTracker && (
        <div
          className={`broadcast-lower-third ${isVisible || isUserPaused ? 'visible' : ''} ${isUserPaused ? 'expanded' : ''}`}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onClick={() => { if (!isUserPaused) onUserPause(); else onResetPauseTimer(); }}
          onDoubleClick={handleCardDoubleClick}
          {...cardDrag.handlers}
        >
          <div
            className="broadcast-lt-accent"
            style={{ background: featuredTracker.color || 'var(--accent-blue)' }}
          />
          <div className="broadcast-lt-body">
            {isUserPaused ? (
              /* ── Expanded layout ── */
              <div className="broadcast-lt-expanded">
                <div className="broadcast-lt-expanded-text">
                  <div className="broadcast-lt-category">
                    {featuredTracker.domain?.toUpperCase()}
                    {featuredTracker.dayCount != null && ` · DAY ${featuredTracker.dayCount}`}
                  </div>
                  <div className="broadcast-lt-name">
                    {featuredTracker.icon} {featuredTracker.shortName}
                  </div>
                  {featuredTracker.headline && (
                    <div className="broadcast-lt-headline">{featuredTracker.headline}</div>
                  )}
                  {featuredTracker.digestSummary && (
                    <div className="broadcast-lt-digest">{featuredTracker.digestSummary}</div>
                  )}
                  {featuredTracker.topKpis.length > 0 && (
                    <div className="broadcast-lt-kpis-row">
                      {featuredTracker.topKpis.slice(0, 3).map((kpi, i) => (
                        <div key={i} className="broadcast-lt-kpi-item">
                          <span className={`broadcast-lt-kpi-value kpi-color-${i}`}>{kpi.value}</span>
                          <span className="broadcast-lt-kpi-label">{kpi.label}</span>
                          {i < Math.min(featuredTracker.topKpis.length, 3) - 1 && (
                            <div className="broadcast-lt-kpi-divider" />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <a
                    className="broadcast-lt-open-link"
                    href={`${basePath}${featuredTracker.slug}/`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    Open Dashboard →
                  </a>
                </div>
                <div className="broadcast-lt-expanded-image">
                  <ImageCarousel
                    images={featuredTracker.eventImages || []}
                    autoAdvance={true}
                    fallbackIcon={featuredTracker.icon}
                    fallbackDomain={featuredTracker.domain}
                  />
                </div>
              </div>
            ) : (
              /* ── Compact layout with optional thumbnail ── */
              <div className="broadcast-lt-compact">
                {featuredTracker.latestEventMedia && (
                  <img
                    className="broadcast-lt-compact-thumb"
                    src={featuredTracker.latestEventMedia.url}
                    alt=""
                    referrerPolicy="no-referrer"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                )}
                <div className="broadcast-lt-compact-text">
                  {featuredTracker.domain && (
                    <div className="broadcast-lt-category">{featuredTracker.domain.toUpperCase()}</div>
                  )}
                  <div className="broadcast-lt-name">
                    {featuredTracker.icon} {featuredTracker.shortName}
                  </div>
                  {featuredTracker.headline && (
                    <div className="broadcast-lt-headline">{featuredTracker.headline}</div>
                  )}
                  {featuredTracker.topKpis?.[0] && (
                    <div className="broadcast-lt-kpi">
                      <span className="broadcast-lt-kpi-value">{featuredTracker.topKpis[0].value}</span>
                      <span className="broadcast-lt-kpi-label">{featuredTracker.topKpis[0].label}</span>
                    </div>
                  )}
                  <div className="broadcast-lt-progress">
                    <div
                      className="broadcast-lt-progress-fill"
                      style={{ width: `${progress * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* News Ticker */}
      {trackerQueue.length > 0 && (
        <div
          className="broadcast-ticker"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <div className="broadcast-ticker-label">WATCHBOARD</div>
          <div
            className="broadcast-ticker-track"
            ref={tickerTrackRef}
            onScroll={handleTickerScroll}
            onMouseDown={handleMouseDown}
            style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
          >
            {trackerQueue.map((tr, i) => (
              <span
                key={tr.slug}
                ref={(el) => { if (el) activeItemRefs.current.set(i, el); }}
                className={`broadcast-ticker-item ${i === currentIndex ? 'active' : ''}`}
                onClick={(e) => { e.stopPropagation(); handleTickerItemClick(tr.slug); }}
              >
                {tr.icon} {tr.shortName} — {tr.headline || 'Tracking...'}
                {i < trackerQueue.length - 1 && <span className="broadcast-ticker-separator">|</span>}
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
