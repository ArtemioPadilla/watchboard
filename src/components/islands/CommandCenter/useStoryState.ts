import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { TrackerCardData } from '../../../lib/tracker-directory-utils';
import { sortByRelevance } from '../../../lib/relevance';

// ── Constants ──

const SEEN_STORAGE_KEY = 'watchboard:stories:seen';
const SEEN_TTL_MS = 24 * 3600_000;
const DEFAULT_AUTO_ADVANCE_MS = 10_000;
const PAUSE_DURATION_S = 15;

// ── Types ──

export interface UseStoryStateOptions {
  trackers: TrackerCardData[];
  followedSlugs?: string[];
  autoAdvanceMs?: number;
  enabled?: boolean;
  onTrackerChange?: (slug: string) => void;
  /**
   * Per-slug slide count source, sourced from the lazy-fetched
   * TrackerCardDetail. The shell trackers passed in `trackers` no longer
   * carry `eventImages` (it lives in /api/cards/{slug}.json), so callers
   * supply this lookup so goNext/goPrev can read fresh slide counts as
   * details stream in. Returning undefined falls back to 1 slide.
   */
  getSlideCount?: (slug: string) => number | undefined;
}

export interface StoryState {
  eligible: TrackerCardData[];
  currentIndex: number;
  slideIndex: number;
  paused: boolean;
  pauseCountdown: number;
  seenSlugs: Set<string>;
  progressRef: React.RefObject<number>;
  progressBarRef: React.RefObject<HTMLDivElement | null>;
  goTo: (index: number) => void;
  goNext: () => void;
  goPrev: () => void;
  skipToNextTracker: () => void;
  skipToPrevTracker: () => void;
  handlePause: () => void;
  handleResume: () => void;
}

// ── Helpers ──

function filterAndSort(
  trackers: TrackerCardData[],
  followedSlugs: string[] = [],
  seenSlugs: Set<string> = new Set(),
): TrackerCardData[] {
  const eligible = trackers.filter((t) => t.status === 'active' && t.headline);
  const sorted = sortByRelevance(eligible, followedSlugs);
  // Move already-seen stories to the end (like Instagram)
  const unseen = sorted.filter((t) => !seenSlugs.has(t.slug));
  const seen = sorted.filter((t) => seenSlugs.has(t.slug));
  return [...unseen, ...seen];
}

// ── Hook ──

