/**
 * use-live-source.ts — React binding for live-source.ts.
 *
 * Adds what the pure cache deliberately leaves out: the polling loop, the
 * pause while the tab is hidden, and abort on unmount. Every hook that
 * draws a live layer goes through here so the behaviour is uniform:
 *
 *  - `enabled=false` → status 'disabled', no network, no timers.
 *  - First call fetches immediately (cache permitting), then re-checks
 *    every `intervalMs` (default: the TTL). A tick while
 *    `document.visibilityState === 'hidden'` is skipped; the next tick after
 *    the tab becomes visible fetches if the entry is due.
 *  - Unmount aborts the in-flight request and clears the timer.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchLiveSource, peekLiveSource, subscribeLiveSource, isDue,
  type LiveFetchSpec, type LiveResult, type LiveStatus,
} from './live-source';

export interface UseLiveSourceOptions {
  enabled?: boolean;
  /** Poll cadence; defaults to spec.ttlMs. */
  intervalMs?: number;
}

export interface UseLiveSourceResult<T> extends LiveResult<T> {
  refresh: () => void;
}

const DISABLED: LiveResult<never> = { data: null, status: 'disabled', updatedAt: null };

function isHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

export function useLiveSource<T>(
  spec: Omit<LiveFetchSpec<T>, 'signal'> | null,
  opts: UseLiveSourceOptions = {},
): UseLiveSourceResult<T> {
  const enabled = opts.enabled !== false && spec !== null;
  const key = spec?.key ?? '';
  const ttl = spec?.ttlMs ?? 0;
  const interval = opts.intervalMs ?? ttl;

  const [result, setResult] = useState<LiveResult<T>>(() =>
    enabled && key ? peekLiveSource<T>(key) : (DISABLED as LiveResult<T>),
  );
  const specRef = useRef(spec);
  specRef.current = spec;
  const abortRef = useRef<AbortController | null>(null);

  const runFetch = useCallback((force = false) => {
    const s = specRef.current;
    if (!s) return;
    if (!force && !isDue(s.key)) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    void fetchLiveSource<T>({ ...s, signal: ac.signal }).then((r) => {
      if (!ac.signal.aborted) setResult(r);
    });
  }, []);

  useEffect(() => {
    if (!enabled || !key) {
      setResult(DISABLED as LiveResult<T>);
      return;
    }
    setResult(peekLiveSource<T>(key));
    const unsubscribe = subscribeLiveSource<T>(key, ttl, setResult);
    runFetch(true);

    const tick = () => {
      if (isHidden()) return;
      runFetch();
    };
    const timer = interval > 0 ? setInterval(tick, interval) : null;
    const onVisible = () => { if (!isHidden()) runFetch(); };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);

    return () => {
      unsubscribe();
      if (timer) clearInterval(timer);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [enabled, key, ttl, interval, runFetch]);

  const refresh = useCallback(() => runFetch(true), [runFetch]);
  return { ...result, refresh };
}

/** Collapses several layer statuses into one for a summary dot. */
export function worstStatus(statuses: LiveStatus[]): LiveStatus {
  const order: LiveStatus[] = ['error', 'rate-limited', 'stale', 'loading', 'ok', 'idle', 'disabled'];
  for (const s of order) if (statuses.includes(s)) return s;
  return 'idle';
}
