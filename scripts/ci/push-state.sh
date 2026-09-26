#!/usr/bin/env bash
# Push the local state commit(s) to origin/main, surviving the 14 bots that
# also push there. On final failure: ::error:: plus a PRIVATE ops alert
# (TELEGRAM_ALERT_CHAT_ID, never TELEGRAM_CHANNEL_ID) so a human can land the
# state by hand instead of the next run re-posting to the public channel.
# Usage: scripts/ci/push-state.sh <label> [attempts=5]
set -uo pipefail
label="${1:?usage: push-state.sh <label> [attempts]}"
attempts="${2:-5}"

alert() {
  if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_ALERT_CHAT_ID:-}" ]; then
    if [ "${TELEGRAM_ALERT_CHAT_ID}" = "${TELEGRAM_CHANNEL_ID:-}" ]; then
      echo "::error::push-state: TELEGRAM_ALERT_CHAT_ID equals TELEGRAM_CHANNEL_ID — refusing to alert the public channel"
    else
      run_url="${GITHUB_SERVER_URL:-}/${GITHUB_REPOSITORY:-}/actions/runs/${GITHUB_RUN_ID:-}"
      text="$(printf '⚠️ State push failed: %s\nPublished items are NOT recorded on main — do not re-run; commit the state by hand.\n%s\n%s' "$label" "${PUSH_STATE_DETAIL:-}" "$run_url")"
      curl -sf -X POST "${TELEGRAM_API_BASE:-https://api.telegram.org}/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
        --data-urlencode "chat_id=${TELEGRAM_ALERT_CHAT_ID}" \
        --data-urlencode "text=${text}" >/dev/null \
        || echo "::warning::push-state: private ops alert could not be sent"
    fi
  fi
}

refuse() { echo "::error::push-state: refusing to push ${label} to main: $1"; alert; exit 1; }

# `git push origin HEAD:main` would put another branch's commits on main.
# actions/checkout on a schedule or a dispatch from main checks out the local
# branch main; a detached HEAD is accepted only when GITHUB_REF vouches for main.
branch="$(git symbolic-ref -q --short HEAD || true)"
if [ -n "${GITHUB_REF:-}" ] && [ "${GITHUB_REF}" != "refs/heads/main" ]; then
  refuse "the run is for ${GITHUB_REF}, not refs/heads/main"
fi
if [ -n "$branch" ] && [ "$branch" != "main" ]; then
  refuse "HEAD is on branch ${branch}, not main"
fi
if [ -z "$branch" ] && [ "${GITHUB_REF:-}" != "refs/heads/main" ]; then
  refuse "HEAD is detached and GITHUB_REF does not say refs/heads/main"
fi

autostash_count() { git stash list --format='%gs' | grep -c 'autostash' || true; }

dirty="$(git status --porcelain --untracked-files=no)"
# Report, never hide: a dirty tree is what made daily-video's pull fail on every attempt.
[ -n "$dirty" ] && printf 'push-state: dirty tree before pull: %s\n' "$(echo "$dirty" | sed 's/^ *//' | paste -sd ',' -)"
stashes_before="$(autostash_count)"

for i in $(seq 1 "$attempts"); do
  if git pull --rebase --autostash origin main; then
    # When the autostash cannot be re-applied, git still prints "Successfully
    # rebased" and exits 0, leaving UU files and a stash entry behind.
    unmerged="$(git diff --name-only --diff-filter=U)"
    if [ -n "$unmerged" ] || [ "$(autostash_count)" -gt "$stashes_before" ]; then
      stash_sha="$(git rev-parse -q --verify 'stash@{0}' 2>/dev/null || echo unknown)"
      echo "::error::push-state: autostash could not be re-applied after the rebase (conflicted: $(echo "${unmerged:-none}" | paste -sd ' ' -)); the uncommitted changes are kept in stash ${stash_sha}"
      # No later step may commit conflict markers or a half-applied stash.
      while IFS= read -r f; do
        [ -n "$f" ] && git checkout HEAD -- "$f"
      done <<< "$unmerged"
      git reset -q
      alert
      exit 1
    fi
    if git push origin HEAD:main; then
      echo "push-state: ${label} pushed on attempt ${i}"
      exit 0
    fi
  else
    conflicted="$(git diff --name-only --diff-filter=U | paste -sd ' ' -)"
    git rebase --abort 2>/dev/null || true
    if [ -n "$conflicted" ]; then
      # A content conflict recurs identically on every retry: fail now, loudly.
      echo "::error::push-state: content conflict in ${conflicted} — not retrying"
      break
    fi
  fi
  echo "push-state: attempt ${i} failed"
  if [ "$i" -lt "$attempts" ] && [ "${PUSH_STATE_NO_SLEEP:-}" != "1" ]; then
    sleep $(( (2 ** i) + RANDOM % 3 ))
  fi
done

echo "::error::push-state: failed to push ${label} after ${attempts} attempts"
alert
exit 1
