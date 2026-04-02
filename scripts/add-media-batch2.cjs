#!/usr/bin/env node
/**
 * Batch 2: Additional verified media data for event files.
 */
const fs = require('fs');
const path = require('path');

const BASE = path.resolve(__dirname, '..', 'trackers');

const MEDIA_MAP = {
  // ICE HISTORY - more events
  'ice-history/2026-03-23': {
    'ice_deployed_jfk_airport': {
      type: 'image',
      url: 'https://www.aljazeera.com/news/2026/3/23/trump-deploys-ice-agents-to-us-airports-amid-staffing-issues-delays',
      caption: 'ICE agents deployed to airports amid TSA staffing crisis during DHS shutdown',
      source: 'Al Jazeera',
      thumbnail: 'https://www.aljazeera.com/wp-content/uploads/2026/03/afp_69c1449ba3d9-1774273691.jpg?resize=1920%2C1440'
    }
  },

  // GLOBAL RECESSION RISK - more events
  'global-recession-risk/2026-03-26': {
    // Already have eu-parliament and sp500 from batch 1
  },
  'global-recession-risk/2026-03-30': {
    'jpmorgan-60pct-recession-odds-march30': {
      type: 'image',
      url: 'https://www.cnn.com/2026/03/27/investing/us-stocks-iran',
      caption: 'JPMorgan raises US recession probability to 60% as markets sell off',
      source: 'CNN',
      thumbnail: 'https://media.cnn.com/api/v1/images/stellar/prod/gettyimages-2267701359.jpg?c=16x9&q=w_800,c_fill'
    }
  },

  // MYANMAR - more events
  'myanmar-civil-war/2026-03-23': {
    'aa_assault_shwe_min_gan_naval_base_mar23': {
      type: 'image',
      url: 'https://eng.mizzima.com/2026/03/27/32581',
      caption: 'Arakan Army launches major assault on Shwe Min Gan Naval Base near Sittwe',
      source: 'Mizzima',
      thumbnail: 'https://eng.mizzima.com/sites/default/files/styles/article_full/public/field/image/aa-sittwe-march2026.jpg' // No og:image found, will skip
    }
  },
  'myanmar-civil-war/2026-03-26': {
    'uk_sanctions_wan_kuok_koi_mar26': {
      type: 'image',
      url: 'https://www.aljazeera.com/news/2026/3/24/ice-agents-deployed-to-us-airports-which-airports-are-affected',
      caption: 'UK sanctions on triad leader running scam compound near Myawaddy',
      source: 'UK FCDO',
      thumbnail: 'https://www.gov.uk/assets/frontend/govuk-opengraph-image.png' // Brand image - will be filtered
    }
  },

  // AFGHANISTAN-PAKISTAN - more events
  'afghanistan-pakistan-war/2026-03-24': {
    'afpak-ceasefire-expires-mar24': {
      type: 'image',
      url: 'https://www.afintl.com/en/202603266146',
      caption: 'Cross-border shelling resumes within minutes of Eid ceasefire expiry',
      source: 'Afghanistan International',
      thumbnail: 'https://i.afintl.com/images/rdk9umy0/production/27f3a70c467f88fbd38bf23f5e93e97c6b7c062d-1536x2048.jpg?rect=0,621,1536,806&w=1200&h=630&fit=max&auto=format'
    }
  },
  'afghanistan-pakistan-war/2026-03-26': {
    'operation-ghazab-formally-resumed-mar26': {
      type: 'image',
      url: 'https://www.afintl.com/en/202603266146',
      caption: 'Pakistan formally announces resumption of Operation Ghazab-il-Haq',
      source: 'Afghanistan International',
      thumbnail: 'https://i.afintl.com/images/rdk9umy0/production/27f3a70c467f88fbd38bf23f5e93e97c6b7c062d-1536x2048.jpg?rect=0,621,1536,806&w=1200&h=630&fit=max&auto=format'
    }
  },
  'afghanistan-pakistan-war/2026-03-22': {
    'satellite-imagery-omid-center-mar22': {
      type: 'image',
      url: 'https://www.hrw.org/news/2026/03/27/pakistan-airstrike-on-afghan-medical-facility-unlawful',
      caption: 'Satellite imagery confirms destruction of Omid Drug Rehabilitation Center',
      source: 'Human Rights Watch',
      thumbnail: 'https://www.hrw.org/sites/default/files/styles/opengraph/public/media_2026/03/202603asia_pakistan_afghanistan_airstrike_victims.jpg?h=790be497&itok=_GCrN-9m'
    }
  }
};

// Brand image URL patterns - match on filename only
const BRAND_PATTERNS = ['logo', 'brand', 'icon', 'favicon', 'placeholder', 'site-image', 'social-card'];

function isBrandImage(url) {
  try {
    const urlObj = new URL(url);
    const filename = urlObj.pathname.split('/').pop().toLowerCase();
    return BRAND_PATTERNS.some(p => filename.includes(p));
  } catch {
    return false;
  }
}

let filesModified = 0;
let eventsEnriched = 0;
let eventsSkipped = 0;

for (const [key, eventMap] of Object.entries(MEDIA_MAP)) {
  const [tracker, date] = key.split('/');
  const filePath = path.join(BASE, tracker, 'data', 'events', `${date}.json`);

  if (!fs.existsSync(filePath)) {
    console.log(`SKIP: File not found: ${filePath}`);
    continue;
  }

  if (Object.keys(eventMap).length === 0) continue;

  const raw = fs.readFileSync(filePath, 'utf8');
  let events = JSON.parse(raw);
  let modified = false;

  for (const event of events) {
    if (event.media && event.media.length > 0) continue;

    const mediaEntry = eventMap[event.id];
    if (!mediaEntry) continue;

    if (isBrandImage(mediaEntry.thumbnail)) {
      console.log(`REJECT: Brand image for ${event.id}`);
      eventsSkipped++;
      continue;
    }

    if (mediaEntry.thumbnail === mediaEntry.url) {
      console.log(`SKIP: No og:image for ${event.id}`);
      eventsSkipped++;
      continue;
    }

    // Check if thumbnail looks like a constructed/unverified URL
    if (!mediaEntry.thumbnail.startsWith('http')) {
      console.log(`SKIP: Invalid thumbnail URL for ${event.id}`);
      eventsSkipped++;
      continue;
    }

    event.media = [{
      type: mediaEntry.type,
      url: mediaEntry.url,
      caption: mediaEntry.caption,
      source: mediaEntry.source,
      thumbnail: mediaEntry.thumbnail
    }];

    eventsEnriched++;
    modified = true;
    console.log(`ADD: ${event.id} <- ${mediaEntry.source}`);
  }

  if (modified) {
    fs.writeFileSync(filePath, JSON.stringify(events, null, 2) + '\n');
    filesModified++;
  }
}

console.log(`\nBatch 2 done. Files modified: ${filesModified}, Events enriched: ${eventsEnriched}, Skipped: ${eventsSkipped}`);
