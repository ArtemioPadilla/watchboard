import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const wf = (name: string) => readFileSync(`.github/workflows/${name}`, 'utf8');

describe('daily-video state pushes', () => {
  it('push through push-state.sh (autostash), never a bare pull --rebase loop', () => {
    const src = wf('daily-video.yml');
    expect(src).not.toMatch(/git pull --rebase origin main && git push/);
    expect((src.match(/bash scripts\/ci\/push-state\.sh/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});

describe('hourly-scan push', () => {
  it('pushes through hourly-push.sh, never an inline pull --rebase loop', () => {
    const src = wf('hourly-scan.yml');
    const step = src.split(/\n\s+- name: /).find(s => s.startsWith('Commit and push\n'));
    expect(step, 'act job "Commit and push" step').toBeDefined();
    expect(step).toMatch(/bash scripts\/ci\/hourly-push\.sh "\$TRACKER"/);
    expect(step).not.toMatch(/git pull --rebase/);
  });
});

// Task 4 (light-scan half). telegram-notify.yml is held on owner question Q6;
// post-social-queue.yml and daily-video.yml join these lists with their own
// changes.
describe('workflows that publish to public channels', () => {
  for (const name of ['light-scan.yml']) {
    it(`${name} checks out the live branch tip, not the run's original SHA (a re-run reuses GITHUB_SHA)`, () => {
      const checkouts = wf(name).match(/uses: actions\/checkout@v\d+(\n\s+with:\n(\s+\w+: [^\n]+\n)+)?/g) ?? [];
      expect(checkouts.length).toBeGreaterThan(0);
      for (const c of checkouts) expect(c).toMatch(/ref: main/);
    });
    it(`${name} never cancels a run in progress (it may already have published)`, () => {
      expect(wf(name)).toMatch(/concurrency:\s*\n\s*group: [^\n]+\n\s*cancel-in-progress: false/);
    });
    it(`${name} pushes its state through scripts/ci/push-state.sh`, () => {
      expect(wf(name)).toContain('bash scripts/ci/push-state.sh');
      expect(wf(name)).toContain('TELEGRAM_ALERT_CHAT_ID: ${{ secrets.TELEGRAM_ALERT_CHAT_ID }}');
      expect(wf(name)).not.toMatch(/git pull --rebase origin main && git push/);
    });
  }

  it('light-scan.yml commits state even when the scan step fails, and guards alerts.json only after a successful scan', () => {
    const steps = wf('light-scan.yml').split(/\n\s+- name: /);
    const scan = steps.find(s => s.startsWith('Run light scan\n'));
    const commit = steps.find(s => s.startsWith('Commit pending-candidates'));
    expect(scan, '"Run light scan" step').toBeDefined();
    expect(commit, 'commit step').toBeDefined();
    expect(scan).toMatch(/\n\s+id: scan\n/);
    expect(scan).toMatch(/\n\s+timeout-minutes: 4\n/);
    expect(commit).toMatch(/\n\s+if: always\(\)\n/);
    expect(commit).toMatch(/if \[ "\$\{\{ steps\.scan\.outcome \}\}" = "success" \]; then[^]*alerts\.json was not staged[^]*\n\s+fi\n/);
  });

  it('hourly-scan.yml does not use the rejected --no-edit flag', () => {
    expect(wf('hourly-scan.yml')).not.toContain('rebase --continue --no-edit');
  });
});
