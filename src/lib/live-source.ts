/**
 * live-source.ts — one cache in front of every live data feed.
 *
 * Before this module each globe/map hook fetched on its own: no cache, no
 * deduplication, a fixed Middle East bounding box, and on any failure a
 * silent `return` that left the layer empty. This is the failure mode
 * docs/silent-failure-patterns.md catalogues ("a step reporting success
 * while its work goes nowhere") applied to the browser.
 *
 * Contract (docs/adr/0002-live-layer-registry.md, plan E2.H1):
 *  - TTL: a fresh entry is returned without a request.
 *  - Dedupe: concurrent callers of the same key share one in-flight request.
 *  - Stale-on-error: when the upstream fails, the last good data is kept and
 *    reported as `stale` (or `rate-limited` on 429), never dropped to zero.
 *  - An empty payload counts as a failed refresh (an upstream that answers
 *    200 with `[]` during an outage must not wipe a layer).
 *  - Retry discipline: 60 s after a plain failure; 30/60/120 s doubling
 *    after 429. Not the full TTL, so recovery is fast; not immediately, so
 *    a dead upstream is not hammered.
 *  - Status is always available to the UI. Nothing here logs-and-forgets.
 *
 * Pure with respect to time and fetch (both injectable) so the whole
 * contract is covered by vitest with fake timers. Hooks live in
 * use-live-source.ts.
 */

export type LiveStatus =
  | 'idle'          // never fetched, not enabled
  | 'loading'       // first fetch in flight, no data yet
  | 'ok'            // last fetch succeeded within 2×TTL
  | 'stale'         // data exists but the last refresh failed or is overdue
  | 'rate-limited'  // last response was 429; data (if any) kept
  | 'error'         // failed and there is no data to show
  | 'disabled';     // layer turned off or missing its key

export interface LiveResult<T> {
  data: T | null;
  status: LiveStatus;
  /** Epoch ms of the last successful fetch, null if never. */
  updatedAt: number | null;
  /** Human-readable reason for stale/rate-limited/error. */
  error?: string;
  /** Epoch ms before which no new request will be made. */
  retryAt?: number;
}

export interface LiveFetchSpec<T> {
  /** Cache key. Include everything that changes the response (bbox, date). */
  key: string;
  url: string;
  ttlMs: number;
  /** Parse a 2xx response; throw to mark the fetch failed. */
  parse: (res: Response) => Promise<T>;
  /** Treat this result as "no data" (defaults to empty arrays). */
  isEmpty?: (data: T) => boolean;
  init?: RequestInit;
  signal?: AbortSignal;
  /** Injectable for tests. */
  now?: () => number;
  fetchImpl?: typeof fetch;
}

interface Entry<T = unknown> {
  data: T | null;
  updatedAt: number | null;
  lastAttemptAt: number | null;
  lastOutcome: 'ok' | 'fail' | 'rate-limited' | null;
  error?: string;
  failures: number;
  retryAt: number;
  ttlMs: number;
  inflight: Promise<LiveResult<T>> | null;
  subscribers: Set<(r: LiveResult<T>) => void>;
}

export const MAX_ENTRIES = 200;
export const FAIL_RETRY_MS = 60_000;
export const RATE_LIMIT_BASE_MS = 30_000;
export const RATE_LIMIT_MAX_MS = 120_000;

const store = new Map<string, Entry>();

function defaultIsEmpty(data: unknown): boolean {
  if (data == null) return true;
  if (Array.isArray(data)) return data.length === 0;
  return false;
}

function getEntry<T>(key: string, ttlMs: number): Entry<T> {
  let e = store.get(key) as Entry<T> | undefined;
  if (!e) {
    if (store.size >= MAX_ENTRIES) {
      // Insertion-order eviction; never evict something still loading.
      for (const [k, v] of store) {
        if (!v.inflight) { store.delete(k); break; }
      }
    }
    e = {
      data: null, updatedAt: null, lastAttemptAt: null, lastOutcome: null,
      failures: 0, retryAt: 0, ttlMs, inflight: null, subscribers: new Set(),
    };
    store.set(key, e as Entry);
  }
  e.ttlMs = ttlMs;
  return e;
}

/** Derives the public status from an entry at time `now`. */
export function statusOf<T>(e: Entry<T> | undefined, now: number): LiveStatus {
  if (!e) return 'idle';
  if (e.inflight && e.data === null) return 'loading';
  if (e.data === null) return e.lastOutcome ? (e.lastOutcome === 'rate-limited' ? 'rate-limited' : 'error') : 'idle';
  if (e.lastOutcome === 'rate-limited') return 'rate-limited';
  if (e.lastOutcome === 'fail') return 'stale';
  const age = e.updatedAt === null ? Infinity : now - e.updatedAt;
  return age > e.ttlMs * 2 ? 'stale' : 'ok';
}

function snapshot<T>(e: Entry<T>, now: number): LiveResult<T> {
  return {
    data: e.data,
    status: statusOf(e, now),
    updatedAt: e.updatedAt,
    ...(e.error ? { error: e.error } : {}),
    ...(e.retryAt > now ? { retryAt: e.retryAt } : {}),
  };
}

