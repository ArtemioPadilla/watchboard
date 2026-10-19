import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const wf = (name: string) => readFileSync(`.github/workflows/${name}`, 'utf8');

describe('daily-video state pushes', () => {
  it('push through push-state.sh (autostash), never a bare pull --rebase loop', () => {
    const src = wf('daily-video.yml');
    expect(src).not.toMatch(/git pull --rebase origin main && git push/);
    expect((src.match(/bash scripts\/ci\/push-state\.sh/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});

// Task 6: the daily video's Telegram post is idempotent (recorded in the same
// video-post-<date>.json as Bluesky) and is recorded before the state push.
describe('daily-video Telegram post', () => {
  const jobs = () => {
    const src = wf('daily-video.yml');
    const progressAt = src.indexOf('\n  video-progress:\n');
    expect(progressAt).toBeGreaterThan(0);
    return { video: src.slice(0, progressAt), progress: src.slice(progressAt) };
  };

  it('daily-video.yml never posts to Telegram with a bare curl', () => {
    const src = wf('daily-video.yml');
    expect(src).not.toMatch(/api\.telegram\.org\/bot[^\n]*\/sendVideo/);
    expect((src.match(/npx tsx scripts\/telegram-video-post\.ts /g) ?? []).length).toBe(2);
  });

  for (const job of ['video', 'progress'] as const) {
    it(`${job} job posts to Telegram before committing the post record, with the record path`, () => {
      const steps = jobs()[job].split(/\n\s+- name: /);
      const tgIdx = steps.findIndex(s => s.includes('scripts/telegram-video-post.ts'));
      const commitIdx = steps.findIndex(s => s.startsWith('Commit social post record\n'));
      expect(tgIdx).toBeGreaterThan(0);
      expect(commitIdx).toBeGreaterThan(tgIdx);
      const tg = steps[tgIdx];
      expect(tg).toMatch(/\n\s+id: telegram\n/);
      expect(tg).toMatch(/\n\s+continue-on-error: true\n/);
      const rec = job === 'video' ? 'video-post-\\$\\{DATE\\}\\.json' : 'video-post-progress-\\$\\{DATE\\}\\.json';
      expect(tg).toMatch(new RegExp(`--record "public/_social/${rec}"`));
      // ops-alert.sh needs the private chat id for an unknown outcome.
      expect(tg).toContain('TELEGRAM_ALERT_CHAT_ID: ${{ secrets.TELEGRAM_ALERT_CHAT_ID }}');
      expect(steps[commitIdx]).toContain('DO NOT re-run');
    });

    it(`${job} job fails loudly: push failure says DO NOT RE-RUN, a Telegram rejection says a re-run is safe`, () => {
      const gate = jobs()[job].split(/\n\s+- name: /).find(s => s.startsWith('Fail job if a state commit/push failed\n'));
      expect(gate).toBeDefined();
      expect(gate).toContain('::error::DO NOT RE-RUN — the video is already public.');
      expect(gate).toMatch(/if \[ "\$\{\{ steps\.telegram\.outcome \}\}" = "failure" \]; then/);
      expect(gate).toContain('a re-run is safe');
    });

    it(`${job} job's Telegram step exposes its exit code as steps.telegram.outputs.rc`, () => {
      const tg = jobs()[job].split(/\n\s+- name: /).find(s => s.includes('scripts/telegram-video-post.ts'))!;
      expect(tg).toMatch(/--caption-file [^\n]+ \|\| rc=\$\?\n/);
      expect(tg).toContain('echo "rc=$rc" >> "$GITHUB_OUTPUT"');
      expect(tg).toMatch(/\n\s+exit \$rc(\n|$)/);
    });

    // Runs the gate's shell with the step outcomes substituted in.
    describe(`${job} job gate advice`, () => {
      const commitIds = job === 'video' ? ['commit_social', 'commit_video_state'] : ['commit_progress_social'];
      const runGate = (o: { telegram: string; rc: string; commit: string }) => {
        const gate = jobs()[job].split(/\n\s+- name: /).find(s => s.startsWith('Fail job if a state commit/push failed\n'))!;
        const body = gate.slice(gate.indexOf('run: |\n') + 'run: |\n'.length);
        const script = body.split('\n').map(l => l.replace(/^ {10}/, '')).join('\n')
          .replace(/\$\{\{ steps\.(\w+)\.(outcome|outputs\.rc) \}\}/g, (_m, id: string, what: string) => {
            if (id === 'telegram') return what === 'outcome' ? o.telegram : o.rc;
            if (commitIds.includes(id)) return o.commit;
            return 'success';
          });
        const r = spawnSync('bash', ['-c', script], { encoding: 'utf8' });
        return { code: r.status, out: r.stdout };
      };
      const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

      it('says a re-run is safe only for a rejection with the record on main', () => {
        const r = runGate({ telegram: 'failure', rc: '1', commit: 'success' });
        expect(r.code).toBe(1);
        expect(r.out).toContain('a re-run is safe');
        expect(r.out).not.toContain('DO NOT RE-RUN');
      });
      it('a rejection plus a failed record push: one DO NOT RE-RUN, never "re-run is safe"', () => {
        const r = runGate({ telegram: 'failure', rc: '1', commit: 'failure' });
        expect(r.code).toBe(1);
        expect(r.out).not.toContain('a re-run is safe');
        expect(count(r.out, /DO NOT RE-RUN/g)).toBe(1);
      });
      it('a non-rejection failure (crash after send, exit 2) says DO NOT RE-RUN even with the record pushed', () => {
        for (const rc of ['2', '']) {
          const r = runGate({ telegram: 'failure', rc, commit: 'success' });
          expect(r.code).toBe(1);
          expect(r.out).not.toContain('a re-run is safe');
          expect(count(r.out, /DO NOT RE-RUN/g)).toBe(1);
        }
      });
      it('all green passes silently', () => {
        const r = runGate({ telegram: 'success', rc: '0', commit: 'success' });
        expect(r.code).toBe(0);
        expect(r.out).toBe('');
      });
    });
  }
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

// Task 4 (light-scan and post-social-queue halves) and Task 6 (daily-video).
// telegram-notify.yml is held on owner question Q6.
describe('workflows that publish to public channels', () => {
  for (const name of ['light-scan.yml', 'post-social-queue.yml', 'daily-video.yml']) {
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
    // The commit step needs room after a slow scan: push-state.sh's backoff
    // alone is 30-38 s over 5 attempts, plus setup, pull and push.
    const job = wf('light-scan.yml').split('\n  notify-failure:\n')[0];
    const jobTimeout = Number(job.match(/\n    timeout-minutes: (\d+)\n/)?.[1]);
    const scanTimeout = Number(scan!.match(/\n\s+timeout-minutes: (\d+)\n/)?.[1]);
    expect(jobTimeout).toBeGreaterThanOrEqual(scanTimeout + 3);
    expect(commit).toMatch(/\n\s+if: always\(\)\n/);
    expect(commit).toMatch(/if \[ "\$\{\{ steps\.scan\.outcome \}\}" = "success" \]; then[^]*alerts\.json was not staged[^]*\n\s+fi\n/);
  });

  it('post-social-queue.yml commits its queue/history even when a poster step fails', () => {
    const step = wf('post-social-queue.yml').split(/\n\s+- name: /).find(s => s.startsWith('Commit and push\n'));
    expect(step, '"Commit and push" step').toBeDefined();
    expect(step).toMatch(/\n\s+if: always\(\)\n/);
    expect(step).toContain('bash scripts/ci/push-state.sh social-queue 5');
    expect(step).toContain('TELEGRAM_CHANNEL_ID: ${{ secrets.TELEGRAM_CHANNEL_ID }}');
  });

  it('hourly-scan.yml does not use the rejected --no-edit flag', () => {
    expect(wf('hourly-scan.yml')).not.toContain('rebase --continue --no-edit');
  });
});

// Task N1-nightly: run 36217453805 (2026-09-26) lost the night to a rebase
// conflict with hourly-scan commits on the same trackers. Both finalize pushes
// go through push-state.sh with the structural resolver, the build gate still
// runs before the data commit, and a failure alerts only the private chat.
describe('update-data.yml finalize pushes', () => {
  const steps = () => wf('update-data.yml').split(/\n\s+- name: /);
  const step = (name: string) => {
    const s = steps().find(x => x.startsWith(`${name}\n`));
    expect(s, name).toBeDefined();
    return s as string;
  };

  it('never uses the bare pull --rebase / rebase --abort loop', () => {
    const src = wf('update-data.yml');
    expect(src).not.toMatch(/git pull --rebase origin main && git push/);
    expect(src).not.toMatch(/git rebase --abort/);
  });

  for (const [name, label] of [['Commit and push data', 'nightly-data'], ['Commit and push metrics', 'nightly-metrics']] as const) {
    it(`${name} resolves conflicts for every tracker and alerts privately`, () => {
      const s = step(name);
      expect(s).toContain(`bash scripts/ci/push-state.sh ${label} 5 --resolve --all-trackers`);
      expect(s).toContain('TELEGRAM_ALERT_CHAT_ID: ${{ secrets.TELEGRAM_ALERT_CHAT_ID }}');
      // TELEGRAM_CHANNEL_ID is passed only for push-state's equality guard.
      expect(s).toContain('TELEGRAM_CHANNEL_ID: ${{ secrets.TELEGRAM_CHANNEL_ID }}');
      expect(s).toContain('PUSH_STATE_HINT:');
    });
  }

  it('the metrics push never drags a failed data commit along, nor stray tracker files', () => {
    expect(step('Commit and push data')).toMatch(/\n\s+id: push_data\n/);
    const m = step('Commit and push metrics');
    expect(m).toMatch(/steps\.push_data\.outcome \}\}" = "failure"[^]*git reset -q --soft HEAD~1/);
    expect(m.indexOf('git reset -q --soft HEAD~1')).toBeLessThan(m.indexOf('git commit -m "chore(metrics)'));
    expect(m).toMatch(/::notice::Discarding [^\n]+\n\s+git checkout -- trackers\/\n\s+git clean -fdq -- trackers\//);
  });

  it('keeps the build gate before the data commit', () => {
    const all = steps();
    const gate = all.findIndex(s => s.startsWith('Build gate (catch runtime errors Zod misses)\n'));
    const commit = all.findIndex(s => s.startsWith('Commit and push data\n'));
    expect(gate).toBeGreaterThan(0);
    expect(commit).toBeGreaterThan(gate);
    expect(all[commit]).toContain("steps.build_check.outputs.build_ok == 'true'");
  });
});

// A claude-code-action step needs `id-token: write` to exchange the OIDC token
// for the OAuth credential. Without it the step dies in ~15 s with "Unable to
// get ACTIONS_ID_TOKEN_REQUEST_URL" — and every one of these steps runs under
// continue-on-error, so the job goes green having done nothing. That is how
// self-review.yml shipped: eight workflows declared the permission, the ninth
// did not, and nothing noticed because the run was a success.
describe('claude-code-action workflows declare id-token: write', () => {
  const dir = '.github/workflows';
  const agentWorkflows = readdirSync(dir)
    .filter(f => f.endsWith('.yml'))
    .filter(f => readFileSync(`${dir}/${f}`, 'utf8').includes('anthropics/claude-code-action'));

  it('finds the agent workflows at all (a rename must not empty this suite)', () => {
    expect(agentWorkflows.length).toBeGreaterThanOrEqual(8);
  });

  for (const file of agentWorkflows) {
    it(`${file} declares id-token: write`, () => {
      expect(readFileSync(`${dir}/${file}`, 'utf8')).toMatch(/^\s+id-token: write$/m);
    });
  }
});

// The 60-day scout closure is the only thing keeping the proposal backlog
// bounded, and it had `|| true` on the close itself: a token without
// issues:write would print "closing #N" for every proposal, close none, and
// leave the job green week after week. Nobody would notice until the backlog
// had grown back.
describe('scout stale-proposal closure fails when it cannot close', () => {
  const step = () => {
    const src = wf('tracker-lifecycle.yml');
    const start = src.indexOf('- name: Close stale scout proposals');
    expect(start).toBeGreaterThan(0);
    const end = src.indexOf('\n  prune:', start);
    return src.slice(start, end === -1 ? undefined : end);
  };

  it('never swallows the outcome of `gh issue close`', () => {
    expect(step()).not.toMatch(/gh issue close[^\n]*\|\|\s*true/);
  });

  it('counts failures and ends the step red', () => {
    const s = step();
    expect(s).toMatch(/FAILED=\$\(\(FAILED \+ 1\)\)/);
    expect(s).toMatch(/if \[ "\$FAILED" -gt 0 \]/);
    expect(s).toMatch(/exit 1/);
  });

  it('still tolerates a failed comment, which is explanation and not action', () => {
    expect(step()).toMatch(/gh issue comment[\s\S]{0,120}::warning::/);
  });

  it('does not count an empty selection as "0 0"', () => {
    // `COUNT=$(grep -c . f || echo 0)` captures grep's own 0 and the fallback.
    expect(step()).not.toMatch(/COUNT=\$\(grep -c \. [^\n]*\|\| echo 0\)/);
    expect(step()).toMatch(/COUNT=\$\(grep -c \. [^\n]*\) \|\| COUNT=0/);
  });
});

// The daily brief's voice. Two defects lived here: the public Telegram channel
// was sent the silent cut while Bluesky and Meta got the voiced one, and the
// narration was written to a remembered ~30 s against a 23.06 s render, so the
// voice lagged the slides and `amix duration=first` cut its closing line.
describe('daily-video narration reaches every destination, and fits the picture', () => {
  const jobsOf = () => {
    const src = wf('daily-video.yml');
    const progressAt = src.indexOf('\n  video-progress:\n');
    expect(progressAt).toBeGreaterThan(0);
    return { video: src.slice(0, progressAt), progress: src.slice(progressAt) };
  };
  const stepWith = (job: string, needle: string) =>
    job.split(/\n\s+- name: /).find((s) => s.includes(needle))!;

  for (const job of ['video', 'progress'] as const) {
    it(`${job} job sends Telegram the narrated cut when there is one`, () => {
      const tg = stepWith(jobsOf()[job], 'scripts/telegram-video-post.ts');
      expect(tg).toMatch(/NARRATED=/);
      expect(tg).toMatch(/\[ -f "\$NARRATED" \]/);
    });

    it(`${job} job writes the script to the measured render, not a remembered duration`, () => {
      const narrate = stepWith(jobsOf()[job], 'narrate-elevenlabs.ts --mode');
      expect(narrate).toMatch(/ffprobe .*format=duration/s);
      expect((narrate.match(/--video-seconds/g) ?? []).length).toBeGreaterThanOrEqual(1);
      // Both languages, or one track fits the picture and the other overruns.
      const invocations = narrate.split('\n').filter((l) => l.includes('narrate-elevenlabs.ts --mode'));
      expect(invocations).toHaveLength(2);
      for (const line of invocations) expect(line).toContain('$FIT');
    });

    it(`${job} job starts the voice where the script says, not at frame 0`, () => {
      const narrate = stepWith(jobsOf()[job], 'narrate-elevenlabs.ts --mode');
      expect(narrate).toMatch(/--lead-in/);
      // The hook cut opens on a headline after 60 frames, the brief after 90.
      expect(narrate).toMatch(/VIDEO_CUT.*hook/s);
      const merge = stepWith(jobsOf()[job], 'amix=inputs=2');
      expect(merge).toMatch(/\.delay-ms/);
      expect(merge).toMatch(/adelay=delays=\$\{DELAY\}ms:all=1/);
      // A missing or junk sidecar must mean "no delay", never an ffmpeg error.
      expect(merge).toMatch(/\|\|\s*echo 0/);
      expect(merge).toMatch(/\*\[!0-9\]\*\) DELAY=0/);
    });

    it(`${job} job verifies the mix produced audio, and the gate reads its outcome`, () => {
      const j = jobsOf()[job];
      const merge = stepWith(j, 'amix=inputs=2');
      expect(merge).toMatch(/ffprobe .*select_streams a:0/s);
      expect(merge).toMatch(/::error::/);
      const id = job === 'video' ? 'merge' : 'merge_progress';
      expect(merge).toContain(`id: ${id}`);
      expect(j).toContain(`steps.${id}.outcome`);
    });
  }
});
