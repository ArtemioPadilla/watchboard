# Self review

A weekly agent pass over the repo, one *dimension* at a time, filing at most
a handful of verified findings as GitHub issues.

```
self-review/dimensions.json   the registry — this is the file you edit
self-review/state.json        last-run timestamp per dimension (written by CI)
self-review/reports/          one markdown report per run, including what was dropped
scripts/lib/self-review.ts    rotation, fingerprinting, filtering (pure, tested)
.github/workflows/self-review.yml
```

## Adding a dimension

Append an object to `dimensions` in `dimensions.json`. Nothing else changes —
no workflow edit, no new script.

```json
{
  "id": "kebab-case-id",
  "title": "One line, shown in the issue and the run summary",
  "enabled": true,
  "intervalDays": 14,
  "maxFindings": 3,
  "why": "What this caught, or would have caught. Required.",
  "prompt": "What to look for, how to verify it, and what not to report."
}
```

`why` is required by a test, on purpose. A dimension that cannot point at a
real defect it would have caught is a dimension that will produce plausible
noise. Every one shipped today traces to something found in the repo.

## The rules it runs under

**One dimension per run, by rotation.** Whichever is most overdue. Six agent
runs in one cron is a lot of spend and lands six batches of issues at once,
which is how a helpful bot becomes noise.

**Every finding must cite a file that exists.** Checked before filing, not
trusted. A finding with no checkable location is discarded — hallucinated or
already fixed, and either way it costs a human the time to find out.

**Findings are fingerprinted and deduped** against what is already open, so
the same claim is not refiled weekly. The fingerprint ignores digits, so a
finding that moves from line 42 to line 87 is recognised as the same thing.

**Findings are retired automatically** when the file they cite disappears.
This runs *first*, before the analysis, so a stale finding cannot block a
fresh report of the same area. It is deliberately conservative: a file that
still exists says nothing about whether the problem was fixed, so those are
left for a human.

**Zero findings is a valid result.** The prompt says so explicitly and the
report says so when it happens, because a dimension that always finds
something is a dimension that is inventing things.

## Why retirement is the important part

Two issues in this repo, #237 and #238, asserted things that were true when
written and quietly stopped being true — a tracker described as having "zero
coverage" of an event it had carried for months, and six trackers listed as
"verified uncovered" that all existed with 35–98 events each. Acting on
either would have burned roughly sixteen agent runs to add almost nothing.

A suggestion bot without a retirement path reproduces that at a weekly
cadence. That is the failure this design is built against.

## Running it by hand

```bash
npx tsx scripts/self-review-pick.ts --dry-run                 # what is due
npx tsx scripts/self-review-pick.ts --force doc-drift --dry-run
gh workflow run self-review.yml -f dimension=doc-drift -f dry_run=true
```
