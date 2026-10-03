// The nightly finalize pushes (update-data.yml "Commit and push data" and
// "Commit and push metrics") race the hourly scan, which commits to the same
// trackers' events, digests, meta and update-log. On 2026-09-26 (run
// 36217453805) a plain `git pull --rebase` + `rebase --abort` loop lost the
// whole night to such a conflict. These tests race a nightly commit against
// hourly commits on a bare origin and check that nothing is dropped.
import { describe, it, expect } from 'vitest';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { createServer } from 'node:http';

const PUSH_STATE = resolve('scripts/ci/push-state.sh');
const HOURLY_PUSH = resolve('scripts/ci/hourly-push.sh');
const git = (cwd: string, ...a: string[]) => execFileSync('git', a, { cwd, encoding: 'utf8' });
const put = (dir: string, f: string, s: string) => { mkdirSync(dirname(join(dir, f)), { recursive: true }); writeFileSync(join(dir, f), s); };
const J = (v: unknown) => JSON.stringify(v, null, 2) + '\n';
const T = 'trackers/gaza-war/data';
const EV25 = `${T}/events/2026-09-25.json`;
const EV26 = `${T}/events/2026-09-26.json`;
const DG = `${T}/digests.json`;
const INDEX = 'public/_metrics/index.json';
const QUEUE = 'public/_social/queue-2026-09-26.json';
const recent = (minAgo: number) => new Date(Date.now() - minAgo * 60_000).toISOString();
const idx = (file: string, ts: string) => ({ file, timestamp: ts, status: 'success', trackerCount: 1, errorCount: 0 });

function spawnScript(script: string, cwd: string, args: string[], env: Record<string, string> = {}, delayMs = 0): Promise<{ code: number; out: string }> {
  return new Promise(res => setTimeout(() => {
    const p = spawn('bash', [script, ...args], {
      cwd,
      env: { ...process.env, PUSH_STATE_NO_SLEEP: '1', HOURLY_PUSH_FAST: '1', GITHUB_REF: '', TELEGRAM_BOT_TOKEN: '', ...env },
    });
    let out = '';
    p.stdout.on('data', d => (out += d)); p.stderr.on('data', d => (out += d));
    p.on('close', code => res({ code: code ?? -1, out }));
  }, delayMs));
}

function repo() {
  const root = mkdtempSync(join(tmpdir(), 'nightly-push-'));
  const origin = join(root, 'o.git');
  git(root, 'init', '-q', '--bare', '-b', 'main', origin);
  const clone = (name: string) => {
    const dir = join(root, name);
    git(root, 'clone', '-q', origin, dir);
    git(dir, 'config', 'user.email', 'a@b'); git(dir, 'config', 'user.name', name);
    return dir;
  };
  const seed = clone('seed');
  put(seed, EV25, J([{ id: 'base', title: 'base' }]));
  put(seed, DG, J([{ date: '2026-09-24', title: 'Seed digest' }]));
  put(seed, `${T}/meta.json`, J({ lastUpdated: '2026-09-24' }));
  put(seed, `${T}/update-log.json`, J({ lastRun: '2026-09-24' }));
  put(seed, INDEX, J([idx('seed.json', recent(600))]));
  put(seed, QUEUE, J([{ id: 'q1', status: 'approved' }]));
  put(seed, 'src/app.ts', 'base\n');
  git(seed, 'add', '.'); git(seed, 'commit', '-qm', 'base'); git(seed, 'push', '-q', 'origin', 'main');
  return { root, origin, clone };
}

const readJson = (dir: string, f: string) => JSON.parse(readFileSync(join(dir, f), 'utf8'));
const ids = (dir: string, f: string) => readJson(dir, f).map((e: { id: string }) => e.id).sort();

/** Every tracked file in the tree on origin/main, checked for leftover conflict markers. */
function assertNoMarkers(dir: string) {
  for (const f of git(dir, 'ls-files').split('\n').filter(Boolean)) {
    expect(readFileSync(join(dir, f), 'utf8'), f).not.toMatch(/^(<<<<<<<|>>>>>>>) /m);
  }
}

