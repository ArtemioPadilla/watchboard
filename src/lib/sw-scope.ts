/**
 * Which service-worker registrations belong to this deployment.
 *
 * The page unregisters "foreign" workers — a stale one left at a scope the
 * site no longer serves from, which would answer requests out of an old
 * cache. The test for foreign used to be `!reg.scope.includes('watchboard.dev')`,
 * a hostname hard-coded into a project that ships a Docker image, a
 * docker-compose with CasaOS metadata and a self-hosting guide. Anywhere but
 * that one domain — a self-hosted instance, `localhost` in dev, the container
 * on :8080 — every registration looked foreign, so the page unregistered its
 * own service worker on every load and the PWA quietly had no offline support
 * and no push.
 *
 * `getRegistrations()` only ever returns same-origin registrations, so the
 * question is purely whether a registration sits at our own scope.
 */

/** The scope our own worker registers at, as an absolute URL. */
export function ownServiceWorkerScope(baseUrl: string, origin: string): string {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return new URL(base, origin).href;
}

/** True for a registration this deployment did not make. */
export function isForeignServiceWorker(scope: string | undefined, ownScope: string): boolean {
  if (!scope) return false;
  return scope !== ownScope;
}
