/**
 * Generates a sibling brief for cross-tracker awareness.
 * Each tracker gets context about related trackers to avoid event duplication.
 *
 * Relationships are detected by:
 * 1. Manual: tracker.json ai.relatedTrackers (if defined)
 * 2. Auto: keyword overlap in ai.searchContext
 */
import fs from 'fs';
import path from 'path';

const trackersDir = 'trackers';
const outputPath = '/tmp/sibling-brief.json';

interface TrackerInfo {
  slug: string;
  name: string;
  topic: string;
  searchContext: string;
  latestHeadline: string;
  manualRelated: string[];
  keywords: Set<string>;
}

// Load all tracker info
const trackers: TrackerInfo[] = [];

for (const slug of fs.readdirSync(trackersDir)) {
  const configPath = path.join(trackersDir, slug, 'tracker.json');
  if (!fs.existsSync(configPath)) continue;

  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (config.status === 'draft') continue;

    const metaPath = path.join(trackersDir, slug, 'data', 'meta.json');
    let headline = '';
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      headline = meta.heroHeadline || '';
    } catch {}

    const searchContext = config.ai?.searchContext || '';
    const manualRelated = config.ai?.relatedTrackers || [];

    // Extract keywords from searchContext (words 4+ chars, lowercased)
    const stopWords = new Set(['that', 'this', 'with', 'from', 'have', 'been', 'were', 'they', 'their', 'about', 'would', 'could', 'should', 'which', 'there', 'where', 'when', 'what', 'will', 'into', 'also', 'than', 'them', 'then', 'some', 'other', 'more', 'between', 'including', 'during', 'after', 'before', 'since', 'under', 'over', 'such', 'each', 'through', 'most', 'same']);
    const keywords = new Set(
      searchContext
        .toLowerCase()
        .replace(/[^a-z\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length >= 4 && !stopWords.has(w))
    );

    trackers.push({
      slug,
      name: config.name || slug,
      topic: config.topic || config.name || slug,
      searchContext,
      latestHeadline: headline,
      manualRelated,
      keywords,
    });
  } catch {
    // Skip unparseable trackers
  }
}

// Compute relationships
const brief: Record<string, {
  topic: string;
  latestHeadline: string;
  relatedSlugs: string[];
}> = {};

for (const tracker of trackers) {
  const related = new Set<string>(tracker.manualRelated);

  // Auto-detect by keyword overlap (need 3+ shared keywords)
  for (const other of trackers) {
    if (other.slug === tracker.slug) continue;
    if (related.has(other.slug)) continue;

    let overlap = 0;
    for (const kw of tracker.keywords) {
      if (other.keywords.has(kw)) overlap++;
    }

    if (overlap >= 3) {
      related.add(other.slug);
    }
  }

  brief[tracker.slug] = {
    topic: tracker.topic,
    latestHeadline: tracker.latestHeadline,
    relatedSlugs: [...related],
  };
}

fs.writeFileSync(outputPath, JSON.stringify(brief, null, 2));

// Log relationships
for (const [slug, info] of Object.entries(brief)) {
  if (info.relatedSlugs.length > 0) {
    console.log(`${slug} → related to: ${info.relatedSlugs.join(', ')}`);
  }
}
console.log(`Sibling brief written to ${outputPath}`);
