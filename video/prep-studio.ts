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
const GEO_PATH = resolve(ROOT_DIR, '../public/geo/countries-110m.json');

// Mirror render.ts texture preference order. First file that exists wins.
const EARTH_TEXTURE_DARK = [
  resolve(ROOT_DIR, '../public/textures/earth-night-lights-nasa.jpg'),
  resolve(ROOT_DIR, '../public/textures/earth-dark-blend-4k.webp'),
  resolve(ROOT_DIR, '../public/textures/earth-dark-threejs.jpg'),
];
const EARTH_TEXTURE_DAY = [
  resolve(ROOT_DIR, '../public/textures/earth-clouds-nasa-2k.jpg'),
  resolve(ROOT_DIR, '../public/textures/earth-solar-2k.jpg'),
  resolve(ROOT_DIR, '../public/textures/earth-day-4k.jpg'),
  resolve(ROOT_DIR, '../public/textures/earth-day-atmos-2k.jpg'),
];

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

  // Load GeoJSON for the globe outline
  let geoFeatures: unknown[] = [];
  try {
    const geoData = JSON.parse(readFileSync(GEO_PATH, 'utf-8'));
    geoFeatures = geoData.features ?? [];
    console.log(`[prep-studio] GeoJSON: ${geoFeatures.length} country features`);
  } catch (err) {
    console.warn(`[prep-studio] GeoJSON load failed (${(err as Error).message}) — globe outline will be empty`);
  }

  // Encode an Earth texture as base64. Tries dark first (default theme).
  let earthTexture = '';
  const candidates = [...EARTH_TEXTURE_DARK, ...EARTH_TEXTURE_DAY];
  for (const tex of candidates) {
    if (existsSync(tex)) {
      try {
        const buf = readFileSync(tex);
        const ext = tex.endsWith('.webp') ? 'webp' : tex.endsWith('.png') ? 'png' : 'jpeg';
        earthTexture = `data:image/${ext};base64,${buf.toString('base64')}`;
        console.log(`[prep-studio] Earth texture: ${tex.split('/').pop()} (${(buf.length / 1024).toFixed(0)} KB)`);
        break;
      } catch {}
    }
  }
  if (!earthTexture) {
    console.warn('[prep-studio] No Earth texture found — globe will render as solid color');
  }

  // Build the bundle Studio reads
  const bundle = { ...data, _geoFeatures: geoFeatures, _earthTexture: earthTexture };
  writeFileSync(STUDIO_PATH, JSON.stringify(bundle, null, 2) + '\n');
  const sizeMb = (JSON.stringify(bundle).length / 1024 / 1024).toFixed(1);
  console.log(`[prep-studio] Wrote ${STUDIO_PATH} (${sizeMb} MB, ${data.trackers.length} trackers + globe assets).`);
  console.log('[prep-studio] Restart Remotion Studio (Ctrl+C then make video) to pick it up.');
}

main().catch((err) => {
  console.error('[prep-studio] Fatal:', err);
  process.exit(1);
});
