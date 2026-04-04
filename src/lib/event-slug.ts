/**
 * Event slug generation and permalink URL building.
 *
 * Slug format: {YYYY-MM-DD}-{kebab-id}
 * Permalink: /{trackerSlug}/events/{slug}
 */

/** Convert an event's date + id into a URL-safe slug. */
export function eventToSlug(date: string, eventId: string): string {
  const kebabId = eventId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${date}-${kebabId}`;
}

/** Build the full permalink path for an event. */
export function eventPermalink(
  trackerSlug: string,
  date: string,
  eventId: string,
  basePath = '/',
): string {
  const slug = eventToSlug(date, eventId);
  const base = basePath.endsWith('/') ? basePath : `${basePath}/`;
  return `${base}${trackerSlug}/events/${slug}`;
}
