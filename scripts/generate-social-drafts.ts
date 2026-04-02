/**
 * Generates platform-specific social media post drafts from today's digest entries.
 *
 * Reads digests.json from each non-draft tracker, finds entries matching today's date,
 * and produces Twitter/X and LinkedIn drafts written to public/_social/YYYY-MM-DD.json.
 *
 * Usage: npx tsx scripts/generate-social-drafts.ts
 */
import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DigestEntry {
  date: string;
  title: string;
  summary: string;
  sectionsUpdated: string[];
}

interface SocialPost {
  platform: 'twitter' | 'linkedin';
  trackerSlug: string;
  trackerName: string;
  text: string;
  hashtags: string[];
  link: string;
  date: string;
}

interface TrackerConfig {
  slug: string;
  name: string;
  shortName?: string;
  status?: string;
  domain?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_URL = 'https://watchboard.dev';
const TRACKERS_DIR = path.join(process.cwd(), 'trackers');
const TCO_LINK_LENGTH = 23;

const DOMAIN_HASHTAGS: Record<string, string[]> = {
  conflict: ['OSINT', 'ConflictTracking', 'IntelDashboard'],
  security: ['OSINT', 'Security', 'IntelDashboard'],
  disaster: ['DisasterTracking', 'OSINT'],
  'human-rights': ['HumanRights', 'OSINT', 'IntelDashboard'],
  governance: ['Governance', 'Politics', 'IntelDashboard'],
  economy: ['Economy', 'Markets', 'IntelDashboard'],
  history: ['History', 'IntelDashboard'],
  science: ['Science', 'Research', 'IntelDashboard'],
  culture: ['Culture', 'IntelDashboard'],
  space: ['Space', 'OSINT', 'IntelDashboard'],
};

const ALWAYS_HASHTAG = 'Watchboard';

/** Regex matching http(s) URLs for Twitter-weighted length calculation. */
const URL_REGEX = /https?:\/\/\S+/g;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Computes the character count Twitter/X would use for a post.
 * Twitter wraps every URL to t.co (23 chars), regardless of actual length.
 */
function twitterWeightedLength(text: string): number {
  let length = text.length;
  const urls = text.match(URL_REGEX);
  if (urls) {
    for (const url of urls) {
      length += TCO_LINK_LENGTH - url.length;
    }
  }
  return length;
}

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function trackerLink(slug: string): string {
  return `${BASE_URL}/${slug}/`;
}

function hashtagsForDomain(domain: string): string[] {
  const domainTags = DOMAIN_HASHTAGS[domain] ?? ['OSINT', 'IntelDashboard'];
  const combined = [...domainTags];
  if (!combined.includes(ALWAYS_HASHTAG)) {
    combined.push(ALWAYS_HASHTAG);
  }
  return combined;
}

function formatHashtags(tags: string[]): string {
  return tags.map((t) => `#${t}`).join(' ');
}

/**
 * Builds a Twitter/X post within the 280-character budget.
 *
 * Budget breakdown:
 *   - t.co wrapped link: 23 chars
 *   - spaces/newlines separating sections
 *   - hashtag string
 *   - remaining chars go to the summary text
 */
function buildTwitterPost(
  summary: string,
  link: string,
  hashtags: string[],
): string {
  const hashtagStr = formatHashtags(hashtags);
  // Layout: {summary}\n\n{link}\n\n{hashtags}
  // Overhead: 2 newlines before link + 2 newlines before hashtags = 4 chars
  const overhead = 4;
  const fixedLength = TCO_LINK_LENGTH + overhead + hashtagStr.length;
  const maxSummaryLength = 280 - fixedLength;

  let truncatedSummary = summary;
  if (truncatedSummary.length > maxSummaryLength) {
    truncatedSummary = truncatedSummary.slice(0, maxSummaryLength - 1).trimEnd() + '\u2026';
  }

  return `${truncatedSummary}\n\n${link}\n\n${hashtagStr}`;
}

/**
 * Builds a LinkedIn post with a more detailed format.
 */
function buildLinkedInPost(
  title: string,
  summary: string,
  sectionsUpdated: string[],
  link: string,
  hashtags: string[],
): string {
  const sectionsList = sectionsUpdated.length > 0
    ? `Sections updated: ${sectionsUpdated.join(', ')}`
    : '';

  const parts = [
    title,
    '',
    summary,
  ];

  if (sectionsList) {
    parts.push('', sectionsList);
  }

  parts.push('', `Dashboard: ${link}`, '', formatHashtags(hashtags));

  return parts.join('\n');
}

function loadTrackerConfig(slug: string): TrackerConfig | null {
  const configPath = path.join(TRACKERS_DIR, slug, 'tracker.json');
  if (!fs.existsSync(configPath)) return null;

  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8')) as TrackerConfig;
  } catch {
    return null;
  }
}

