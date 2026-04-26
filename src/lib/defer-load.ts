/**
 * Defer a dynamic import until the browser is idle, so heavy modules
 * (Cesium, ~5s of CPU on mid-tier mobile) don't compete with the page's
 * LCP for main-thread time. The Suspense fallback (already a starfield
 * skeleton) covers the wait.
 *
 * Times out at 2s so the load is not delayed indefinitely on a busy page.
 */
export function deferImport<T>(factory: () => Promise<T>, timeoutMs = 2000): Promise<T> {
  return new Promise((resolve, reject) => {
    const load = () => factory().then(resolve, reject);
    if (typeof window === 'undefined') {
      load();
      return;
    }
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(load, { timeout: timeoutMs });
    } else {
      // Safari < 16.4 lacks requestIdleCallback; setTimeout(0) yields the
      // current task, which is enough to unblock the LCP paint.
      setTimeout(load, 50);
    }
  });
}
