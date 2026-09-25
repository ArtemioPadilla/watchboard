import { describe, it, expect, beforeEach } from 'vitest';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:http';

const SCRIPT = resolve('scripts/ci/push-state.sh');
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' });

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'push-state-'));
  const origin = join(root, 'origin.git');
  git(root, 'init', '-q', '--bare', '-b', 'main', origin);
  const seed = join(root, 'seed');
  git(root, 'clone', '-q', origin, seed);
  for (const [k, v] of [['user.email', 'a@b'], ['user.name', 't']]) git(seed, 'config', k, v);
  writeFileSync(join(seed, 'a.txt'), 'base\n'); git(seed, 'add', '.'); git(seed, 'commit', '-qm', 'base'); git(seed, 'push', '-q', 'origin', 'main');
  const job = join(root, 'job');
  git(root, 'clone', '-q', origin, job);
  for (const [k, v] of [['user.email', 'a@b'], ['user.name', 't']]) git(job, 'config', k, v);
  return { root, origin, seed, job };
}

function run(cwd: string, env: Record<string, string>, args: string[]): Promise<{ code: number; out: string }> {
  return new Promise(res => {
    const p = spawn('bash', [SCRIPT, ...args], { cwd, env: { ...process.env, PUSH_STATE_NO_SLEEP: '1', ...env } });
    let out = '';
    p.stdout.on('data', d => (out += d)); p.stderr.on('data', d => (out += d));
    p.on('close', code => res({ code: code ?? -1, out }));
  });
}

describe('push-state.sh', () => {
  let r: ReturnType<typeof setup>;
  beforeEach(() => { r = setup(); });

  it('rebases over a concurrent push and pushes', async () => {
    writeFileSync(join(r.seed, 'b.txt'), 'other bot\n'); git(r.seed, 'add', '.'); git(r.seed, 'commit', '-qm', 'other'); git(r.seed, 'push', '-q', 'origin', 'main');
    writeFileSync(join(r.job, 'state.json'), '{"sent":1}\n'); git(r.job, 'add', '.'); git(r.job, 'commit', '-qm', 'state');
    const { code, out } = await run(r.job, {}, ['telegram-sent', '3']);
    expect(code, out).toBe(0);
    expect(git(r.origin, 'show', 'main:state.json')).toContain('"sent":1');
    expect(git(r.origin, 'show', 'main:b.txt')).toContain('other bot');
  });

  it('fails after N attempts and alerts the private chat only', async () => {
    const hits: string[] = [];
    const server = createServer((req, res) => { let b = ''; req.on('data', d => (b += d)); req.on('end', () => { hits.push(`${req.url} ${b}`); res.end('{"ok":true}'); }); });
    await new Promise<void>(ok => server.listen(0, '127.0.0.1', () => ok()));
    const port = (server.address() as { port: number }).port;
    git(r.job, 'remote', 'set-url', 'origin', join(r.root, 'does-not-exist.git'));
    writeFileSync(join(r.job, 'state.json'), '{}\n'); git(r.job, 'add', '.'); git(r.job, 'commit', '-qm', 'state');
    const { code, out } = await run(r.job, {
      TELEGRAM_BOT_TOKEN: 'T', TELEGRAM_ALERT_CHAT_ID: '-100private', TELEGRAM_CHANNEL_ID: '-100public',
      TELEGRAM_API_BASE: `http://127.0.0.1:${port}`, PUSH_STATE_DETAIL: 'keys: gaza-war::2026-09-24T01:00:00Z',
    }, ['telegram-sent', '2']);
    server.close();
    expect(code).toBe(1);
    expect(out).toContain('::error::push-state: failed to push telegram-sent after 2 attempts');
    expect(hits).toHaveLength(1);
    expect(hits[0]).toContain('/botT/sendMessage');
    expect(decodeURIComponent(hits[0])).toContain('chat_id=-100private');
    expect(decodeURIComponent(hits[0])).toContain('gaza-war::2026-09-24T01:00:00Z');
  });

  it('refuses to alert when the alert chat is the public channel', async () => {
    git(r.job, 'remote', 'set-url', 'origin', join(r.root, 'does-not-exist.git'));
    writeFileSync(join(r.job, 'state.json'), '{}\n'); git(r.job, 'add', '.'); git(r.job, 'commit', '-qm', 'state');
    const { code, out } = await run(r.job, {
      TELEGRAM_BOT_TOKEN: 'T', TELEGRAM_ALERT_CHAT_ID: '-100same', TELEGRAM_CHANNEL_ID: '-100same', TELEGRAM_API_BASE: 'http://127.0.0.1:9',
    }, ['x', '1']);
    expect(code).toBe(1);
    expect(out).toContain('refusing to alert the public channel');
  });

  it('pushes despite an unstaged tracked file (daily-video today) and leaves that file as it was', async () => {
    writeFileSync(join(r.seed, 'b.txt'), 'other bot\n'); git(r.seed, 'add', '.'); git(r.seed, 'commit', '-qm', 'other'); git(r.seed, 'push', '-q', 'origin', 'main');
    writeFileSync(join(r.job, 'state.json'), '{"posted":1}\n'); git(r.job, 'add', 'state.json'); git(r.job, 'commit', '-qm', 'record');
    writeFileSync(join(r.job, 'a.txt'), 'dirty, never staged\n'); // tracked + modified, like the render snapshot
    const { code, out } = await run(r.job, {}, ['video-post', '2']);
    expect(code, out).toBe(0);
    expect(out).toContain('push-state: dirty tree before pull: M a.txt');
    expect(git(r.origin, 'show', 'main:state.json')).toContain('"posted":1');
    expect(readFileSync(join(r.job, 'a.txt'), 'utf8')).toBe('dirty, never staged\n');
  });

  it('stops at once on a content conflict and names the file (retries cannot fix it)', async () => {
    writeFileSync(join(r.seed, 'a.txt'), 'MAIN\n'); git(r.seed, 'commit', '-qam', 'main'); git(r.seed, 'push', '-q', 'origin', 'main');
    writeFileSync(join(r.job, 'a.txt'), 'JOB\n'); git(r.job, 'commit', '-qam', 'job');
    const { code, out } = await run(r.job, {}, ['x', '5']);
    expect(code).toBe(1);
    expect(out).toContain('::error::push-state: content conflict in a.txt');
    expect(out.match(/attempt/g)?.length ?? 0).toBeLessThanOrEqual(1);
    expect(git(r.job, 'log', '-1', '--format=%s').trim()).toBe('job');
  });
});
