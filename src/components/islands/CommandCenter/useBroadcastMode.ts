import { useRef, useState, useCallback, useEffect } from 'react';
import { sortByRelevance } from '../../../lib/relevance';

interface TrackerForBroadcast {
  slug: string;
  shortName: string;
  icon?: string;
  headline?: string;
  digestSummary?: string;
  domain?: string;
  color?: string;
  mapCenter?: { lon: number; lat: number };
  lastUpdated: string;
  topKpis: Array<{ value: string; label: string }>;
  latestEventMedia?: { url: string; source: string; tier: number };
  eventImages?: Array<{ url: string; source: string; tier: number }>;
  dayCount?: number;
  isBreaking?: boolean;
  recentEventCount?: number;
  avgSourceTier?: number;
  sectionsUpdatedCount?: number;
}

export type BroadcastPhase = 'idle' | 'transitioning' | 'dwelling' | 'paused';

interface GlobeHandle {
  flyTo?: (lat: number, lng: number, altitude: number, durationMs: number) => void;
  setAutoRotate?: (enabled: boolean, speed?: number) => void;
}

interface BroadcastState {
  featuredTracker: TrackerForBroadcast | null;
  phase: BroadcastPhase;
  progress: number;
  trackerQueue: TrackerForBroadcast[];
  currentIndex: number;
  pause: () => void;
  resume: () => void;
  jumpTo: (slug: string) => void;
  goToNext: () => void;
  goToPrev: () => void;
  userPause: () => void;
  userResume: () => void;
  resetPauseTimer: () => void;
  isUserPaused: boolean;
  pauseCountdown: number;
}

const DWELL_MS = 8000;
const TRANSITION_BASE_MS = 2000;
const INITIAL_DELAY_MS = 3000;

