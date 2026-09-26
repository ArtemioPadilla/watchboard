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