function notify<T>(e: Entry<T>, now: number) {
  const snap = snapshot(e, now);
  for (const cb of e.subscribers) {
    try { cb(snap); } catch { /* a bad subscriber must not break the others */ }
  }
}

/** Current cached state without triggering a request. */
export function peekLiveSource<T>(key: string, now: number = Date.now()): LiveResult<T> {
  const e = store.get(key) as Entry<T> | undefined;
  if (!e) return { data: null, status: 'idle', updatedAt: null };
  return snapshot(e, now);
}

/** True when a call to fetchLiveSource would actually hit the network. */
export function isDue(key: string, now: number = Date.now()): boolean {
  const e = store.get(key);
  if (!e) return true;
  if (e.inflight) return false;
  if (now < e.retryAt) return false;
  if (e.updatedAt !== null && e.lastOutcome === 'ok' && now - e.updatedAt < e.ttlMs) return false;
  return true;
}

export function subscribeLiveSource<T>(key: string, ttlMs: number, cb: (r: LiveResult<T>) => void): () => void {
  const e = getEntry<T>(key, ttlMs);
  e.subscribers.add(cb);
  return () => { e.subscribers.delete(cb); };
}

/**
 * Returns the freshest result the cache can offer, fetching only when the
 * entry is expired and not inside a retry window. Never throws: failures
 * are reported through `status` and `error`.
 */
export function fetchLiveSource<T>(spec: LiveFetchSpec<T>): Promise<LiveResult<T>> {
  const now = spec.now ?? Date.now;
  const fetchImpl = spec.fetchImpl ?? globalThis.fetch;
  const isEmpty = spec.isEmpty ?? (defaultIsEmpty as (d: T) => boolean);
  const e = getEntry<T>(spec.key, spec.ttlMs);
  const t0 = now();

  if (e.inflight) return e.inflight;
  if (spec.signal?.aborted) return Promise.resolve(snapshot(e, t0));
  if (t0 < e.retryAt) return Promise.resolve(snapshot(e, t0));
  if (e.data !== null && e.lastOutcome === 'ok' && e.updatedAt !== null && t0 - e.updatedAt < e.ttlMs) {
    return Promise.resolve(snapshot(e, t0));
  }

  const run = (async (): Promise<LiveResult<T>> => {
    e.lastAttemptAt = t0;
    const hostOf = () => { try { return new URL(spec.url).hostname; } catch { return spec.url; } };
    try {
      const res = await fetchImpl(spec.url, { ...(spec.init ?? {}), signal: spec.signal });
      if (spec.signal?.aborted) {
        // fall through: nothing recorded
      } else if (res.status === 429) {
        e.failures += 1;
        e.lastOutcome = 'rate-limited';
        e.error = `HTTP 429 from ${hostOf()}`;
        e.retryAt = now() + Math.min(RATE_LIMIT_BASE_MS * 2 ** (e.failures - 1), RATE_LIMIT_MAX_MS);
      } else if (!res.ok) {
        e.failures += 1;
        e.lastOutcome = 'fail';
        e.error = `HTTP ${res.status} from ${hostOf()}`;
        e.retryAt = now() + FAIL_RETRY_MS;
      } else {
        const data = await spec.parse(res);
        if (spec.signal?.aborted) {
          // discard
        } else if (isEmpty(data)) {
          // Success with nothing in it is treated as a failed refresh: keep
          // the previous layer rather than blanking it. With no previous
          // layer the empty result is stored so the UI can honestly say "0".
          e.failures += 1;
          e.error = 'Upstream returned no data';
          e.retryAt = now() + FAIL_RETRY_MS;
          if (e.data === null) {
            e.data = data;
            e.updatedAt = now();
            e.lastOutcome = 'ok';
          } else {
            e.lastOutcome = 'fail';
          }
        } else {
          e.data = data;
          e.updatedAt = now();
          e.failures = 0;
          e.retryAt = 0;
          e.lastOutcome = 'ok';
          e.error = undefined;
        }
      }
    } catch (err) {
      if (!spec.signal?.aborted) {
        e.failures += 1;
        e.lastOutcome = 'fail';
        e.error = err instanceof Error ? err.message : String(err);
        e.retryAt = now() + FAIL_RETRY_MS;
      }
    } finally {
      e.inflight = null;
    }
    const snap = snapshot(e, now());
    notify(e, now());
    return snap;
  })();

  e.inflight = run;
  if (e.data === null) notify(e, t0); // announce 'loading'
  return run;
}

/** Test/maintenance helper. */
export function clearLiveSources(): void {
  store.clear();
}

/** All keys with their current status; used by the degraded-sources panel. */
export function listLiveSources(now: number = Date.now()): { key: string; result: LiveResult<unknown> }[] {
  return [...store.entries()].map(([key, e]) => ({ key, result: snapshot(e, now) }));
}
