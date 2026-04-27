import type { TrackerConfig } from './tracker-config';

export type FeedLanguage = 'en' | 'es' | 'fr' | 'pt' | 'ar' | 'zh' | 'ja' | 'hi';

export interface FeedSpec {
  url: string;
  tier: 1 | 2 | 3;
  lang: FeedLanguage;
  /** Reserved for v2 auto-disable behavior; not used in v1. */
  toleranceDays?: number;
}

/**
 * Country (ISO-2 code) → native-language outlets. tracker.json carries
 * `country` at the tracker root (e.g. `"country": "MX"`); adding a tracker
 * with one of these codes auto-extends the scan's source list.
 *
 * Codes match the existing TrackerConfig.country field which is the same
 * ISO-2 code used in `geoPath[0]`.
 */
export const COUNTRY_FEEDS: Record<string, FeedSpec[]> = {
  MX: [
    { url: 'https://www.animalpolitico.com/feed/',                tier: 2, lang: 'es' },
    { url: 'https://www.jornada.com.mx/rss/edicion.xml',          tier: 2, lang: 'es' },
    { url: 'https://aristeguinoticias.com/feed/',                 tier: 2, lang: 'es' },
    { url: 'https://www.eluniversal.com.mx/rss.xml',              tier: 2, lang: 'es' },
  ],
  IN: [
    { url: 'https://www.thehindu.com/news/national/feeder/default.rss', tier: 2, lang: 'en' },
    { url: 'https://indianexpress.com/section/india/feed/',             tier: 2, lang: 'en' },
    { url: 'https://timesofindia.indiatimes.com/rssfeedstopstories.cms',tier: 2, lang: 'en' },
  ],
  IL: [
    { url: 'https://www.timesofisrael.com/feed/',                 tier: 2, lang: 'en' },
    { url: 'https://www.haaretz.com/srv/htz---web---english-rss', tier: 2, lang: 'en' },
  ],
  AR: [
    { url: 'https://www.clarin.com/rss/lo-ultimo/',               tier: 2, lang: 'es' },
  ],
  BR: [
    { url: 'https://feeds.folha.uol.com.br/folha/rss091.xml',     tier: 2, lang: 'pt' },
    { url: 'https://g1.globo.com/rss/g1/',                        tier: 2, lang: 'pt' },
  ],
  JP: [
    { url: 'https://www.japantimes.co.jp/feed/',                  tier: 2, lang: 'en' },
  ],
  CN: [
    { url: 'https://www.scmp.com/rss/91/feed',                    tier: 2, lang: 'en' },
  ],
  ZA: [
    { url: 'https://www.news24.com/rss/Section/News24Wire',       tier: 2, lang: 'en' },
  ],
  // Trackers without a country-specific feed list still pick up region +
  // domain feeds below.
};

/**
 * Region → broad outlets covering the geography. Keys MUST match the values
 * in `RegionSchema` (`src/lib/tracker-config.ts`): `africa`, `central-america`,
 * `central-europe`, `east-asia`, `europe`, `global`, `middle-east`,
 * `north-america`, `south-america`, `south-asia`, `southeast-asia`.
 */
export const REGION_FEEDS: Record<string, FeedSpec[]> = {
  'middle-east': [
    { url: 'https://www.aljazeera.com/xml/rss/all.xml',          tier: 2, lang: 'en' },
    { url: 'https://english.alarabiya.net/.mrss/en/all.xml',     tier: 2, lang: 'en' },
  ],
  'south-america': [
    { url: 'https://feeds.folha.uol.com.br/folha/rss091.xml',    tier: 2, lang: 'pt' },
    { url: 'https://g1.globo.com/rss/g1/',                       tier: 2, lang: 'pt' },
  ],
  'central-america': [
    { url: 'https://www.animalpolitico.com/feed/',               tier: 2, lang: 'es' },
  ],
  africa: [
    { url: 'https://allafrica.com/tools/headlines/rdf/latest/headlines.rdf', tier: 2, lang: 'en' },
    { url: 'https://www.news24.com/rss/Section/News24Wire',      tier: 2, lang: 'en' },
  ],
  'east-asia': [
    { url: 'https://www.scmp.com/rss/91/feed',                   tier: 2, lang: 'en' },
    { url: 'https://www.japantimes.co.jp/feed/',                 tier: 2, lang: 'en' },
  ],
  'south-asia': [
    { url: 'https://www.thehindu.com/news/international/feeder/default.rss', tier: 2, lang: 'en' },
  ],
  'southeast-asia': [
    { url: 'https://www.straitstimes.com/news/asia/rss.xml',     tier: 2, lang: 'en' },
  ],
};

export const DOMAIN_FEEDS: Record<string, FeedSpec[]> = {
  space: [
    { url: 'https://www.nasa.gov/news/all/feed/',                tier: 1, lang: 'en' },
    { url: 'https://spacenews.com/feed/',                        tier: 2, lang: 'en' },
    { url: 'https://www.esa.int/Newsroom/Highlights_RSS',        tier: 1, lang: 'en' },
  ],
  science: [
    { url: 'https://www.nature.com/nature.rss',                  tier: 1, lang: 'en' },
    { url: 'https://www.science.org/blogs/news-from-science/feed', tier: 1, lang: 'en' },
  ],
  economy: [
    { url: 'https://feeds.reuters.com/reuters/businessNews',     tier: 2, lang: 'en' },
  ],
  disaster: [
    { url: 'https://reliefweb.int/updates/rss.xml',              tier: 1, lang: 'en' },
  ],
};

/** Resolve all feeds (country + region + domain) that apply to a single
 *  tracker. Dedupes by URL within the tracker; the union across many
 *  trackers is deduped again by `resolveFeedsForActiveTrackers`. */
export function resolveFeedsForTracker(
  tracker: Pick<TrackerConfig, 'region' | 'domain' | 'status' | 'country'>,
): FeedSpec[] {
  const seen = new Set<string>();
  const out: FeedSpec[] = [];
  const push = (feeds?: FeedSpec[]) => {
    if (!feeds) return;
    for (const f of feeds) {
      if (seen.has(f.url)) continue;
      seen.add(f.url);
      out.push(f);
    }
  };
  if (tracker.country) push(COUNTRY_FEEDS[tracker.country]);
  if (tracker.region)  push(REGION_FEEDS[tracker.region]);
  if (tracker.domain)  push(DOMAIN_FEEDS[tracker.domain]);
  return out;
}

/** Walk all active trackers, union + dedupe their resolved feeds. */
export function resolveFeedsForActiveTrackers(
  trackers: Pick<TrackerConfig, 'region' | 'domain' | 'status' | 'country'>[],
): FeedSpec[] {
  const seen = new Set<string>();
  const out: FeedSpec[] = [];
  for (const tr of trackers) {
    if (tr.status !== 'active') continue;
    for (const f of resolveFeedsForTracker(tr)) {
      if (seen.has(f.url)) continue;
      seen.add(f.url);
      out.push(f);
    }
  }
  return out;
}
