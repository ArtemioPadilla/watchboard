/**
 * CLI render script for Watchboard daily video.
 *
 * Usage: cd video && npx tsx render.ts
 *
 * Fetches breaking data, bundles the Remotion project, and renders to MP4.
 * Every step has graceful fallbacks so we always produce SOMETHING.
 */
import { execSync } from 'node:child_process';
import { readFileSync, existsSync, mkdirSync, readdirSync, copyFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import type { BreakingData } from './src/data/types.js';
import { SAMPLE_DATA } from './src/data/types.js';
import { calculateDuration } from './src/Video.js';

const ROOT_DIR = resolve(import.meta.dirname ?? '.');
const DATA_PATH = resolve(ROOT_DIR, 'src/data/breaking.json');
const OUTPUT_DIR = resolve(ROOT_DIR, 'output');
const ENTRY_POINT = resolve(ROOT_DIR, 'src/Root.tsx');
const NARRATION_PATH = resolve(ROOT_DIR, 'src/assets/narration.mp3');

// Earth texture candidates in priority order
const EARTH_TEXTURE_CANDIDATES = [
  resolve(ROOT_DIR, '../public/textures/earth-night-lights-nasa.jpg'),
  resolve(ROOT_DIR, '../public/textures/earth-dark-blend-4k.webp'),
  resolve(ROOT_DIR, '../public/textures/earth-dark-threejs.jpg'),
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

async function main(): Promise<void> {
  console.log('=== Watchboard Video Renderer ===\n');

  // Step 1: Fetch breaking data (with fallback to sample data)
  console.log('[1/4] Fetching breaking data...');
  let data: BreakingData;
  try {
    execSync('npx tsx src/data/fetch-breaking.ts', {
      cwd: ROOT_DIR,
      stdio: 'inherit',
    });
    data = JSON.parse(readFileSync(DATA_PATH, 'utf-8'));
  } catch (err) {
    console.warn('  Failed to fetch breaking data — using sample data:', (err as Error).message);
    data = SAMPLE_DATA;
  }

  // Validate data has usable trackers
  if (!data.trackers || data.trackers.length === 0) {
    console.warn('  No trackers in data — using sample data');
    data = SAMPLE_DATA;
  }

  // Download tracker thumbnails for Remotion (can't fetch external URLs during render)
  console.log('  Downloading tracker thumbnails...');
  const thumbnailDeadline = Date.now() + 30_000; // 30s total budget
  for (const tracker of data.trackers) {
    if (Date.now() > thumbnailDeadline) {
      console.warn('  Thumbnail download budget exhausted — skipping remaining');
      break;
    }
    try {
      for (const url of tracker.thumbnailUrls) {
        const buf = await downloadThumbnail(url);
        if (buf && buf.length > 5000) {
          const ct = url.endsWith('.png') ? 'image/png' : url.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
          tracker.thumbnailBase64 = `data:${ct};base64,${buf.toString('base64')}`;
          console.log(`    ${tracker.name}: thumbnail downloaded (${(buf.length / 1024).toFixed(0)} KB)`);
          break;
        }
      }
    } catch (err) {
      console.warn(`    ${tracker.name}: thumbnail download error — skipping:`, (err as Error).message);
    }
    if (!tracker.thumbnailBase64) {
      console.log(`    ${tracker.name}: no thumbnail found, will use globe`);
    }
  }

  // Load GeoJSON for globe rendering
  let geoFeatures: unknown[] = [];
  try {
    const GEO_PATH = resolve(ROOT_DIR, '../public/geo/countries-110m.json');
    const geoData = JSON.parse(readFileSync(GEO_PATH, 'utf-8'));
    geoFeatures = geoData.features;
  } catch (err) {
    console.warn('  GeoJSON load failed — globe will render without countries:', (err as Error).message);
  }

  // Load earth night-lights texture as base64 data URL (try multiple candidates)
  let earthTexture = '';
  try {
    for (const texPath of EARTH_TEXTURE_CANDIDATES) {
      if (existsSync(texPath)) {
        const texBuf = readFileSync(texPath);
        const ext = texPath.endsWith('.webp') ? 'webp' : texPath.endsWith('.png') ? 'png' : 'jpeg';
        earthTexture = `data:image/${ext};base64,${texBuf.toString('base64')}`;
        console.log(`  Earth texture: ${texPath.split('/').pop()} (${(texBuf.length / 1024).toFixed(0)} KB)`);
        break;
      }
    }
    if (!earthTexture) {
      console.warn('  No earth texture found — globe will use polygon fallback');
    }
  } catch (err) {
    console.warn('  Earth texture load failed — globe will use polygon fallback:', (err as Error).message);
  }

  // Music rotation: pick a track based on day-of-year
  const musicDir = resolve(ROOT_DIR, 'music');
  try {
    if (existsSync(musicDir)) {
      const musicFiles = readdirSync(musicDir).filter(f => f.endsWith('.mp3'));
      if (musicFiles.length > 0) {
        const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
        const selectedMusic = musicFiles[dayOfYear % musicFiles.length];
        copyFileSync(resolve(musicDir, selectedMusic), resolve(ROOT_DIR, 'public/bg-music.mp3'));
        console.log(`  Music: ${selectedMusic}`);
      }
    }
  } catch (err) {
    console.warn('  Music rotation failed — using existing track:', (err as Error).message);
  }

  const trackerCount = Math.min(data.trackers.length, 3);
  const durationInFrames = calculateDuration(trackerCount);

  console.log(`\n  Date: ${data.date}`);
  console.log(`  Trackers: ${trackerCount}`);
  console.log(`  Duration: ${durationInFrames} frames (${(durationInFrames / 30).toFixed(1)}s)\n`);

  // Step 2: Bundle
  console.log('[2/4] Bundling Remotion project...');
  const bundled = await bundle({
    entryPoint: ENTRY_POINT,
  });

  // Step 3: Select composition with data
  console.log('[3/4] Selecting composition...');
  const composition = await selectComposition({
    serveUrl: bundled,
    id: 'WatchboardDaily',
    inputProps: { data, geoFeatures, earthTexture },
  });

  // Override duration based on actual tracker count
  composition.durationInFrames = durationInFrames;

  // Step 4: Render (with retry)
  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });
  const outputPath = resolve(OUTPUT_DIR, `watchboard-${data.date}.mp4`);

  console.log(`[4/4] Rendering to ${outputPath}...`);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await renderMedia({
        composition,
        serveUrl: bundled,
        codec: 'h264',
        outputLocation: outputPath,
        inputProps: { data, geoFeatures, earthTexture },
      });
      break;
    } catch (err) {
      if (attempt === 0) {
        console.warn('  Render failed, retrying...', (err as Error).message);
      } else {
        throw err;
      }
    }
  }

  // Output validation
  const outputStat = statSync(outputPath);
  if (outputStat.size < 100_000) {
    throw new Error(`Output too small (${outputStat.size} bytes) — render likely failed`);
  }
  console.log(`  Output: ${(outputStat.size / 1024 / 1024).toFixed(1)} MB`);

  // Step 5 (optional): Merge narration audio via ffmpeg
  if (existsSync(NARRATION_PATH)) {
    console.log('[5/5] Merging narration audio...');
    const finalPath = resolve(OUTPUT_DIR, `watchboard-${data.date}-final.mp4`);
    try {
      execSync(
        `ffmpeg -y -i "${outputPath}" -i "${NARRATION_PATH}" ` +
          `-filter_complex "[1:a]volume=0.9[narr];[0:a][narr]amix=inputs=2:duration=first" ` +
          `-c:v copy "${finalPath}"`,
        { cwd: ROOT_DIR, stdio: 'inherit' },
      );
      console.log(`Narration merged: ${finalPath}`);
    } catch {
      console.warn('ffmpeg narration merge failed — video without narration is still available');
    }
  }

  console.log(`\nDone! Video saved to: ${outputPath}`);
  console.log(`Duration: ${(durationInFrames / 30).toFixed(1)}s`);
  console.log(`Resolution: 1080x1920 (9:16 vertical)`);
}

main().catch((err) => {
  console.error('Render failed:', err);
  process.exit(1);
});
