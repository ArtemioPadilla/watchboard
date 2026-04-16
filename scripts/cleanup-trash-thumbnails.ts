#!/usr/bin/env npx tsx
/**
 * cleanup-trash-thumbnails.ts
 *
 * Scans all tracker event files and removes/nullifies thumbnails
 * that fail validation (lh3 Google icons, 403 hotlink-blocked, etc.)
 *
 * Usage:
 *   npx tsx scripts/cleanup-trash-thumbnails.ts              # dry run
 *   npx tsx scripts/cleanup-trash-thumbnails.ts --apply      # apply changes
 *   npx tsx scripts/cleanup-trash-thumbnails.ts --head-check # also verify via HTTP HEAD
 */

import fs from 'fs';
import path from 'path';
import { validateThumbnail, ThumbnailDeduplicator } from './thumbnail-utils.js';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const headCheck = args.includes('--head-check');

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const trackersDir = path.join(ROOT, 'trackers');

interface MediaItem {
  type: string;
  url: string;
  caption?: string;
  source?: string;
  thumbnail?: string;
}

interface TimelineEvent {
  id: string;
  media?: MediaItem[];
  [key: string]: unknown;
}

async function main() {
  console.log(`🧹 Thumbnail cleanup ${apply ? '(APPLYING)' : '(DRY RUN — use --apply to write)'}${headCheck ? ' [HEAD checks enabled]' : ''}\n`);

  const slugs = fs.readdirSync(trackersDir).filter((slug) => {
    const eventsDir = path.join(trackersDir, slug, 'data', 'events');
    return fs.existsSync(eventsDir) && fs.statSync(eventsDir).isDirectory();
  });

  const dedup = new ThumbnailDeduplicator(5);
  let totalScanned = 0;
  let totalRemoved = 0;
  let totalKept = 0;
  const removedByReason: Record<string, number> = {};

  // Pass 1: Count duplicates across all events (don't reject yet)
  for (const slug of slugs) {
    const eventsDir = path.join(trackersDir, slug, 'data', 'events');
    for (const file of fs.readdirSync(eventsDir).filter(f => f.endsWith('.json'))) {
      try {
        const events: TimelineEvent[] = JSON.parse(fs.readFileSync(path.join(eventsDir, file), 'utf8'));
        for (const e of events) {
          for (const m of e.media || []) {
            if (m.thumbnail) dedup.check(m.thumbnail);
          }
        }
      } catch {}
    }
  }

  const duplicates = dedup.getDuplicates();
  if (duplicates.size > 0) {
    console.log(`Found ${duplicates.size} duplicate thumbnail URLs (used > 3 times):`);
    for (const [url, count] of duplicates) {
      console.log(`  ${count}x  ${url.substring(0, 120)}`);
    }
    console.log('');
  }

  // Pass 2: Validate and clean
  for (const slug of slugs) {
    const eventsDir = path.join(trackersDir, slug, 'data', 'events');
    const eventFiles = fs.readdirSync(eventsDir).filter(f => f.endsWith('.json'));

    for (const file of eventFiles) {
      const filePath = path.join(eventsDir, file);
      let events: TimelineEvent[];
      try {
        events = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      } catch { continue; }
      if (!Array.isArray(events)) continue;

      let fileModified = false;

      for (const event of events) {
        for (const m of event.media || []) {
          if (!m.thumbnail) continue;
          totalScanned++;

          // Run validation
          const validation = validateThumbnail(m.thumbnail, { enableHeadCheck: headCheck });
          const isDuplicate = duplicates.has(m.thumbnail);

          if (!validation.url || isDuplicate) {
            const reason = !validation.url ? validation.rejectedReason! : `duplicate_${duplicates.get(m.thumbnail)}x`;
            console.log(`  ❌ [${slug}/${file}] ${event.id}: ${reason}`);
            console.log(`     ${m.thumbnail.substring(0, 120)}`);

            removedByReason[reason] = (removedByReason[reason] || 0) + 1;
            totalRemoved++;

            if (apply) {
              delete m.thumbnail;
              fileModified = true;
            }
          } else {
            totalKept++;
          }
        }
      }

      if (fileModified && apply) {
        fs.writeFileSync(filePath, JSON.stringify(events, null, 2) + '\n');
      }
    }
  }

  // Summary
  console.log('\n' + '─'.repeat(60));
  console.log(`Scanned: ${totalScanned} thumbnails`);
  console.log(`Kept:    ${totalKept} ✅`);
  console.log(`Removed: ${totalRemoved} ❌${apply ? '' : ' (would remove)'}`);
  console.log('');
  console.log('Removal breakdown:');
  for (const [reason, count] of Object.entries(removedByReason).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${count.toString().padStart(4)}  ${reason}`);
  }
  if (!apply) {
    console.log('\nRun with --apply to write changes.');
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
