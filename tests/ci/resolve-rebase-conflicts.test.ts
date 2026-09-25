import { describe, it, expect } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';

const SCRIPT = resolve('scripts/ci/resolve-rebase-conflicts.sh');
const git = (cwd: string, ...a: string[]) => execFileSync('git', a, { cwd, encoding: 'utf8' });
const put = (dir: string, f: string, s: string) => { mkdirSync(dirname(join(dir, f)), { recursive: true }); writeFileSync(join(dir, f), s); };
const J = (v: unknown) => JSON.stringify(v, null, 2) + '\n';
const read = (dir: string, f: string) => JSON.parse(readFileSync(join(dir, f), 'utf8'));
const idx = (file: string, ts: string) => ({ file, timestamp: ts, status: 'success', trackerCount: 1, errorCount: 0, pipeline: 'hourly' });
const RECENT = new Date(Date.now() - 3600_000).toISOString();
const RECENT2 = new Date(Date.now() - 1800_000).toISOString();

/** base → main commits `mainFiles`, job commits `jobFiles`, then the job runs `git pull --rebase` and stops on conflicts. */
function conflicted(mainFiles: Record<string, string>, jobFiles: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), 'rrc-'));
  const origin = join(root, 'o.git'); git(root, 'init', '-q', '--bare', '-b', 'main', origin);
  const a = join(root, 'a'); git(root, 'clone', '-q', origin, a);
  git(a, 'config', 'user.email', 'a@b'); git(a, 'config', 'user.name', 't');
  for (const f of new Set([...Object.keys(mainFiles), ...Object.keys(jobFiles)])) put(a, f, 'base\n');
  git(a, 'add', '.'); git(a, 'commit', '-qm', 'base'); git(a, 'push', '-q', 'origin', 'main');
  const job = join(root, 'job'); git(root, 'clone', '-q', origin, job);
  git(job, 'config', 'user.email', 'a@b'); git(job, 'config', 'user.name', 't');
  for (const [f, s] of Object.entries(mainFiles)) put(a, f, s);
  git(a, 'commit', '-qam', 'main'); git(a, 'push', '-q', 'origin', 'main');
  for (const [f, s] of Object.entries(jobFiles)) put(job, f, s);
  git(job, 'commit', '-qam', 'job');
  expect(spawnSync('git', ['pull', '--rebase', 'origin', 'main'], { cwd: job }).status).not.toBe(0);
  return job;
}

describe('resolve-rebase-conflicts.sh', () => {
  it('keeps BOTH sides of the metrics index, the events partition and the digests', () => {
    const EV = 'trackers/gaza-war/data/events/2026-09-24.json';
    const DG = 'trackers/gaza-war/data/digests.json';
    const job = conflicted(
      {
        'public/_metrics/index.json': J([idx('main-run.json', RECENT)]),
        [EV]: J([{ id: 'shared', title: 'old' }, { id: 'from-main' }]),
        [DG]: J([{ date: '2026-09-24', title: 'Nightly digest' }]),
        'public/_hourly/state.json': 'MAIN\n',
      },
      {
        'public/_metrics/index.json': J([idx('job-run.json', RECENT2)]),
        [EV]: J([{ id: 'shared', title: 'job re-verified' }, { id: 'from-job' }]),
        [DG]: J([{ date: '2026-09-24', title: 'Hourly digest' }]),
        'public/_hourly/state.json': 'JOB\n',
      },
    );
    const r = spawnSync('bash', [SCRIPT, 'gaza-war'], { cwd: job, encoding: 'utf8' });
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(read(job, 'public/_metrics/index.json').map((e: { file: string }) => e.file)).toEqual(['main-run.json', 'job-run.json']);
    expect(read(job, EV)).toEqual([{ id: 'shared', title: 'job re-verified' }, { id: 'from-main' }, { id: 'from-job' }]);
    expect(read(job, DG).map((d: { title: string }) => d.title).sort()).toEqual(['Hourly digest', 'Nightly digest']);
    expect(readFileSync(join(job, 'public/_hourly/state.json'), 'utf8')).toBe('MAIN\n');
    expect(git(job, 'status', '--porcelain')).toBe('');
    expect(git(job, 'log', '-1', '--format=%s').trim()).toBe('job');
  });

  it("takes the job's whole non-array tracker file, but says so", () => {
    const job = conflicted({ 'trackers/gaza-war/data/kpis.json': 'MAIN\n' }, { 'trackers/gaza-war/data/kpis.json': 'JOB\n' });
    const r = spawnSync('bash', [SCRIPT, 'gaza-war'], { cwd: job, encoding: 'utf8' });
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(readFileSync(join(job, 'trackers/gaza-war/data/kpis.json'), 'utf8')).toBe('JOB\n');
    expect(r.stdout).toContain("::warning::resolve-rebase-conflicts: took the job's whole trackers/gaza-war/data/kpis.json");
  });

  it('aborts on a conflict outside the policy and leaves the job commit intact', () => {
    const job = conflicted({ 'trackers/sudan-conflict/data/kpis.json': 'MAIN\n' }, { 'trackers/sudan-conflict/data/kpis.json': 'JOB\n' });
    const r = spawnSync('bash', [SCRIPT, 'gaza-war'], { cwd: job, encoding: 'utf8' });
    expect(r.status).toBe(1);
    expect(r.stdout + r.stderr).toContain('trackers/sudan-conflict/data/kpis.json');
    expect(readFileSync(join(job, 'trackers/sudan-conflict/data/kpis.json'), 'utf8')).toBe('JOB\n');
    expect(git(job, 'log', '-1', '--format=%s').trim()).toBe('job');
  });
});
