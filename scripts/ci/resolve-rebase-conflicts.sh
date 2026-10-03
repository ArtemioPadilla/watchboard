#!/usr/bin/env bash
# Conflict policy for a stopped `git pull --rebase` of bot state commits.
# During a rebase --ours is origin/main and --theirs is THIS job's commit
# (git-rebase(1)); the old inline block had them backwards and was dead code
# because `git rebase --continue --no-edit` is rejected (exit 129).
#
# Usage: resolve-rebase-conflicts.sh <tracker-slug>...   (hourly-scan: its own tracker)
#        resolve-rebase-conflicts.sh --all-trackers      (nightly finalize: one commit, many trackers)
# A tracker file is only resolved when its tracker is owned; any other
# conflicted path aborts the rebase (exit 1) so the caller fails loudly.
# Handles several local commits: every rebase stop is resolved in turn.
set -uo pipefail
[ "$#" -gt 0 ] || { echo "usage: resolve-rebase-conflicts.sh <tracker-slug>... | --all-trackers" >&2; exit 2; }
all_trackers=0
trackers=()
for a in "$@"; do
  if [ "$a" = "--all-trackers" ]; then all_trackers=1; else trackers+=("$a"); fi
done
here="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"
abort() { echo "::error::resolve-rebase-conflicts: $1 — aborting"; git rebase --abort; exit 1; }
# Stage :2 = ours (origin/main), :3 = theirs (this job's commit).
union() {
  git show ":2:$2" > "$tmp/ours.json" && git show ":3:$2" > "$tmp/theirs.json" \
    && node "$here/merge-json.mjs" "$1" "$tmp/ours.json" "$tmp/theirs.json" "$2" \
    || abort "structural merge ($1) failed for $2"
}
owned() {
  case "$1" in trackers/*/*) ;; *) return 1 ;; esac
  [ "$all_trackers" = 1 ] && return 0
  local t
  # ${arr[@]+...}: bash 3.2 (macOS) treats an empty array as unset under -u.
  for t in ${trackers[@]+"${trackers[@]}"}; do
    case "$1" in "trackers/${t}/"*) return 0 ;; esac
  done
  return 1
}
resolve_one() {
  local f="$1"
  case "$f" in
    public/_metrics/index.json) union metrics-index "$f" ;;
    public/_metrics/*) git checkout --theirs -- "$f" ;;
    public/_hourly/state.json) git checkout --ours -- "$f" ;;
    # main wins on a shared id: the poster's "posted" must never flip back to
    # "approved", or the next slot would post the same tweet again.
    public/_social/queue-*.json) union by-id-main-wins "$f" ;;
    public/_social/history.json|public/_social/budget.json)
      git checkout --ours -- "$f"
      echo "::warning::resolve-rebase-conflicts: kept main's $f (the poster's record); the job's edits to it are discarded" ;;
    public/_social/prompt-latest.txt) git checkout --theirs -- "$f" ;;
    *)
      owned "$f" || abort "no policy for conflicted path $f"
      case "$f" in
        trackers/*/data/events/*.json) union by-id "$f" ;;
        trackers/*/data/digests.json) union digests "$f" ;;
        *)
          git checkout --theirs -- "$f"
          echo "::warning::resolve-rebase-conflicts: took the job's whole $f; main's concurrent edits to it are discarded" ;;
      esac ;;
  esac
  git add -- "$f"
}

# One pass per stopped commit; bounded so a pathological history cannot spin.
for _ in $(seq 1 50); do
  # `while read` instead of `mapfile`: macOS ships bash 3.2, which has no mapfile.
  while IFS= read -r f; do
    [ -n "$f" ] && resolve_one "$f"
  done < <(git diff --name-only --diff-filter=U)
  # Never leave a half-finished rebase behind: the caller's next `git pull --rebase`
  # would then fail on every retry with "rebase in progress".
  if GIT_EDITOR=true git rebase --continue; then exit 0; fi
  # --continue stopped again: the next local commit conflicts too. Anything
  # else (nothing unmerged) is a failure we do not understand.
  [ -n "$(git diff --name-only --diff-filter=U)" ] || abort "git rebase --continue failed"
done
abort "too many conflicting commits"
