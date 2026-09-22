/**
 * og-render-worker.mjs — Isolated worker thread for @resvg/resvg-js rendering.
 *
 * Executed by Node.js Worker threads. Receives an SVG string via workerData,
 * renders it to PNG using @resvg/resvg-js (a native addon), and posts the
 * result back to the parent thread.
 *
 * Isolation rationale: @resvg/resvg-js can segfault (SIGSEGV / exit 139) on
 * certain SVG inputs (complex paths, corrupt data URIs, resource exhaustion).
 * Running in a Worker means the crash is scoped to this thread only; the main
 * build process survives and can emit a fallback PNG instead.
 *
 * Protocol:
 *   workerData  → { svg: string; width: number }
 *   postMessage ← { ok: true;  png: Uint8Array }   — success
 *              ← { ok: false; error: string }       — handled error
 */
import { workerData, parentPort } from 'node:worker_threads';
import { Resvg } from '@resvg/resvg-js';

const { svg, width } = workerData;

try {
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: width } });
  const pngData = resvg.render();
  const pngBuffer = pngData.asPng();
  const uint8 = new Uint8Array(pngBuffer.buffer, pngBuffer.byteOffset, pngBuffer.byteLength);
  // No transfer list: resvg-js's returned buffer is backed by a native (N-API)
  // ArrayBuffer that V8 cannot detach for a zero-copy transfer — attempting
  // one throws "DataCloneError: Cannot transfer object of unsupported type",
  // which this try/catch swallowed, silently sending {ok:false} and making
  // every OG card fall back to a plain solid-color card with no map. A plain
  // structured-clone copy works regardless of the buffer's origin; the copy
  // cost is negligible since this runs at build time, not per-request.
  parentPort.postMessage({ ok: true, png: uint8 });
} catch (err) {
  parentPort.postMessage({ ok: false, error: String(err) });
}
