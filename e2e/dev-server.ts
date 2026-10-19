/**
 * Astro 7 runs `astro dev` as a daemon: the foreground process prints
 * "Dev server running at … (pid N)" and exits, leaving the server behind.
 * Playwright's `webServer` watches its command and treats that exit as the
 * server dying — "Process from config.webServer exited early" — so the suite
 * never starts. Hence globalSetup/globalTeardown instead.
 *
 * The part that cost two cancelled CI runs: **never abort a request while
 * waiting for a dev server.** Measured on this project under astro 7, the
 * first render takes ~28 s (0.45 s warm), and a poll that aborts at 2 s
 * cancels the compile it is waiting for, so the next poll starts another one.
 * The server stays "not ready" for ever, no test begins, and the job dies at
 * its cap having printed nothing. That was mine, not astro's.
 *
 * So liveness is probed on a static file, which is served in ~3 ms without
 * compiling anything, and the first page render is then awaited once,
 * patiently, before any spec runs.
 */
import { spawn, spawnSync } from 'node:child_process';

export const PORT = 4321;
export const BASE_URL = `http://localhost:${PORT}/`;
/** Served straight from public/ — no page compile, so it is a true liveness probe. */
export const LIVENESS_URL = `http://localhost:${PORT}/_headers`;
/** Set when globalSetup started the server, so teardown knows to stop it. */
export const STARTED_FLAG = '/tmp/.watchboard-e2e-started-dev';

export async function isListening(timeoutMs = 2000): Promise<boolean> {
  try {
    const res = await fetch(LIVENESS_URL, { signal: AbortSignal.timeout(timeoutMs) });
    return res.status > 0;
  } catch {
    return false;
  }
}

export async function waitUntilListening(timeoutMs = 120_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isListening()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`dev server never listened on ${LIVENESS_URL} within ${timeoutMs / 1000}s`);
}

/**
 * One patient request for the homepage, so the first spec does not pay the
 * cold compile inside its own timeout. Deliberately generous, and the elapsed
 * time is logged because it is the number that explains a slow suite.
 */
export async function warmUp(timeoutMs = 180_000): Promise<void> {
  const started = Date.now();
  const res = await fetch(BASE_URL, { signal: AbortSignal.timeout(timeoutMs) });
  console.log(`[e2e] first render: HTTP ${res.status} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

/**
 * Start the server without blocking on it, whichever way astro behaves.
 *
 * Astro 7 daemonises `astro dev` on some machines and stays in the foreground
 * on others — it daemonised on mine and ran in the foreground on the CI
 * runner. Neither is safe to wait on:
 *
 *   - foreground: the call never returns, because the server is the process;
 *   - daemonised with `stdio: 'inherit'`: the call STILL never returns,
 *     because the daemon inherits the parent's stdio and spawnSync waits for
 *     those streams to close, not for the supervisor to exit. That is what
 *     cancelled the third CI run at its 25-minute cap with `ready in 313 ms`
 *     as the last line and no output of ours after it.
 *
 * So: detached, stdio piped into our own log rather than inherited, unref'd,
 * and readiness decided by polling the port. Correct under both behaviours.
 */
export function startDaemon(): number | undefined {
  const child = spawn('npm', ['run', 'dev'], {
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PUBLIC_ENABLE_DEEPSTATE: 'true' },
  });
  child.stdout?.on('data', (c) => process.stdout.write(`[dev] ${c}`));
  child.stderr?.on('data', (c) => process.stderr.write(`[dev] ${c}`));
  child.on('error', (err) => console.error(`[e2e] dev server failed to spawn: ${err.message}`));
  child.unref();
  return child.pid;
}

/**
 * Stop whichever shape of server we started.
 *
 * `astro dev stop` only knows about a daemonised one. When astro stayed in the
 * foreground, the server is our own detached child, so its process group is
 * killed too. Both are attempted and neither is fatal: a teardown that throws
 * would fail a suite that already passed.
 */
export function stopDaemon(pid?: number): void {
  spawnSync('npx', ['astro', 'dev', 'stop'], { stdio: 'pipe' });
  if (pid === undefined) return;
  try {
    process.kill(-pid, 'SIGTERM'); // negative: the detached group, not just npm
  } catch {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // already gone
    }
  }
}
