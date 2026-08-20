# Silent failures in this pipeline

Written 2026-08-20 after a session that found the same defect nine times in
different costumes. It is the dominant failure mode here, and it is worth
naming because the usual signals — green checkmarks, passing builds, valid
schemas — are exactly the signals it defeats.

## The shape

**A step reports success while its work goes nowhere.** Nothing throws. The
workflow is green. The page renders. And the thing you believed was happening
is not happening, sometimes for months.

## The nine

| what looked fine | what was actually happening |
| --- | --- |
| Metrics committing `[success]` | No data in the commit |
| Nightly updating every section | A hardcoded section list skipped the rest |
| `update-log.json` tracking runs | Never stamped, so eligibility drifted |
| Seed agent finishing cleanly | Wrote nothing, exited 0, said "agents are running in the background" |
| Light-scan committing state | `git add a b c` aborts wholesale if any path is missing — one gitignored file killed the commit since May, so dedup started every run with no memory |
| Weekly audit archives | Pruned from a tracked file into an untracked one the next checkout never saw |
| 225 vitest tests | No workflow ran them |
| `Content-Security-Policy-Report-Only` in a `<meta>` | Ignored by browsers entirely — report-only is header-only, so the site had no policy at all |
| `if (Ion.defaultAccessToken)` guarding terrain | Always truthy; Cesium assigns a demo token at import. The guard never prevented anything |

## The inverse, which is just as expensive

Failure reported over work that *did* happen. The nightly failed on 2026-08-17
and 08-18 with data committed correctly — a tweet-drafting step that runs
*after* the commit had no `continue-on-error`, so it failed the job and opened
alert issues for two successful nights.

That direction trains you to ignore alerts, which is worse than the alert being
wrong.

## Stale literals

A subspecies worth its own row, because it is invisible to every automated
check — a string is a valid string:

- The video narration said **"Track these and 48 more"** aloud in every video, with 112 trackers.
- The homepage description and JSON-LD said **"48+ global events"** to every reader and crawler.
- `PUBLIC_POSTHOG_KEY` had a trailing `.` — 49 characters instead of 48 — so analytics 400'd on every page load since it was set. The build was green and the script tag rendered.

## What actually catches these

Not code review, and not type checking. Three things did:

**Run it and watch the output.** The hook-first video composition looked
correct; rendering one frame showed three unrelated stories filling half the
screen. The light-scan misrouting was invisible until 243 real headlines were
re-scored.

**Measure before and after, on real data.** Claiming an improvement without a
baseline hid a calibration flaw: a tracker with a 0.07 events/day baseline
scored the maximum escalation bonus on two events, outranking a war going from
1.29/day to 3.

**Watch outcomes, not jobs.** Alarms on job status miss all nine of the above.
`check-data-freshness.ts` judges each tracker against its own cadence;
`credential-canary.yml` checks whether credentials still work rather than
whether a workflow ran.

## Traps specific to this repo

- **`[tracker]` directories are invisible to plain git pathspecs.** Git reads
  `[tracker]` as a character class, so `git status -- src/pages/pt/` reports
  nothing even when the file exists and is tracked. Use `:(literal)`.
- **`git add a b c` is all-or-none.** Add paths individually and guard with
  `[ -f "$f" ]`.
- **ReliefWeb returns 403 to plain fetches** and its v1 API is decommissioned
  while v2 requires a registered appname. A browser user-agent on the report
  URL works. Do not conclude a source is unreachable on the first 403.
- **`continue-on-error` plus `|| echo` hides real breakage.** Both are correct
  for genuinely optional steps and dangerous everywhere else. AWS Polly errors
  on unsupported SSML tags, and `<emphasis>` is unsupported on every engine —
  adopting it would have dropped narration from every video silently.

## The rule

Verify the artefact, not the exit code. Re-read the file, count the entries,
load the page, render the frame. A green step is a claim, not evidence.
