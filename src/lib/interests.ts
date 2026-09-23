/**
 * Visitor-declared topic/region interests (spec 2026-09-22). Browser-only,
 * like follows: no backend, every read/write guarded, read after mount.
 * A match adds INTEREST_BONUS in relevance.ts.
 */
import { DomainSchema, RegionSchema, type Domain, type Region } from './tracker-config';

export interface Interests {
  domains: Domain[];
  regions: Region[];
}

export const EMPTY_INTERESTS: Interests = Object.freeze({ domains: [], regions: [] }) as Interests;
export const INTERESTS_KEY = 'watchboard:interests-v1';
/** Fired on window after every save so all mounts (sidebar, tour, help overlay) stay in sync. */
export const INTERESTS_CHANGED_EVENT = 'watchboard:interests-changed';

const DOMAINS = DomainSchema.options as readonly Domain[];
const REGIONS = RegionSchema.options as readonly Region[];

function pick<T extends string>(raw: unknown, allowed: readonly T[]): T[] {
  if (!Array.isArray(raw)) return [];
  return allowed.filter(v => raw.includes(v));
}

export function parseInterests(raw: unknown): Interests {
  if (!raw || typeof raw !== 'object') return { domains: [], regions: [] };
  const o = raw as Record<string, unknown>;
  return { domains: pick(o.domains, DOMAINS), regions: pick(o.regions, REGIONS) };
}

export function hasInterests(i: Interests): boolean {
  return i.domains.length > 0 || i.regions.length > 0;
}

export function toggleInterest(i: Interests, kind: 'domains' | 'regions', value: string): Interests {
  const allowed: readonly string[] = kind === 'domains' ? DOMAINS : REGIONS;
  if (!allowed.includes(value)) return i;
  const list = i[kind] as string[];
  const next = list.includes(value) ? list.filter(v => v !== value) : [...list, value];
  // Keep schema order so storage and chip order are stable.
  return { ...i, [kind]: allowed.filter(v => next.includes(v)) };
}

export function matchesInterests(t: { domain?: string; region?: string }, i: Interests): boolean {
  return (!!t.domain && (i.domains as string[]).includes(t.domain))
    || (!!t.region && (i.regions as string[]).includes(t.region));
}

export function interestOptions(trackers: { domain?: string; region?: string }[]) {
  const count = <T extends string>(allowed: readonly T[], key: 'domain' | 'region') =>
    allowed
      .map(value => ({ value, count: trackers.filter(t => t[key] === value).length }))
      .filter(o => o.count > 0);
  return { domains: count(DOMAINS, 'domain'), regions: count(REGIONS, 'region') };
}

export function loadInterests(): Interests {
  try {
    const raw = localStorage.getItem(INTERESTS_KEY);
    return raw ? parseInterests(JSON.parse(raw)) : { domains: [], regions: [] };
  } catch { return { domains: [], regions: [] }; }
}

export function saveInterests(i: Interests): void {
  try { localStorage.setItem(INTERESTS_KEY, JSON.stringify(i)); } catch {}
  try { window.dispatchEvent(new CustomEvent(INTERESTS_CHANGED_EVENT, { detail: i })); } catch {}
}
