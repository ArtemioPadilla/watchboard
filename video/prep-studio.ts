/**
 * Prepare data for Remotion Studio: same data-prep that render.ts does
 * (fetch breaking news + download thumbnails as base64) but writes to
 * src/data/studio-data.json instead of rendering. Studio's defaultProps
 * import this so the timeline shows REAL globe + photos, not SAMPLE_DATA.
 *
 * Run: cd video && npx tsx prep-studio.ts
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = resolve(ROOT_DIR, 'src/data/breaking.json');
const STUDIO_PATH = resolve(ROOT_DIR, 'src/data/studio-data.json');

async function downloadThumbnail(url: string): Promise<Buffer | null> {
  const headers = {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    Referer: 'https://www.google.com/',
  };
  try {
    const resp = await fetch(url, {
      headers,
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) return null;
    const ct = resp.headers.get('content-type') ?? '';
    if (!ct.startsWith('image/')) return null;
    return Buffer.from(await resp.arrayBuffer());
  } catch {
    return null;
  }
}

async function main() {
  console.log('[prep-studio] Refreshing breaking.json from RSS feeds...');
  try {
    execSync('npx tsx src/data/fetch-breaking.ts', {
      cwd: ROOT_DIR,
      stdio: 'inherit',
    });
  } catch (err) {
    console.warn('[prep-studio] fetch-breaking failed; using existing breaking.json');
  }

  if (!existsSync(DATA_PATH)) {
    console.error('[prep-studio] breaking.json not found at', DATA_PATH);
    process.exit(1);
  }

  const data = JSON.parse(readFileSync(DATA_PATH, 'utf8'));
  if (!data.trackers || data.trackers.length === 0) {
    console.error('[prep-studio] No trackers in breaking.json');
    process.exit(1);
  }

  console.log(`[prep-studio] Downloading ${data.trackers.length} thumbnails as base64...`);
  for (const tracker of data.trackers) {
    if (!Array.isArray(tracker.thumbnailUrls) || tracker.thumbnailUrls.length === 0) {
      console.log(`  ${tracker.name}: no thumbnailUrls — skipping`);
      continue;
    }
    let downloaded = false;
    for (const url of tracker.thumbnailUrls) {
      const buf = await downloadThumbnail(url);
      if (buf && buf.length > 5000) {
        const ct = url.endsWith('.png') ? 'image/png' : url.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
        tracker.thumbnailBase64 = `data:${ct};base64,${buf.toString('base64')}`;
        console.log(`  ${tracker.name}: ${(buf.length / 1024).toFixed(0)} KB`);
        downloaded = true;
        break;
      }
    }
    if (!downloaded) console.log(`  ${tracker.name}: all thumbnail URLs failed`);
  }

  writeFileSync(STUDIO_PATH, JSON.stringify(data, null, 2) + '\n');
  console.log(`[prep-studio] Wrote ${STUDIO_PATH} with ${data.trackers.length} trackers + thumbnails.`);
  console.log('[prep-studio] Now restart Remotion Studio (npm run dev) — preview will use this data.');
}

main().catch((err) => {
  console.error('[prep-studio] Fatal:', err);
  process.exit(1);
});
