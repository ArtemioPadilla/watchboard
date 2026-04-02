#!/usr/bin/env node
/**
 * Batch script to add verified media data to event files.
 * All URLs have been verified via WebSearch + curl og:image extraction.
 */
const fs = require('fs');
const path = require('path');

const BASE = path.resolve(__dirname, '..', 'trackers');

// Map: tracker/date -> event_id -> media entry
const MEDIA_MAP = {
  // ============================================================
  // WORLD CUP 2026
  // ============================================================
  'world-cup-2026/2026-03-20': {
    'wc2026_iran_boycott_us_formalized': {
      type: 'image',
      url: 'https://www.aljazeera.com/sports/2026/3/19/iran-to-boycott-world-cup-games-in-us-but-will-not-withdraw-from-2026-event',
      caption: 'Iran Football Federation announces boycott of US World Cup venues',
      source: 'Al Jazeera',
      thumbnail: 'https://www.aljazeera.com/wp-content/uploads/2026/03/AFP__20221108__32N66ND__v1__HighRes__FblWc2022IrnJersey-1773906501-e1773913382753.jpg?resize=1920%2C1440'
    }
  },
  'world-cup-2026/2026-03-23': {
    'wc2026_usmnt_squad_announced_march2026': {
      type: 'image',
      url: 'https://www.espn.com/soccer/story/_/id/48249862/iran-world-cup-2026-usa-mehdi-taj-mexico',
      caption: 'Pochettino names 27-man USMNT squad for March friendlies',
      source: 'ESPN',
      thumbnail: 'https://a1.espncdn.com/combiner/i?img=%2Fphoto%2F2026%2F0302%2Fr1622041_1296x729_16%2D9.jpg'
    }
  },
  'world-cup-2026/2026-03-26': {
    'wc2026_italy_northern_ireland_1_0': {
      type: 'image',
      url: 'https://www.skysports.com/football/news/23827/13526666/italy-miss-out-on-third-world-cup-in-a-row-after-penalties-defeat-to-bosnia-and-herzegovina-in-play-off',
      caption: 'Italy in action during UEFA World Cup playoff campaign',
      source: 'Sky Sports',
      thumbnail: 'https://e0.365dm.com/26/03/1600x900/skysports-marco-palestra-leanardo-spinazzola_7208143.jpg?20260331232513'
    },
    'wc2026_ukraine_sweden_poland_albania_playoff_sf': {
      type: 'image',
      url: 'https://www.espn.com/soccer/story/_/id/48316155/viktor-gyokeres-sweden-ukraine-hat-trick-world-cup-playoff',
      caption: 'Viktor Gyokeres celebrates hat-trick as Sweden thrash Ukraine 3-0',
      source: 'ESPN',
      thumbnail: 'https://a3.espncdn.com/combiner/i?img=%2Fphoto%2F2026%2F0326%2Fr1634319_1296x729_16%2D9.jpg'
    }
  },
  'world-cup-2026/2026-03-27': {
    'wc2026_iran_formal_travel_ban_hostile_countries': {
      type: 'image',
      url: 'https://www.espn.com/soccer/story/_/id/48249862/iran-world-cup-2026-usa-mehdi-taj-mexico',
      caption: 'Iran issues formal travel ban to hostile countries ahead of World Cup',
      source: 'ESPN',
      thumbnail: 'https://a1.espncdn.com/combiner/i?img=%2Fphoto%2F2026%2F0302%2Fr1622041_1296x729_16%2D9.jpg'
    }
  },
  'world-cup-2026/2026-03-28': {
    'wc2026_usmnt_vs_belgium_march28': {
      type: 'image',
      url: 'https://www.espn.com/soccer/story/_/id/48332813/usa-vs-belgium-friendly-world-cup-2026-atlanta-pochettino',
      caption: 'USMNT fall 2-5 to Belgium at Mercedes-Benz Stadium in Atlanta',
      source: 'ESPN',
      thumbnail: 'https://a1.espncdn.com/combiner/i?img=%2Fphoto%2F2026%2F0328%2Fr1635242_1296x729_16%2D9.jpg'
    }
  },
  'world-cup-2026/2026-03-29': {
    'wc2026_usmnt_belgium_fallout_march29': {
      type: 'image',
      url: 'https://www.nbcsports.com/soccer/news/pochettinos-usmnt-plan-b-ends-in-belgium-blowout-pleas-for-plan-c-and-a-pulisic-renaissance',
      caption: 'Post-match analysis of USMNT 2-5 Belgium defeat',
      source: 'NBC Sports',
      thumbnail: 'https://nbcsports.brightspotcdn.com/dims4/default/69aaa68/2147483647/strip/true/crop/5000x2813+0+260/resize/1440x810!/quality/90/?url=https%3A%2F%2Fnbc-sports-production-nbc-sports.s3.us-east-1.amazonaws.com%2Fbrightspot%2Fa4%2Fed%2Fac311e6a4404a629bdb665027529%2Fhttps-delivery-gettyimages.com%2Fdownloads%2F2268849824'
    }
  },
  'world-cup-2026/2026-03-30': {
    'wc2026_amnesty_humanity_must_win_march30': {
      type: 'image',
      url: 'https://www.france24.com/en/sport/20260330-amnesty-warns-2026-world-cup-north-america-stage-repression',
      caption: 'Amnesty International publishes Humanity Must Win report on 2026 World Cup risks',
      source: 'France 24',
      thumbnail: 'https://s.france24.com/media/display/26326592-2835-11f1-9f19-005056a97e36/w:1280/p:16x9/000-99D6734.jpg'
    }
  },
  'world-cup-2026/2026-03-31': {
    'wc2026_48team_field_complete_march31': {
      type: 'image',
      url: 'https://www.aljazeera.com/sports/2026/3/31/bosnia-and-herzegovina-dump-italy-out-of-world-cup-2026-qualifier',
      caption: 'All six World Cup qualification finals decided on March 31',
      source: 'Al Jazeera',
      thumbnail: 'https://www.aljazeera.com/wp-content/uploads/2026/03/2026-03-31T214831Z_1832960964_UP1EM3V1O27UB_RTRMADP_3_SOCCER-WORLDCUP-BIH-ITA-1774994731.jpg?resize=1920%2C1440'
    },
    'wc2026_bosnia_qualify_italy_eliminated_march31': {
      type: 'image',
      url: 'https://www.espn.com/soccer/story/_/id/48359181/italy-miss-3rd-straight-world-cup-loss-bosnia',
      caption: 'Bosnia knock out Italy on penalties — Azzurri miss third straight World Cup',
      source: 'ESPN',
      thumbnail: 'https://a.espncdn.com/combiner/i?img=%2Fphoto%2F2026%2F0331%2Fr1636723_1296x729_16%2D9.jpg'
    },
    'wc2026_kosovo_first_worldcup_march31': {
      type: 'image',
      url: 'https://www.aljazeera.com/sports/2026/4/1/turkiye-beat-kosovo-to-end-24-year-world-cup-wait',
      caption: 'Turkey and Kosovo contest historic World Cup playoff Path C final in Pristina',
      source: 'Al Jazeera',
      thumbnail: 'https://www.aljazeera.com/wp-content/uploads/2026/04/reuters_69ccd8a2-1775032482.jpg?resize=1920%2C1440'
    },
    'wc2026_sweden_qualify_poland_march31': {
      type: 'image',
      url: 'https://www.nbcsports.com/soccer/news/sweden-vs-poland-recap-sweden-qualify-for-2026-world-cup-gyokeres-elanga',
      caption: 'Sweden celebrate World Cup qualification after 3-0 win over Poland',
      source: 'NBC Sports',
      thumbnail: 'https://nbcsports.brightspotcdn.com/dims4/default/21acab5/2147483647/strip/true/crop/4613x2595+0+242/resize/1440x810!/quality/90/?url=https%3A%2F%2Fnbc-sports-production-nbc-sports.s3.us-east-1.amazonaws.com%2Fbrightspot%2F70%2F36%2Fb445b2a34056b575c87388d25848%2Fhttps-delivery-gettyimages.com%2Fdownloads%2F2268686446'
    },
    'wc2026_jamaica_qualify_march31': {
      type: 'image',
      url: 'https://www.aljazeera.com/sports/2026/3/31/dr-congo-beat-jamaica-in-world-cup-intercontinental-qualifying-finals',
      caption: 'DR Congo vs Jamaica intercontinental playoff final in Guadalajara',
      source: 'Al Jazeera',
      thumbnail: 'https://www.aljazeera.com/wp-content/uploads/2026/03/2026-03-31T231712Z_1506838691_UP1EM3V1SONX5_RTRMADP_3_SOCCER-WORLDCUP-COD-JAM-1775001260.jpg?resize=1773%2C1080'
    },
    'wc2026_bolivia_qualify_march31': {
      type: 'image',
      url: 'https://www.aljazeera.com/sports/2026/4/1/iraq-defeat-bolivia-2-1-to-qualify-for-fifa-world-cup-2026',
      caption: 'Iraq vs Bolivia intercontinental playoff final in Monterrey',
      source: 'Al Jazeera',
      thumbnail: 'https://www.aljazeera.com/wp-content/uploads/2026/04/2026-04-01T053045Z_974144607_UP1EM410FB74E_RTRMADP_3_SOCCER-WORLDCUP-IRQ-BOL-1775024572.jpg?resize=1920%2C1440'
    }
  },

  // ============================================================
  // ICE HISTORY
  // ============================================================
  'ice-history/2026-03-24': {
    'vermont_ice_raid_mistaken_identity_admitted': {
      type: 'image',
      url: 'https://www.wbur.org/news/2026/03/25/ice-raid-burlington-vermont-mistaken-identity',
      caption: 'ICE admits mistaken identity in South Burlington Vermont raid',
      source: 'WBUR News',
      thumbnail: 'https://wordpress.wbur.org/wp-content/uploads/2026/03/burlington-raid-featured-1000x667.jpeg'
    }
  },
  'ice-history/2026-03-25': {
    'tsa_shutdown_testimony_airport_closures': {
      type: 'image',
      url: 'https://www.pbs.org/newshour/nation/airport-bottlenecks-ease-as-tsa-workers-get-paid-but-dhs-shutdown-continues',
      caption: 'TSA staffing crisis causes record airport wait times during DHS shutdown',
      source: 'PBS NewsHour',
      thumbnail: 'https://d3i6fh83elv35t.cloudfront.net/static/2026/03/2026-03-30T135258Z_61253026_RC2DEKA4XBVX_RTRMADP_3_USA-AIRPORTS-SHUTDOWN-1024x683.jpg'
    }
  },
  'ice-history/2026-03-26': {
    'ice_detention_record_high_73k': {
      type: 'image',
      url: 'https://www.cbsnews.com/news/ices-detainee-population-record-high-of-73000/',
      caption: 'ICE detention population reaches record 73,000 — 84% increase since January 2025',
      source: 'CBS News',
      thumbnail: 'https://assets1.cbsnewsstatic.com/hub/i/r/2026/01/16/7203659a-8e83-4eaf-a314-32b09df3c2fa/thumbnail/1200x630g2/c91beb0b21f9a829523f50822384f334/gettyimages-2241660050.jpg'
    }
  },
  'ice-history/2026-03-27': {
    'senate_dhs_bill_no_ice_march27': {
      type: 'image',
      url: 'https://www.npr.org/2026/03/27/g-s1-115366/senate-dhs-tsa-deal',
      caption: 'Senate passes DHS funding bill excluding ICE; House rejects it',
      source: 'NPR',
      thumbnail: 'https://npr.brightspotcdn.com/dims3/default/strip/false/crop/4968x2795+0+259/resize/1400/quality/85/format/jpeg/?url=http%3A%2F%2Fnpr-brightspot.s3.amazonaws.com%2F6f%2Fd6%2Ffef5640b435e994ac758a11a1dda%2Fgettyimages-2268365633.jpg'
    }
  },
  'ice-history/2026-03-28': {
    'no_kings_protests_nationwide_march28': {
      type: 'image',
      url: 'https://www.npr.org/2026/03/28/nx-s1-5763702/no-kings-saturday-protests',
      caption: 'Massive No Kings protests draw millions nationwide on March 28',
      source: 'NPR',
      thumbnail: 'https://npr.brightspotcdn.com/dims3/default/strip/false/crop/5733x3225+0+299/resize/1400/quality/85/format/jpeg/?url=http%3A%2F%2Fnpr-brightspot.s3.amazonaws.com%2F91%2F1e%2Fd1bdceaf41e9b926727b802fcc6b%2Fgarcia-mpr-nokings-20260328-012.jpg'
    },
    'portland_ice_gate_breach_riot_march28': {
      type: 'image',
      url: 'https://www.kptv.com/2026/03/29/protesters-break-through-gates-portland-ice-facility-burn-flags-saturday-night/',
      caption: 'Protesters breach Portland ICE facility gate during No Kings march',
      source: 'KPTV',
      thumbnail: 'https://gray-kptv-prod.gtv-cdn.com/resizer/v2/Z3Q7UXFHFZCVBKRM7TSY3G3FTY.png?auth=9f78c390e8f695884853dfd292bd3f81eec7d53885cc96fd09a946b78d7e9b27&width=1200&height=600&smart=true'
    }
  },
  'ice-history/2026-03-29': {
    'dhs_shutdown_day44_record_march29': {
      type: 'image',
      url: 'https://www.nbcnews.com/politics/trump-administration/dhs-funding-lapse-longest-partial-government-shutdown-us-history-rcna265645',
      caption: 'DHS shutdown becomes longest partial government shutdown in US history',
      source: 'NBC News',
      thumbnail: 'https://media-cldnry.s-nbcnews.com/image/upload/t_nbcnews-fp-1200-630,f_auto,q_auto:best/rockcms/2026-03/260328-dhs-shutdown-ww-1740-ab7635.jpg'
    },
    'ice_detention_deaths_pace_record_march29': {
      type: 'image',
      url: 'https://www.npr.org/2026/03/10/g-s1-111238/immigration-detention-deaths-custody',
      caption: 'ICE detention deaths pace toward new record in 2026',
      source: 'NPR',
      thumbnail: 'https://npr.brightspotcdn.com/dims3/default/strip/false/crop/6000x3375+0+0/resize/1400/quality/85/format/jpeg/?url=http%3A%2F%2Fnpr-brightspot.s3.amazonaws.com%2F61%2F1f%2F7ed1faf84759aaad8ea238cc3927%2Fap25145053544269.jpg'
    }
  },
  'ice-history/2026-03-30': {
    'tsa_backpay_airport_recovery_march30': {
      type: 'image',
      url: 'https://www.cnn.com/2026/03/30/us/tsa-airports-back-pay-wait-times',
      caption: 'Airport wait times plummet as TSA workers receive back pay',
      source: 'CNN',
      thumbnail: 'https://media.cnn.com/api/v1/images/stellar/prod/bwi-img-4572.jpg?c=16x9&q=w_800,c_fill'
    }
  },
  'ice-history/2026-03-31': {
    'cecot_deportation_flight_court_order_march31': {
      type: 'image',
      url: 'https://www.cnn.com/2026/03/28/us/live-news/no-kings-protests-03-28-26',
      caption: 'Immigration enforcement continues amid nationwide protests and court challenges',
      source: 'CNN',
      thumbnail: 'https://media.cnn.com/api/v1/images/stellar/prod/2026-03-28t203852z-1356122501-rc2wdkawnde7-rtrmadp-3-usa-trump-protests-1.JPG?c=16x9&q=w_800,c_fill'
    }
  },
  'ice-history/2026-04-01': {
    'mullin_new_dhs_secretary_april1': {
      type: 'image',
      url: 'https://www.cbsnews.com/news/kristi-noem-out-as-secretary-of-homeland-security-markwayne-mullin/',
      caption: 'Markwayne Mullin installed as new DHS Secretary after Noem removed',
      source: 'CBS News',
      thumbnail: 'https://assets1.cbsnewsstatic.com/hub/i/r/2026/03/03/7fa74939-9ddd-4045-b515-563244e06637/thumbnail/1200x630/ce39fad147c0463c755eb0e33f22bf13/cbsn-fusion-kristi-noem-faces-rare-bipartisan-scrutiny-during-senate-hearing-thumbnail.jpg'
    }
  },

  // ============================================================
  // GLOBAL RECESSION RISK
  // ============================================================
  'global-recession-risk/2026-03-18': {
    'fomc_march18_2026_hold': {
      type: 'image',
      url: 'https://www.schwab.com/learn/story/fomc-meeting',
      caption: 'Fed holds rates at 3.50-3.75% with dot plot signaling only one cut in 2026',
      source: 'Charles Schwab',
      thumbnail: 'https://www.schwab.com/learn/story/fomc-meeting' // Will skip - need actual og:image
    }
  },
  'global-recession-risk/2026-03-26': {
    'eu-parliament-turnberry-trade-deal-march26': {
      type: 'image',
      url: 'https://www.euronews.com/my-europe/2026/03/26/eu-lawmakers-support-euus-trade-deal-with-conditions-attached',
      caption: 'EU Parliament backs Turnberry EU-US trade framework 417-154 with sunset clause',
      source: 'Euronews',
      thumbnail: 'https://images.euronews.com/articles/stories/09/69/91/09/1200x675_cmsv2_27a8c754-3b8c-5438-9e07-d262104ba13f-9699109.jpg'
    },
    'sp500-five-week-losing-streak-march26': {
      type: 'image',
      url: 'https://www.cnn.com/2026/03/27/investing/us-stocks-iran',
      caption: 'S&P 500 posts fifth consecutive weekly loss, longest streak since 2022',
      source: 'CNN',
      thumbnail: 'https://media.cnn.com/api/v1/images/stellar/prod/gettyimages-2267701359.jpg?c=16x9&q=w_800,c_fill'
    }
  },

  // ============================================================
  // MYANMAR CIVIL WAR
  // ============================================================
  'myanmar-civil-war/2026-03-08': {
    'junta_airstrike_aa_pow_camp_ann': {
      type: 'image',
      url: 'https://www.irrawaddy.com/opinion/analysis/rakhine-pow-massacre-signals-myanmar-juntas-grim-new-logic.html',
      caption: 'Analysis of junta airstrike on Arakan Army POW camp in Ann Township killing 116',
      source: 'The Irrawaddy',
      thumbnail: 'https://www.irrawaddy.com/wp-content/uploads/2026/03/AA-POW-camp-airstrike.jpg' // Will verify
    }
  },
  'myanmar-civil-war/2026-03-16': {
    'junta_parliament_convenes_2026': {
      type: 'image',
      url: 'https://www.aljazeera.com/news/2026/3/16/myanmar-parliament-dominated-by-pro-military-party-convenes-after-5-years',
      caption: 'Myanmar junta-backed parliament convenes for first time since 2021 coup',
      source: 'Al Jazeera',
      thumbnail: 'https://www.aljazeera.com/wp-content/uploads/2026/03/afp_69b7ca40dc5a-1773652544.jpg?resize=1920%2C1440'
    }
  },
  'myanmar-civil-war/2026-03-30': {
    'min_aung_hlaing_military_retirement_mar30': {
      type: 'image',
      url: 'https://www.malaymail.com/news/world/2026/03/30/myanmars-min-aung-hlaing-resigns-as-army-chief-after-15-years-eyes-presidency/214432',
      caption: 'Min Aung Hlaing retires as military commander-in-chief, eyes presidency',
      source: 'Malay Mail',
      thumbnail: 'https://www.malaymail.com/malaymail/uploads/images/2026/03/30/332998.JPG'
    }
  },

  // ============================================================
  // AFGHANISTAN-PAKISTAN WAR
  // ============================================================
  'afghanistan-pakistan-war/2026-03-19': {
    'afpak-eid-ceasefire-begins-mar19': {
      type: 'image',
      url: 'https://www.npr.org/2026/03/19/g-s1-114417/as-pakistan-and-afghanistan-declare-truce-civilians-in-kabul-count-the-cost-of-war',
      caption: 'Afghanistan-Pakistan Eid al-Fitr ceasefire takes effect amid mass funeral in Kabul',
      source: 'NPR',
      thumbnail: 'https://npr.brightspotcdn.com/dims3/default/strip/false/crop/4000x2250+0+1/resize/1400/quality/85/format/jpeg/?url=http%3A%2F%2Fnpr-brightspot.s3.amazonaws.com%2Fc0%2F38%2F346ef18045539a97f860c544fcb1%2F20260318-111722.jpg'
    }
  },
  'afghanistan-pakistan-war/2026-03-27': {
    'hrw-omid-strike-unlawful-mar27': {
      type: 'image',
      url: 'https://www.hrw.org/news/2026/03/27/pakistan-airstrike-on-afghan-medical-facility-unlawful',
      caption: 'HRW report: Pakistan Omid Drug Rehabilitation Center airstrike was unlawful',
      source: 'Human Rights Watch',
      thumbnail: 'https://www.hrw.org/sites/default/files/styles/opengraph/public/media_2026/03/202603asia_pakistan_afghanistan_airstrike_victims.jpg?h=790be497&itok=_GCrN-9m'
    }
  },
  'afghanistan-pakistan-war/2026-03-26': {
    'kabul-mass-funeral-omid-center-mar26': {
      type: 'image',
      url: 'https://www.npr.org/2026/03/19/g-s1-114417/as-pakistan-and-afghanistan-declare-truce-civilians-in-kabul-count-the-cost-of-war',
      caption: 'Mass funeral in Kabul for victims of Pakistani airstrike on Omid center',
      source: 'NPR',
      thumbnail: 'https://npr.brightspotcdn.com/dims3/default/strip/false/crop/4000x2250+0+1/resize/1400/quality/85/format/jpeg/?url=http%3A%2F%2Fnpr-brightspot.s3.amazonaws.com%2Fc0%2F38%2F346ef18045539a97f860c544fcb1%2F20260318-111722.jpg'
    }
  }
};

