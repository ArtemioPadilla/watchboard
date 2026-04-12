/**
 * CLI render script for Watchboard daily video.
 *
 * Usage: cd video && npx tsx render.ts
 *
 * Fetches breaking data, bundles the Remotion project, and renders to MP4.
 */
import { execSync } from 'node:child_process';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import type { BreakingData } from './src/data/types.js';
import { calculateDuration } from './src/Video.js';

const ROOT_DIR = resolve(import.meta.dirname ?? '.');
const DATA_PATH = resolve(ROOT_DIR, 'src/data/breaking.json');
const OUTPUT_DIR = resolve(ROOT_DIR, 'output');
const ENTRY_POINT = resolve(ROOT_DIR, 'src/Root.tsx');
const NARRATION_PATH = resolve(ROOT_DIR, 'src/assets/narration.mp3');

async function main(): Promise<void> {
  console.log('=== Watchboard Video Renderer ===\n');

  // Step 1: Fetch breaking data
  console.log('[1/4] Fetching breaking data...');
  execSync('npx tsx src/data/fetch-breaking.ts', {
    cwd: ROOT_DIR,
    stdio: 'inherit',
  });

  if (!existsSync(DATA_PATH)) {
    console.error('ERROR: Breaking data not found at', DATA_PATH);
    process.exit(1);
  }

  const data: BreakingData = JSON.parse(readFileSync(DATA_PATH, 'utf-8'));
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
    inputProps: { data },
  });

  // Override duration based on actual tracker count
  composition.durationInFrames = durationInFrames;

  // Step 4: Render
  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });
  const outputPath = resolve(OUTPUT_DIR, `watchboard-${data.date}.mp4`);

  console.log(`[4/4] Rendering to ${outputPath}...`);
  await renderMedia({
    composition,
    serveUrl: bundled,
    codec: 'h264',
    outputLocation: outputPath,
    inputProps: { data },
  });

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
