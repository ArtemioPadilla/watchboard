/**
 * Astro 7 runs `astro dev` as a daemon: the foreground process prints
 * "Dev server running at … (pid N)" and exits, leaving the server behind.
 * Playwright's `webServer` watches its command and treats that exit as the
 * server dying — "Process from config.webServer exited early" — so the whole
 * suite never starts. That, and not performance, is what a 50-minute e2e run
 * against astro 7 actually was (#300).
 *
 * So the server is started in globalSetup and stopped in globalTeardown, which
 * is the daemon's own contract. A server already listening is reused and left
 * running, matching the `reuseExistingServer: true` this replaced.
 */
import { spawnSync } from 'node:child_process';

export const PORT = 4321;
export const BASE_URL = `http://localhost:${PORT}/`;
/** Set when globalSetup started the server, so teardown knows to stop it. */
export const STARTED_FLAG = '/tmp/.watchboard-e2e-started-dev';

export async function answers(): Promise<boolean> {
  try {
    const res = await fetch(BASE_URL, { signal: AbortSignal.timeout(2000) });
    // Any HTTP answer means something is listening; a 500 is a broken app, not
    // a missing server, and the tests should report that themselves.
    return res.status > 0;
  } catch {
    return false;
  }
}

export async function waitUntilAnswering(timeoutMs = 120_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await answers()) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`dev server did not answer on ${BASE_URL} within ${timeoutMs / 1000}s`);
}

export function startDaemon(): void {
  // Returns promptly: astro 7 daemonises and this is the supervisor call.
  const r = spawnSync('npm', ['run', 'dev'], {
    stdio: 'inherit',
    env: { ...process.env, PUBLIC_ENABLE_DEEPSTATE: 'true' },
  });
  if (r.status !== 0) throw new Error(`\`npm run dev\` exited ${r.status}`);
}

export function stopDaemon(): void {
  spawnSync('npx', ['astro', 'dev', 'stop'], { stdio: 'inherit' });
}