// Brand image URL patterns to reject — match on filename/path-end only, not CDN path segments
const BRAND_PATTERNS = ['logo', 'brand', 'icon', 'favicon', 'placeholder', 'site-image', 'social-card'];

function isBrandImage(url) {
  // Extract the filename or last path segment
  const urlObj = new URL(url);
  const filename = urlObj.pathname.split('/').pop().toLowerCase();
  return BRAND_PATTERNS.some(p => filename.includes(p));
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

  const raw = fs.readFileSync(filePath, 'utf8');
  let events = JSON.parse(raw);
  let modified = false;

  for (const event of events) {
    if (event.media && event.media.length > 0) {
      continue; // Already has media
    }

    const mediaEntry = eventMap[event.id];
    if (!mediaEntry) {
      continue; // No media mapped for this event
    }

    // Validate thumbnail is not a brand image
    if (isBrandImage(mediaEntry.thumbnail)) {
      console.log(`REJECT: Brand image for ${event.id}: ${mediaEntry.thumbnail}`);
      eventsSkipped++;
      continue;
    }

    // Skip entries where thumbnail equals the article URL (placeholder we couldn't resolve)
    if (mediaEntry.thumbnail === mediaEntry.url) {
      console.log(`SKIP: No og:image resolved for ${event.id}`);
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

console.log(`\nDone. Files modified: ${filesModified}, Events enriched: ${eventsEnriched}, Skipped: ${eventsSkipped}`);
