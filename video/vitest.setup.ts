/**
 * Point the tracker-history state at a throwaway directory before any module
 * reads it.
 *
 * `fetch-breaking.ts` resolves its state path at import time. Without this the
 * suite wrote — and rm'd — `video/state/tracker-history.json`, the committed
 * file that keeps the daily video from showing the same trackers two days in a
 * row. Running the tests deleted it, and nothing said so.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.WATCHBOARD_VIDEO_STATE_DIR = mkdtempSync(join(tmpdir(), 'wb-video-state-'));