function angularDistance(a: { lon: number; lat: number }, b: { lon: number; lat: number }): number {
  const dLat = Math.abs(a.lat - b.lat);
  const dLon = Math.abs(a.lon - b.lon);
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

function altitudeForDistance(dist: number): number {
  if (dist > 40) return 2.2 + Math.random() * 0.3;
  if (dist > 20) return 1.8 + Math.random() * 0.2;
  return 1.4 + Math.random() * 0.4;
}

const USER_PAUSE_DURATION_S = 15;

export function useBroadcastMode(
  trackers: TrackerForBroadcast[],
  globeRef: React.RefObject<GlobeHandle | null>,
  enabled: boolean,
  onFeatureTracker?: (slug: string | null) => void,
  followedSlugs: string[] = [],
): BroadcastState {
  const queue = useRef<TrackerForBroadcast[]>([]);
  const indexRef = useRef(0);
  const phaseRef = useRef<BroadcastPhase>('idle');
  const phaseStartRef = useRef(0);
  const transitionDurationRef = useRef(TRANSITION_BASE_MS);
  const rafRef = useRef<number>(0);
  const mountedRef = useRef(true);
  const userPausedRef = useRef(false);
  const pauseTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [featuredTracker, setFeaturedTracker] = useState<TrackerForBroadcast | null>(null);
  const [phase, setPhase] = useState<BroadcastPhase>('idle');
  const [progress, setProgress] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isUserPaused, setIsUserPaused] = useState(false);
  const [pauseCountdown, setPauseCountdown] = useState(0);

  // Build queue: active trackers with mapCenter, sorted by relevance
  useEffect(() => {
    const eligible = trackers.filter(t => t.mapCenter && t.headline);
    queue.current = sortByRelevance(eligible, followedSlugs);
  }, [trackers, followedSlugs]);

  const setPhaseState = useCallback((p: BroadcastPhase) => {
    phaseRef.current = p;
    phaseStartRef.current = performance.now();
    if (mountedRef.current) setPhase(p);
  }, []);

  const flyToTracker = useCallback((tracker: TrackerForBroadcast, prevTracker?: TrackerForBroadcast) => {
    if (!tracker.mapCenter || !globeRef.current?.flyTo) return;

    const dist = prevTracker?.mapCenter
      ? angularDistance(prevTracker.mapCenter, tracker.mapCenter)
      : 30;

    const alt = altitudeForDistance(dist);
    const duration = dist > 40 ? TRANSITION_BASE_MS + 500 : TRANSITION_BASE_MS;
    transitionDurationRef.current = duration;

    globeRef.current.setAutoRotate?.(false);
    globeRef.current.flyTo(tracker.mapCenter.lat, tracker.mapCenter.lon, alt, duration);

    if (mountedRef.current) {
      setFeaturedTracker(tracker);
      setCurrentIndex(indexRef.current);
    }
    onFeatureTracker?.(tracker.slug);
    setPhaseState('transitioning');
  }, [globeRef, onFeatureTracker, setPhaseState]);

  const advanceToNext = useCallback(() => {
    const q = queue.current;
    if (q.length === 0) return;

    const prevIndex = indexRef.current;
    indexRef.current = (prevIndex + 1) % q.length;
    flyToTracker(q[indexRef.current], q[prevIndex]);
  }, [flyToTracker]);

  const pause = useCallback(() => {
    setPhaseState('paused');
    globeRef.current?.setAutoRotate?.(false);
    onFeatureTracker?.(null);
  }, [globeRef, onFeatureTracker, setPhaseState]);

  const resume = useCallback(() => {
    if (queue.current.length === 0) return;
    advanceToNext();
  }, [advanceToNext]);

  const jumpTo = useCallback((slug: string) => {
    const q = queue.current;
    const idx = q.findIndex(t => t.slug === slug);
    if (idx === -1) return;
    indexRef.current = idx;
    const prev = idx > 0 ? q[idx - 1] : q[q.length - 1];
    flyToTracker(q[idx], prev);
  }, [flyToTracker]);

  const goToNext = useCallback(() => {
    const q = queue.current;
    if (q.length === 0) return;
    const prevIndex = indexRef.current;
    indexRef.current = (prevIndex + 1) % q.length;
    flyToTracker(q[indexRef.current], q[prevIndex]);
  }, [flyToTracker]);

  const goToPrev = useCallback(() => {
    const q = queue.current;
    if (q.length === 0) return;
    const prevIndex = indexRef.current;
    indexRef.current = (prevIndex - 1 + q.length) % q.length;
    flyToTracker(q[indexRef.current], q[prevIndex]);
  }, [flyToTracker]);

  const clearPauseTimer = useCallback(() => {
    if (pauseTimerRef.current) {
      clearInterval(pauseTimerRef.current);
      pauseTimerRef.current = null;
    }
  }, []);

  const userResume = useCallback(() => {
    clearPauseTimer();
    userPausedRef.current = false;
    if (mountedRef.current) {
      setIsUserPaused(false);
      setPauseCountdown(0);
    }
    // Resume dwelling on the current tracker (restart dwell timer)
    // instead of advancing to the next one
    setPhaseState('dwelling');
    globeRef.current?.setAutoRotate?.(true, 0.08);
  }, [clearPauseTimer, setPhaseState, globeRef]);

  const userPause = useCallback(() => {
    setPhaseState('paused');
    globeRef.current?.setAutoRotate?.(false);
    userPausedRef.current = true;
    if (mountedRef.current) {
      setIsUserPaused(true);
      setPauseCountdown(USER_PAUSE_DURATION_S);
    }
    clearPauseTimer();
    let remaining = USER_PAUSE_DURATION_S;
    pauseTimerRef.current = setInterval(() => {
      remaining--;
      if (mountedRef.current) setPauseCountdown(remaining);
      if (remaining <= 0) {
        userResume();
      }
    }, 1000);
  }, [setPhaseState, globeRef, clearPauseTimer, userResume]);

  const resetPauseTimer = useCallback(() => {
    if (!userPausedRef.current) return;
    clearPauseTimer();
    if (mountedRef.current) setPauseCountdown(USER_PAUSE_DURATION_S);
    let remaining = USER_PAUSE_DURATION_S;
    pauseTimerRef.current = setInterval(() => {
      remaining--;
      if (mountedRef.current) setPauseCountdown(remaining);
      if (remaining <= 0) {
        userResume();
      }
    }, 1000);
  }, [clearPauseTimer, userResume]);

  // Main RAF loop
  useEffect(() => {
    if (!enabled) {
      if (phaseRef.current !== 'paused') setPhaseState('paused');
      return;
    }

    const loop = () => {
      if (!mountedRef.current) return;

      const now = performance.now();
      const elapsed = now - phaseStartRef.current;

      switch (phaseRef.current) {
        case 'idle':
          if (elapsed >= INITIAL_DELAY_MS && queue.current.length > 0) {
            indexRef.current = 0;
            flyToTracker(queue.current[0]);
          }
          break;

        case 'transitioning':
          if (elapsed >= transitionDurationRef.current + 200) {
            // Transition complete, start dwelling
            setPhaseState('dwelling');
            globeRef.current?.setAutoRotate?.(true, 0.08);
          }
          break;

        case 'dwelling':
          if (mountedRef.current) {
            setProgress(Math.min(elapsed / DWELL_MS, 1));
          }
          if (elapsed >= DWELL_MS) {
            setProgress(0);
            advanceToNext();
          }
          break;

        case 'paused':
          // Do nothing
          break;
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    // Start
    if (phaseRef.current === 'paused' || phaseRef.current === 'idle') {
      setPhaseState('idle');
    }
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [enabled, flyToTracker, advanceToNext, setPhaseState, globeRef]);

  // Cleanup
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Cleanup pause timer on unmount
  useEffect(() => {
    return () => { clearPauseTimer(); };
  }, [clearPauseTimer]);

  return {
    featuredTracker,
    phase,
    progress,
    trackerQueue: queue.current,
    currentIndex,
    pause,
    resume,
    jumpTo,
    goToNext,
    goToPrev,
    userPause,
    userResume,
    resetPauseTimer,
    isUserPaused,
    pauseCountdown,
  };
}