describe('nightly push (push-state.sh --resolve --all-trackers)', () => {
  it('lands a nightly commit racing hourly commits on the same tracker, keeping both sides', async () => {
    const r = repo();
    const nightly = r.clone('nightly');
    const hourlyA = r.clone('hourlyA');
    const hourlyB = r.clone('hourlyB');

    // The nightly finalize commit: re-verified `base`, new events, a digest,
    // and the non-array files the updater always rewrites.
    put(nightly, EV25, J([{ id: 'base', title: 'nightly re-verified' }, { id: 'nightly-25' }]));
    put(nightly, EV26, J([{ id: 'nightly-26' }]));
    put(nightly, DG, J([{ date: '2026-09-26', title: 'Nightly digest' }, { date: '2026-09-24', title: 'Seed digest' }]));
    put(nightly, `${T}/meta.json`, J({ lastUpdated: '2026-09-26', by: 'nightly' }));
    put(nightly, `${T}/update-log.json`, J({ lastRun: '2026-09-26T14:00Z', by: 'nightly' }));
    git(nightly, 'add', '.'); git(nightly, 'commit', '-qm', 'chore(data): nightly AI update');

    // Hourly A already landed while the nightly was building.
    for (const [dir, tag] of [[hourlyA, 'A'], [hourlyB, 'B']] as const) {
      put(dir, EV25, J([{ id: 'base', title: 'base' }, { id: `hourly-${tag}-25` }]));
      put(dir, EV26, J([{ id: `hourly-${tag}-26` }]));
      put(dir, DG, J([{ date: '2026-09-26', title: `Hourly digest ${tag}` }, { date: '2026-09-24', title: 'Seed digest' }]));
      put(dir, `${T}/meta.json`, J({ lastUpdated: '2026-09-26', by: `hourly-${tag}` }));
      put(dir, `${T}/update-log.json`, J({ lastRun: '2026-09-26T13:00Z', by: `hourly-${tag}` }));
      put(dir, INDEX, J([idx('seed.json', recent(600)), idx(`hourly-${tag}.json`, recent(tag === 'A' ? 60 : 30))]));
      git(dir, 'add', '.'); git(dir, 'commit', '-qm', `chore(hourly): update gaza-war ${tag}`);
    }
    const a = await spawnScript(HOURLY_PUSH, hourlyA, ['gaza-war', '10']);
    expect(a.code, a.out).toBe(0);

    // Hourly B and the nightly now race each other.
    const [b, n] = await Promise.all([
      spawnScript(HOURLY_PUSH, hourlyB, ['gaza-war', '10'], {}, Math.floor(Math.random() * 100)),
      spawnScript(PUSH_STATE, nightly, ['nightly-data', '5', '--resolve', '--all-trackers'], {}, Math.floor(Math.random() * 100)),
    ]);
    expect(b.code, b.out).toBe(0);
    expect(n.code, n.out).toBe(0);
    expect(n.out).toContain('push-state: nightly-data pushed on attempt');

    const v = r.clone('verify');
    expect(ids(v, EV25)).toEqual(['base', 'hourly-A-25', 'hourly-B-25', 'nightly-25']);
    expect(ids(v, EV26)).toEqual(['hourly-A-26', 'hourly-B-26', 'nightly-26']);
    expect(readJson(v, DG).map((d: { title: string }) => d.title).sort())
      .toEqual(['Hourly digest A', 'Hourly digest B', 'Nightly digest', 'Seed digest']);
    expect(readJson(v, INDEX).map((e: { file: string }) => e.file).sort()).toEqual(['hourly-A.json', 'hourly-B.json', 'seed.json']);
    const log = git(v, 'log', '--format=%s', 'main');
    for (const s of ['chore(data): nightly AI update', 'chore(hourly): update gaza-war A', 'chore(hourly): update gaza-war B']) expect(log).toContain(s);
    assertNoMarkers(v);
    // Whatever the order, a whole-file take on a non-array file is announced.
    expect(n.out + b.out).toMatch(/::warning::resolve-rebase-conflicts: took the job's whole trackers\/gaza-war\/data\/(meta|update-log)\.json/);
  }, 60_000);

  it('rebases an unpushed data commit plus the metrics commit (two conflict stops) and never reverts a posted queue entry', async () => {
    const r = repo();
    const nightly = r.clone('nightly');
    const bot = r.clone('bot');

    // Two local commits (data, then metrics) that both conflict: the resolver
    // must handle every rebase stop. (The workflow itself drops a data commit
    // whose push failed before the metrics push; this is the script's contract.)
    put(nightly, EV25, J([{ id: 'base', title: 'base' }, { id: 'nightly-25' }]));
    git(nightly, 'commit', '-qam', 'chore(data): nightly AI update');
    put(nightly, INDEX, J([idx('seed.json', recent(600)), idx('nightly.json', recent(5))]));
    put(nightly, QUEUE, J([{ id: 'q1', status: 'approved' }, { id: 'q2', status: 'pending_review' }]));
    git(nightly, 'commit', '-qam', 'chore(metrics): ingestion run');

    // Meanwhile: an hourly scan on the same events and the social poster
    // marking q1 posted.
    put(bot, EV25, J([{ id: 'base', title: 'base' }, { id: 'hourly-25' }]));
    put(bot, INDEX, J([idx('seed.json', recent(600)), idx('hourly.json', recent(10))]));
    git(bot, 'commit', '-qam', 'chore(hourly): update gaza-war');
    put(bot, QUEUE, J([{ id: 'q1', status: 'posted', tweetId: '123' }]));
    git(bot, 'commit', '-qam', 'chore(social): post queue');
    git(bot, 'push', '-q', 'origin', 'main');

    const n = await spawnScript(PUSH_STATE, nightly, ['nightly-metrics', '5', '--resolve', '--all-trackers']);
    expect(n.code, n.out).toBe(0);

    const v = r.clone('verify');
    expect(ids(v, EV25)).toEqual(['base', 'hourly-25', 'nightly-25']);
    expect(readJson(v, INDEX).map((e: { file: string }) => e.file).sort()).toEqual(['hourly.json', 'nightly.json', 'seed.json']);
    // A posted entry flipping back to "approved" would be posted again, publicly.
    expect(readJson(v, QUEUE)).toEqual([{ id: 'q1', status: 'posted', tweetId: '123' }, { id: 'q2', status: 'pending_review' }]);
    const log = git(v, 'log', '--format=%s', 'main');
    expect(log).toContain('chore(data): nightly AI update');
    expect(log).toContain('chore(metrics): ingestion run');
    assertNoMarkers(v);
    expect(existsSync(join(nightly, '.git', 'rebase-merge'))).toBe(false);
  }, 60_000);

  it('a conflict outside the policy fails at once, loudly, alerts the private chat only and keeps the commit', async () => {
    const hits: string[] = [];
    const server = createServer((req, res) => { let body = ''; req.on('data', d => (body += d)); req.on('end', () => { hits.push(`${req.url} ${body}`); res.end('{"ok":true}'); }); });
    await new Promise<void>(ok => server.listen(0, '127.0.0.1', () => ok()));
    const port = (server.address() as { port: number }).port;

    const r = repo();
    const nightly = r.clone('nightly');
    const bot = r.clone('bot');
    put(bot, 'src/app.ts', 'main\n'); git(bot, 'commit', '-qam', 'main edit'); git(bot, 'push', '-q', 'origin', 'main');
    put(nightly, 'src/app.ts', 'nightly\n'); put(nightly, EV25, J([{ id: 'nightly-25' }]));
    git(nightly, 'commit', '-qam', 'chore(data): nightly AI update');

    const n = await spawnScript(PUSH_STATE, nightly, ['nightly-data', '5', '--resolve', '--all-trackers'], {
      TELEGRAM_BOT_TOKEN: 'T', TELEGRAM_ALERT_CHAT_ID: '-100private', TELEGRAM_CHANNEL_ID: '-100public',
      TELEGRAM_API_BASE: `http://127.0.0.1:${port}`,
    });
    server.close();
    expect(n.code).toBe(1);
    expect(n.out).toContain('no policy for conflicted path src/app.ts');
    expect(n.out).toContain('after 1 attempt');
    expect(hits).toHaveLength(1);
    expect(decodeURIComponent(hits[0])).toContain('chat_id=-100private');
    expect(decodeURIComponent(hits[0])).not.toContain('-100public');
    expect(git(nightly, 'log', '-1', '--format=%s').trim()).toBe('chore(data): nightly AI update');
    expect(existsSync(join(nightly, '.git', 'rebase-merge'))).toBe(false);
    expect(git(r.origin, 'log', '--format=%s', 'main')).not.toContain('nightly AI update');
  }, 30_000);

  it('without --resolve a content conflict still fails fast (old push-state behaviour)', async () => {
    const r = repo();
    const nightly = r.clone('nightly');
    const bot = r.clone('bot');
    put(bot, EV25, J([{ id: 'hourly' }])); git(bot, 'commit', '-qam', 'h'); git(bot, 'push', '-q', 'origin', 'main');
    put(nightly, EV25, J([{ id: 'nightly' }])); git(nightly, 'commit', '-qam', 'n');
    const n = await spawnScript(PUSH_STATE, nightly, ['x', '3']);
    expect(n.code).toBe(1);
    expect(n.out).toContain('not retrying');
  }, 30_000);
});
