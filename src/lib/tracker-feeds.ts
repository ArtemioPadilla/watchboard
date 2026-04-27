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
 * Region → native-language outlets covering that region. Adding a tracker
 * with one of these regions auto-extends the scan's source list.
 */
export const REGION_FEEDS: Record<string, FeedSpec[]> = {
  mexico: [
    { url: 'https://www.animalpolitico.com/feed/',            tier: 2, lang: 'es' },
    { url: 'https://www.jornada.com.mx/rss/edicion.xml',      tier: 2, lang: 'es' },
    { url: 'https://aristeguinoticias.com/feed/',             tier: 2, lang: 'es' },
    { url: 'https://www.eluniversal.com.mx/rss.xml',          tier: 2, lang: 'es' },
  ],
  india: [
    { url: 'https://www.thehindu.com/news/national/feeder/default.rss', tier: 2, lang: 'en' },
    { url: 'https://indianexpress.com/section/india/feed/',             tier: 2, lang: 'en' },
    { url: 'https://timesofindia.indiatimes.com/rssfeedstopstories.cms',tier: 2, lang: 'en' },
  ],
  'middle-east': [
    { url: 'https://www.aljazeera.com/xml/rss/all.xml',          tier: 2, lang: 'en' },
    { url: 'https://english.alarabiya.net/.mrss/en/all.xml',     tier: 2, lang: 'en' },
    { url: 'https://www.timesofisrael.com/feed/',                tier: 2, lang: 'en' },
  ],
  latam: [
    { url: 'https://www.clarin.com/rss/lo-ultimo/',              tier: 2, lang: 'es' },
    { url: 'https://feeds.folha.uol.com.br/folha/rss091.xml',    tier: 2, lang: 'pt' },
    { url: 'https://g1.globo.com/rss/g1/',                       tier: 2, lang: 'pt' },
  ],
  africa: [
    { url: 'https://allafrica.com/tools/headlines/rdf/latest/headlines.rdf', tier: 2, lang: 'en' },
    { url: 'https://www.news24.com/rss/Section/News24Wire',      tier: 2, lang: 'en' },
  ],
  'east-asia': [
    { url: 'https://www.scmp.com/rss/91/feed',                   tier: 2, lang: 'en' },
    { url: 'https://www.japantimes.co.jp/feed/',                 tier: 2, lang: 'en' },
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

/** Resolve all feeds (region + domain) that apply to a single tracker. */
export function resolveFeedsForTracker(tracker: Pick<TrackerConfig, 'region' | 'domain' | 'status'>): FeedSpec[] {
  const out: FeedSpec[] = [];
  if (tracker.region && REGION_FEEDS[tracker.region]) out.push(...REGION_FEEDS[tracker.region]);
  if (tracker.domain && DOMAIN_FEEDS[tracker.domain]) out.push(...DOMAIN_FEEDS[tracker.domain]);
  return out;
}

/** Walk all active trackers, union + dedupe their resolved feeds. */
export function resolveFeedsForActiveTrackers(
  trackers: Pick<TrackerConfig, 'region' | 'domain' | 'status'>[],
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
