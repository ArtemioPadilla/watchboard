import { describe, it, expect } from 'vitest';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';

const SCRIPT = resolve('scripts/ci/hourly-push.sh');
const git = (cwd: string, ...a: string[]) => execFileSync('git', a, { cwd, encoding: 'utf8' });
const put = (dir: string, f: string, s: string) => { mkdirSync(dirname(join(dir, f)), { recursive: true }); writeFileSync(join(dir, f), s); };
const J = (v: unknown) => JSON.stringify(v, null, 2) + '\n';
const INDEX = 'public/_metrics/index.json';
const JOBS = 6;

function run(cwd: string, args: string[], delayMs: number): Promise<{ code: number; out: string }> {
  return new Promise(res => setTimeout(() => {
    const p = spawn('bash', [SCRIPT, ...args], { cwd, env: { ...process.env, HOURLY_PUSH_FAST: '1' } });
    let out = '';
    p.stdout.on('data', d => (out += d)); p.stderr.on('data', d => (out += d));
    p.on('close', code => res({ code: code ?? -1, out }));
  }, delayMs));
}

describe('hourly-push.sh under contention', () => {
  it('pushes a resolved conflict in the same attempt (attempts=1)', async () => {
    const root = mkdtempSync(join(tmpdir(), 'hourly-push-1-'));
    const origin = join(root, 'o.git');
    git(root, 'init', '-q', '--bare', '-b', 'main', origin);
    const [main, job] = ['main', 'job'].map(d => {
      const dir = join(root, d);
      git(root, 'clone', '-q', origin, dir);
      git(dir, 'config', 'user.email', 'a@b'); git(dir, 'config', 'user.name', 't');
      return dir;
    });
    put(main, INDEX, J([])); git(main, 'add', '.'); git(main, 'commit', '-qm', 'base'); git(main, 'push', '-q', 'origin', 'main');
    git(job, 'pull', '-q', 'origin', 'main');
    const entry = (file: string) => ({ file, timestamp: new Date().toISOString(), status: 'success', trackerCount: 1, errorCount: 0, pipeline: 'hourly' });
    put(main, INDEX, J([entry('other.json')])); git(main, 'commit', '-qam', 'other'); git(main, 'push', '-q', 'origin', 'main');
    put(job, INDEX, J([entry('mine.json')])); git(job, 'commit', '-qam', 'mine');
    const r = await run(job, ['gaza-war', '1'], 0);
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain('after resolving conflicts');
    const files = JSON.parse(git(origin, 'show', `main:${INDEX}`)).map((e: { file: string }) => e.file);
    expect(files.sort()).toEqual(['mine.json', 'other.json']);
  });

  it(`lands every one of ${JOBS} concurrent jobs' metrics-index entry and events file`, async () => {
    const root = mkdtempSync(join(tmpdir(), 'hourly-push-'));
    const origin = join(root, 'o.git');
    git(root, 'init', '-q', '--bare', '-b', 'main', origin);
    const seed = join(root, 'seed');
    git(root, 'clone', '-q', origin, seed);
    git(seed, 'config', 'user.email', 'a@b'); git(seed, 'config', 'user.name', 't');
    put(seed, INDEX, J([]));
    git(seed, 'add', '.'); git(seed, 'commit', '-qm', 'base'); git(seed, 'push', '-q', 'origin', 'main');

    // Every matrix job checks out the same main, appends its own entry to the
    // shared metrics index, and writes its own tracker's events partition.
    const slugs = Array.from({ length: JOBS }, (_, n) => `tracker-${n}`);
    const now = Date.now();
    const jobs = slugs.map((slug, n) => {
      const dir = join(root, slug);
      git(root, 'clone', '-q', origin, dir);
      git(dir, 'config', 'user.email', 'a@b'); git(dir, 'config', 'user.name', 't');
      const index = JSON.parse(readFileSync(join(dir, INDEX), 'utf8'));
      const ts = new Date(now - (JOBS - n) * 1000).toISOString();
      index.push({ file: `${slug}.json`, timestamp: ts, status: 'success', trackerCount: 1, errorCount: 0, pipeline: 'hourly' });
      put(dir, INDEX, J(index));
      put(dir, `public/_metrics/runs/${slug}.json`, J({ slug }));
      put(dir, `trackers/${slug}/data/events/2026-09-24.json`, J([{ id: `${slug}-ev` }]));
      git(dir, 'add', '.'); git(dir, 'commit', '-qm', `chore(hourly): update ${slug}`);
      return { slug, dir };
    });

    const results = await Promise.all(jobs.map(j => run(j.dir, [j.slug, '10'], Math.floor(Math.random() * 150))));
    for (const r of results) expect(r.code, r.out).toBe(0);

    const verify = join(root, 'verify');
    git(root, 'clone', '-q', origin, verify);
    const files = JSON.parse(readFileSync(join(verify, INDEX), 'utf8')).map((e: { file: string }) => e.file).sort();
    expect(files).toEqual(slugs.map(s => `${s}.json`).sort());
    for (const slug of slugs) {
      expect(JSON.parse(readFileSync(join(verify, `trackers/${slug}/data/events/2026-09-24.json`), 'utf8'))).toEqual([{ id: `${slug}-ev` }]);
      expect(git(verify, 'log', '--format=%s', 'main')).toContain(`chore(hourly): update ${slug}`);
    }
  }, 90_000);
});
