/**
 * End-to-end over the real script against a fake Telegram, because the part
 * worth testing is not the message — it is what happens to the record when the
 * send fails. "Marked as announced, never actually sent" is the exact shape of
 * this repo's recurring defect.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync, cpSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

interface Received { path: string; body: Record<string, unknown> }

let server: Server;
let port = 0;
let received: Received[] = [];
let status = 200;

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      received.push({ path: req.url ?? '', body: raw ? JSON.parse(raw) : {} });
      res.statusCode = status;
      res.end(status === 200 ? '{"ok":true}' : '{"ok":false,"description":"bad request"}');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => {
    port = (server.address() as { port: number }).port;
    resolve();
  }));
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const ROOT = process.cwd();

/** A scratch copy of public/_social holding one queue file. */
function sandbox(queue: unknown[]): { dir: string; queuePath: string; statePath: string } {
  const dir = mkdtempSync(join(tmpdir(), 'notify-'));
  mkdirSync(join(dir, 'public', '_social'), { recursive: true });
  cpSync(join(ROOT, 'social-config.json'), join(dir, 'social-config.json'));
  const queuePath = join(dir, 'public', '_social', 'queue-2026-10-17.json');
  writeFileSync(queuePath, JSON.stringify(queue, null, 2));
  return { dir, queuePath, statePath: join(dir, 'public', '_social', 'notified-proposals.json') };
}

/**
 * Async on purpose. The fake Telegram runs in this same process, so a
 * `spawnSync` would block the event loop that has to answer the child's
 * request: the child waits for a reply that cannot be sent and the test hangs
 * until the runner's timeout. Two 10-minute timeouts before I saw it.
 *
 * The script is invoked through the repo's own tsx by absolute path rather
 * than `npx`, because it has to run with the sandbox as its cwd (social-types
 * resolves ROOT from process.cwd()) and `npx` in a directory with no
 * node_modules goes to the registry.
 */
function run(dir: string, queuePath: string, env: Record<string, string> = {}): Promise<{ status: number | null; output: string }> {
  const child = spawn(
    join(ROOT, 'node_modules/.bin/tsx'),
    [join(ROOT, 'scripts/notify-social-proposals.ts'), '--queue', queuePath, '--api-base', `http://127.0.0.1:${port}`],
    {
      cwd: dir,
      env: {
        ...process.env,
        TELEGRAM_BOT_TOKEN: 'test-token',
        TELEGRAM_ALERT_CHAT_ID: '-100ops',
        TELEGRAM_CHANNEL_ID: '-100public',
        ...env,
      },
    },
  );
  let output = '';
  child.stdout.on('data', (c) => { output += c; });
  child.stderr.on('data', (c) => { output += c; });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`notify script did not exit within 30s\n${output}`));
    }, 30_000);
    child.on('error', (err) => { clearTimeout(timer); reject(err); });
    child.on('close', (status) => { clearTimeout(timer); resolve({ status, output }); });
  });
}

const PROPOSAL = {
  id: 'p1', type: 'contested', voice: 'analyst', tracker: 'yemen-conflict', lang: 'en',
  text: 'Three counts, three sources.', hashtags: ['#Watchboard'], link: 'x', image: null,
  memegenUrl: null, publishAt: '2026-10-17T22:00:00Z', status: 'pending_review',
  estimatedCost: 0.01, judge: { score: 0.8, verdict: 'REVIEW', comment: 'needs a human', factChecks: [] },
  threadTweets: null, tweetId: null, postedAt: null,
};

// 40 s so the helper's own 30 s guard fires first and reports the output of
// the stuck child, rather than vitest's default 5 s hiding it.
describe('notify-social-proposals end to end', () => {
  it('sends to the ops chat and records what it announced', async () => {
    received = []; status = 200;
    const { dir, queuePath, statePath } = sandbox([PROPOSAL]);
    try {
      const r = await run(dir, queuePath);
      expect(r.status).toBe(0);
      expect(received).toHaveLength(1);
      expect(received[0].path).toBe('/bottest-token/sendMessage');
      expect(received[0].body.chat_id).toBe('-100ops');
      expect(String(received[0].body.text)).toContain('yemen-conflict');
      expect(JSON.parse(readFileSync(statePath, 'utf8')).notified.p1).toMatch(/^2\d{3}-/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('does NOT record anything when Telegram rejects the send', async () => {
    received = []; status = 400;
    const { dir, queuePath, statePath } = sandbox([PROPOSAL]);
    try {
      const r = await run(dir, queuePath);
      expect(r.status).toBe(1);
      expect(received).toHaveLength(1);
      // The whole point: an unsent announcement must stay unannounced, so the
      // next run retries instead of the proposal being silently forgotten.
      expect(existsSync(statePath)).toBe(false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('refuses to send when the ops chat is the public channel, and sends nothing', async () => {
    received = []; status = 200;
    const { dir, queuePath, statePath } = sandbox([PROPOSAL]);
    try {
      const r = await run(dir, queuePath, { TELEGRAM_ALERT_CHAT_ID: '-100public' });
      expect(r.status).toBe(1);
      expect(received).toHaveLength(0);
      expect(existsSync(statePath)).toBe(false);
      expect(r.output).toContain('public channel');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('says nothing twice', async () => {
    received = []; status = 200;
    const { dir, queuePath } = sandbox([PROPOSAL]);
    try {
      expect((await run(dir, queuePath)).status).toBe(0);
      expect((await run(dir, queuePath)).status).toBe(0);
      expect(received).toHaveLength(1);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('sends nothing when nothing is waiting on a person', async () => {
    received = []; status = 200;
    const { dir, queuePath } = sandbox([{ ...PROPOSAL, status: 'auto_approved' }]);
    try {
      expect((await run(dir, queuePath)).status).toBe(0);
      expect(received).toHaveLength(0);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('warns and exits 0 without credentials, recording nothing', async () => {
    received = []; status = 200;
    const { dir, queuePath, statePath } = sandbox([PROPOSAL]);
    try {
      const r = await run(dir, queuePath, { TELEGRAM_BOT_TOKEN: '', TELEGRAM_ALERT_CHAT_ID: '' });
      expect(r.status).toBe(0);
      expect(received).toHaveLength(0);
      expect(existsSync(statePath)).toBe(false);
      expect(r.output).toContain('::warning::');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
}, 40_000);
