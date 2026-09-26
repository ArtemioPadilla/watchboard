#!/usr/bin/env bash
# Push hourly-scan's single local commit to origin/main, racing the other
# matrix jobs. A conflict resolved by resolve-rebase-conflicts.sh is pushed in
# the SAME attempt: resolving and then sleeping used up the attempt, and under
# contention 2-3 of 10 concurrent jobs lost their update.
# Usage: scripts/ci/hourly-push.sh <tracker-slug> [attempts=10]
# HOURLY_PUSH_FAST=1 scales the jitter from seconds to tenths of a second (tests only).
set -uo pipefail
tracker="${1:?usage: hourly-push.sh <tracker-slug> [attempts]}"
attempts="${2:-10}"
here="$(cd "$(dirname "$0")" && pwd)"

for i in $(seq 1 "$attempts"); do
  if git pull --rebase origin main; then
    if git push; then
      echo "hourly-push: ${tracker} pushed on attempt ${i}"
      exit 0
    fi
  else
    echo "Rebase conflict on attempt $i — applying scripts/ci/resolve-rebase-conflicts.sh"
    if bash "$here/resolve-rebase-conflicts.sh" "$tracker" && git push; then
      echo "hourly-push: ${tracker} pushed on attempt ${i} after resolving conflicts"
      exit 0
    fi
    echo "::warning::hourly-push: attempt $i did not land (conflict outside policy, or main moved again)"
  fi
  if [ "$i" -lt "$attempts" ]; then
    # Jitter window widens with each attempt so the jobs still racing spread out
    # instead of colliding again on the same beat.
    window=$(( 2 + 2 * i ))
    if [ "${HOURLY_PUSH_FAST:-}" = "1" ]; then
      ms=$(( RANDOM % (window * 100) ))
      sleep "$(( ms / 1000 )).$(printf '%03d' $(( ms % 1000 )))"
    else
      sleep $(( RANDOM % window + 1 ))
    fi
  fi
done
echo "::error::Failed to push hourly update for ${tracker} after ${attempts} attempts"
exit 1
