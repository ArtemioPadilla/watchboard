#!/usr/bin/env bash
# Conflict policy for hourly-scan's `git pull --rebase` (one local commit).
# During a rebase --ours is origin/main and --theirs is THIS job's commit
# (git-rebase(1)); the old inline block had them backwards and was dead code
# because `git rebase --continue --no-edit` is rejected (exit 129).
set -uo pipefail
tracker="${1:?usage: resolve-rebase-conflicts.sh <tracker-slug>}"
here="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"
abort() { echo "::error::resolve-rebase-conflicts: $1 — aborting"; git rebase --abort; exit 1; }
# Stage :2 = ours (origin/main), :3 = theirs (this job's commit).
union() {
  git show ":2:$2" > "$tmp/ours.json" && git show ":3:$2" > "$tmp/theirs.json" \
    && node "$here/merge-json.mjs" "$1" "$tmp/ours.json" "$tmp/theirs.json" "$2" \
    || abort "structural merge ($1) failed for $2"
}
# `while read` instead of `mapfile`: macOS ships bash 3.2, which has no mapfile.
while IFS= read -r f; do
  case "$f" in
    public/_metrics/index.json) union metrics-index "$f" ;;
    public/_metrics/*) git checkout --theirs -- "$f" ;;
    public/_hourly/state.json) git checkout --ours -- "$f" ;;
    "trackers/${tracker}/data/events/"*.json) union by-id "$f" ;;
    "trackers/${tracker}/data/digests.json") union digests "$f" ;;
    "trackers/${tracker}/"*)
      git checkout --theirs -- "$f"
      echo "::warning::resolve-rebase-conflicts: took the job's whole $f; main's concurrent edits to it are discarded" ;;
    *) abort "no policy for conflicted path $f" ;;
  esac
  git add -- "$f"
done < <(git diff --name-only --diff-filter=U)
# Never leave a half-finished rebase behind: the caller's next `git pull --rebase`
# would then fail on every retry with "rebase in progress".
GIT_EDITOR=true git rebase --continue || abort "git rebase --continue failed"