export function useStoryState(options: UseStoryStateOptions): StoryState {
  const {
    trackers,
    followedSlugs = [],
    autoAdvanceMs = DEFAULT_AUTO_ADVANCE_MS,
    enabled = true,
    onTrackerChange,
    getSlideCount,
  } = options;

  // Stable ref so goNext/goPrev callbacks don't have to re-bind every render
  // when getSlideCount identity changes.
  const getSlideCountRef = useRef(getSlideCount);
  useEffect(() => {
    getSlideCountRef.current = getSlideCount;
  }, [getSlideCount]);

  // Initial seen set is read from localStorage AFTER mount via useEffect, not
  // synchronously — otherwise the SSR pass (no localStorage) and the first
  // client render disagree on story order, throwing React error #418
  // (hydration text mismatch) and forcing React to discard the SSR'd LCP
  // element. Starting empty keeps server/client identical on first render.
  const [initialSeenSlugs, setInitialSeenSlugs] = useState<Set<string>>(() => new Set());

  const eligible = useMemo(
    () => filterAndSort(trackers, followedSlugs, initialSeenSlugs),
    [trackers, followedSlugs, initialSeenSlugs],
  );

  const [seenSlugs, setSeenSlugs] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    try {
      const stored = localStorage.getItem(SEEN_STORAGE_KEY);
      if (!stored) return;
      const parsed: Record<string, { seenAt: number; dataVersion: string } | number> = JSON.parse(stored);
      const now = Date.now();
      const valid = Object.entries(parsed)
        .filter(([slug, entry]) => {
          if (typeof entry === 'number') return now - entry < SEEN_TTL_MS;
          if (now - entry.seenAt > SEEN_TTL_MS) return false;
          const tracker = trackers.find((t) => t.slug === slug);
          if (tracker && tracker.lastUpdated && entry.dataVersion !== tracker.lastUpdated) return false;
          return true;
        })
        .map(([slug]) => slug);
      if (valid.length === 0) return;
      const next = new Set(valid);
      setInitialSeenSlugs(next);
      setSeenSlugs(next);
    } catch {
      // localStorage unavailable; stay with empty default
    }
  }, [trackers]);

  // Start at index 0 to match SSR; jump to first unseen once seen-set loads
  const [currentIndex, setCurrentIndex] = useState(0);
  useEffect(() => {
    if (seenSlugs.size === 0) return;
    const firstUnseen = eligible.findIndex((t) => !seenSlugs.has(t.slug));
    if (firstUnseen > 0) setCurrentIndex(firstUnseen);
    // Only run once when seenSlugs populates from localStorage
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seenSlugs.size > 0]);
  const [slideIndex, setSlideIndex] = useState(0);
  const slideIndexRef = useRef(0);
  const [paused, setPaused] = useState(false);
  const [pauseCountdown, setPauseCountdown] = useState(0);

  // Keep slideIndex ref in sync with state
  useEffect(() => {
    slideIndexRef.current = slideIndex;
  }, [slideIndex]);

  // rAF-based progress (no state re-renders)
  const progressRef = useRef(0);
  const progressBarRef = useRef<HTMLDivElement>(null);

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
        // Persist to localStorage with timestamps + data version
        try {
          const stored = localStorage.getItem(SEEN_STORAGE_KEY);
          const data: Record<string, { seenAt: number; dataVersion: string } | number> = stored
            ? JSON.parse(stored)
            : {};
          const currentTracker = eligible[currentIndex];
          data[slug] = { seenAt: Date.now(), dataVersion: currentTracker?.lastUpdated || '' };
          // Prune expired entries while we're at it
          const now = Date.now();
          for (const key of Object.keys(data)) {
            const entry = data[key];
            const seenAt = typeof entry === 'number' ? entry : entry.seenAt;
            if (now - seenAt > SEEN_TTL_MS) delete data[key];
          }
          localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(data));
        } catch {
          /* localStorage unavailable */
        }
        return next;
      });
      onTrackerChange?.(slug);
    }
  }, [currentIndex, eligible, onTrackerChange]);

  // Reset rAF progress when navigating
  const resetProgress = useCallback(() => {
    progressRef.current = 0;
    if (progressBarRef.current) progressBarRef.current.style.width = '0%';
  }, []);

  const goTo = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(index, eligible.length - 1));
      setCurrentIndex(clamped);
      slideIndexRef.current = 0;
      setSlideIndex(0);
      resetProgress();
    },
    [eligible.length, resetProgress],
  );

  // Tap-right and auto-advance: advance slide first, then tracker.
  // Slide count comes from the lazy-fetched detail via getSlideCount() when
  // available, otherwise falls back to whatever shell.eventImages still
  // carries (will be 0/undefined post-shell-split, so 1 slide).
  const goNext = useCallback(() => {
    const current = eligible[currentIndex];
    const fromDetail = current?.slug ? getSlideCountRef.current?.(current.slug) : undefined;
    const slides = Math.max(1, fromDetail ?? current?.eventImages?.length ?? 1);
    if (slideIndexRef.current < slides - 1) {
      const next = slideIndexRef.current + 1;
      slideIndexRef.current = next;
      setSlideIndex(next);
    } else {
      slideIndexRef.current = 0;
      setSlideIndex(0);
      setCurrentIndex((idx) => (idx + 1) % eligible.length);
    }
    resetProgress();
  }, [eligible, currentIndex, eligible.length, resetProgress]);

  // Tap-left: go back a slide, then previous tracker (landing on its last
  // slide). When jumping back, slide count for the previous tracker isn't
  // known yet (its detail might not be in cache), so we land on slide 0 and
  // trust the prefetch path to fill in. Caller can re-trigger goNext to walk
  // forward once detail loads.
  const goPrev = useCallback(() => {
    if (slideIndexRef.current > 0) {
      const prev = slideIndexRef.current - 1;
      slideIndexRef.current = prev;
      setSlideIndex(prev);
    } else {
      setCurrentIndex((idx) => {
        const prevIdx = (idx - 1 + eligible.length) % eligible.length;
        const prevTracker = eligible[prevIdx];
        const fromDetail = prevTracker?.slug
          ? getSlideCountRef.current?.(prevTracker.slug)
          : undefined;
        const prevSlides = Math.max(1, fromDetail ?? prevTracker?.eventImages?.length ?? 1);
        slideIndexRef.current = prevSlides - 1;
        setSlideIndex(prevSlides - 1);
        return prevIdx;
      });
    }
    resetProgress();
  }, [eligible, eligible.length, resetProgress]);

  // Swipe: skip entire tracker
  const skipToNextTracker = useCallback(() => {
    slideIndexRef.current = 0;
    setSlideIndex(0);
    setCurrentIndex((idx) => (idx + 1) % eligible.length);
    resetProgress();
  }, [eligible.length, resetProgress]);

  const skipToPrevTracker = useCallback(() => {
    slideIndexRef.current = 0;
    setSlideIndex(0);
    setCurrentIndex((idx) => (idx - 1 + eligible.length) % eligible.length);
    resetProgress();
  }, [eligible.length, resetProgress]);

  // Ref to always have latest goNext without re-triggering rAF effect
  const goNextRef = useRef(goNext);
  useEffect(() => {
    goNextRef.current = goNext;
  }, [goNext]);

  // Auto-advance via rAF — direct DOM update, no state re-renders
  useEffect(() => {
    if (paused || !enabled || eligible.length === 0) return;
    let start = performance.now();
    let rafId: number;

    const tick = (now: number) => {
      const pct = Math.min((now - start) / autoAdvanceMs, 1);
      progressRef.current = pct;
      if (progressBarRef.current) {
        progressBarRef.current.style.width = `${pct * 100}%`;
      }
      if (pct >= 1) {
        goNextRef.current();
        start = now;
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [paused, enabled, eligible.length, autoAdvanceMs]);

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

  // Cleanup
  useEffect(() => {
    return () => {
      clearPauseTimer();
    };
  }, [clearPauseTimer]);

  return {
    eligible,
    currentIndex,
    slideIndex,
    paused,
    pauseCountdown,
    seenSlugs,
    progressRef,
    progressBarRef,
    goTo,
    goNext,
    goPrev,
    skipToNextTracker,
    skipToPrevTracker,
    handlePause,
    handleResume,
  };
}