function loadDigests(slug: string): DigestEntry[] {
  const digestPath = path.join(TRACKERS_DIR, slug, 'data', 'digests.json');
  if (!fs.existsSync(digestPath)) return [];

  try {
    const data = JSON.parse(fs.readFileSync(digestPath, 'utf8'));
    if (!Array.isArray(data)) return [];
    return data as DigestEntry[];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const today = todayDateString();
  console.log(`[social-drafts] Scanning trackers for digests dated ${today}...\n`);

  const trackerSlugs = fs.readdirSync(TRACKERS_DIR).filter((entry) => {
    const fullPath = path.join(TRACKERS_DIR, entry);
    return fs.statSync(fullPath).isDirectory();
  });

  const posts: SocialPost[] = [];

  for (const slug of trackerSlugs) {
    const config = loadTrackerConfig(slug);
    if (!config) continue;
    if (config.status === 'draft') continue;

    const digests = loadDigests(slug);
    const todayDigests = digests.filter((d) => d.date === today);

    if (todayDigests.length === 0) continue;

    const trackerName = config.shortName ?? config.name;
    const link = trackerLink(slug);
    const hashtags = hashtagsForDomain(config.domain ?? '');

    for (const digest of todayDigests) {
      const twitterText = buildTwitterPost(digest.summary, link, hashtags);
      posts.push({
        platform: 'twitter',
        trackerSlug: slug,
        trackerName,
        text: twitterText,
        hashtags,
        link,
        date: today,
      });

      const linkedInText = buildLinkedInPost(
        digest.title,
        digest.summary,
        digest.sectionsUpdated,
        link,
        hashtags,
      );
      posts.push({
        platform: 'linkedin',
        trackerSlug: slug,
        trackerName,
        text: linkedInText,
        hashtags,
        link,
        date: today,
      });
    }
  }

  if (posts.length === 0) {
    console.log('No trackers were updated today. Nothing to generate.');
    return;
  }

  // Write output
  const outputDir = path.join(process.cwd(), 'public', '_social');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, `${today}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(posts, null, 2), 'utf8');
  console.log(`Wrote ${posts.length} social drafts to ${outputPath}\n`);

  // Print preview
  const twitterPosts = posts.filter((p) => p.platform === 'twitter');
  console.log(`--- Twitter/X Preview (${twitterPosts.length} posts) ---\n`);
  for (const post of twitterPosts) {
    const weighted = twitterWeightedLength(post.text);
    const badge = weighted <= 280 ? 'OK' : 'OVER';
    console.log(`[${post.trackerName}] (${weighted}/280 chars — ${badge})`);
    console.log(post.text);
    console.log('');
  }

  const linkedInPosts = posts.filter((p) => p.platform === 'linkedin');
  console.log(`--- LinkedIn Preview (${linkedInPosts.length} posts) ---\n`);
  for (const post of linkedInPosts) {
    console.log(`[${post.trackerName}]`);
    console.log(post.text);
    console.log('');
  }
}

main();
