#!/usr/bin/env bash
# Push the local state commit(s) to origin/main, surviving the 14 bots that
# also push there. On final failure: ::error:: plus a PRIVATE ops alert
# (TELEGRAM_ALERT_CHAT_ID, never TELEGRAM_CHANNEL_ID) so a human can land the
# state by hand instead of the next run re-posting to the public channel.
# Usage: scripts/ci/push-state.sh <label> [attempts=5] [--resolve <resolve-rebase-conflicts.sh args>...]
# Without --resolve a content conflict fails at once (it would recur on every
# retry). With --resolve, the conflict goes to resolve-rebase-conflicts.sh
# (structural JSON unions, see merge-json.mjs) and the result is pushed in the
# SAME attempt; only a conflict outside that policy fails. The nightly
# finalize uses `--resolve --all-trackers`: run 36217453805 lost the night to a
# conflict with hourly-scan commits on the same trackers.
# PUSH_STATE_HINT replaces the "what to do now" line of the private alert.
set -uo pipefail
label="${1:?usage: push-state.sh <label> [attempts] [--resolve <args>...]}"
attempts="${2:-5}"
resolve=0
resolve_args=()
if [ "${3:-}" = "--resolve" ]; then
  resolve=1
  shift 3
  resolve_args=("$@")
  [ "${#resolve_args[@]}" -gt 0 ] || { echo "::error::push-state: --resolve needs tracker slugs or --all-trackers" >&2; exit 2; }
elif [ -n "${3:-}" ]; then
  echo "::error::push-state: unknown argument ${3}" >&2
  exit 2
fi
here="$(cd "$(dirname "$0")" && pwd)"
hint="${PUSH_STATE_HINT:-Published items are NOT recorded on main — do not re-run; commit the state by hand.}"

# alert <reason>: private ops chat only; the reason says why, so the human
# knows whether to retry, rebase by hand or recover a stash.
alert() {
  if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_ALERT_CHAT_ID:-}" ]; then
    if [ "${TELEGRAM_ALERT_CHAT_ID}" = "${TELEGRAM_CHANNEL_ID:-}" ]; then
      echo "::error::push-state: TELEGRAM_ALERT_CHAT_ID equals TELEGRAM_CHANNEL_ID — refusing to alert the public channel"
    else
      run_url="${GITHUB_SERVER_URL:-}/${GITHUB_REPOSITORY:-}/actions/runs/${GITHUB_RUN_ID:-}"
      text="$(printf '⚠️ State push failed: %s\nReason: %s\n%s\n%s\n%s' "$label" "$1" "$hint" "${PUSH_STATE_DETAIL:-}" "$run_url")"
      curl -sf -X POST "${TELEGRAM_API_BASE:-https://api.telegram.org}/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
        --data-urlencode "chat_id=${TELEGRAM_ALERT_CHAT_ID}" \
        --data-urlencode "text=${text}" >/dev/null \
        || echo "::warning::push-state: private ops alert could not be sent"
    fi
  fi
}

refuse() { echo "::error::push-state: refusing to push ${label} to main: $1"; alert "refused: $1"; exit 1; }

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

# After a rebase git calls done: when the autostash cannot be re-applied, git
# still prints "Successfully rebased" and exits 0, leaving UU files and a
# stash entry behind. Exits the script in that case.
check_autostash() {
  local unmerged stash_sha
  unmerged="$(git diff --name-only --diff-filter=U)"
  if [ -n "$unmerged" ] || [ "$(autostash_count)" -gt "$stashes_before" ]; then
    stash_sha="$(git rev-parse -q --verify 'stash@{0}' 2>/dev/null || echo unknown)"
    reason="autostash could not be re-applied after the rebase (conflicted: $(echo "${unmerged:-none}" | paste -sd ' ' -)); the uncommitted changes are kept in stash ${stash_sha}"
    echo "::error::push-state: ${reason}"
    # No later step may commit conflict markers or a half-applied stash.
    while IFS= read -r f; do
      [ -n "$f" ] && git checkout HEAD -- "$f"
    done <<< "$unmerged"
    git reset -q
    alert "$reason"
    exit 1
  fi
}

# push_now [suffix]: exits 0 on success, otherwise records the reason.
push_now() {
  check_autostash
  if git push origin HEAD:main; then
    echo "push-state: ${label} pushed on attempt ${i}${1:-}"
    exit 0
  fi
  reason="git push rejected (main moved, or auth/network failure)"
}

tried=0
reason="no attempt made"
for i in $(seq 1 "$attempts"); do
  tried=$i
  if git pull --rebase --autostash origin main; then
    push_now
  else
    conflicted="$(git diff --name-only --diff-filter=U | paste -sd ' ' -)"
    if [ -n "$conflicted" ] && [ "$resolve" = 1 ]; then
      # Resolve and push in this same attempt: resolving and then sleeping
      # used the attempt up while main kept moving (PR-0, hourly-push.sh).
      echo "push-state: rebase conflict in ${conflicted} — applying resolve-rebase-conflicts.sh"
      if bash "$here/resolve-rebase-conflicts.sh" "${resolve_args[@]}"; then
        push_now " after resolving conflicts"
      else
        # The resolver names the path and aborts the rebase; the same path
        # conflicts again on every retry, so fail now, loudly.
        git rebase --abort 2>/dev/null || true
        reason="content conflict outside the resolve policy (conflicted: ${conflicted}) — not retrying"
        echo "::error::push-state: ${reason}"
        break
      fi
    else
      git rebase --abort 2>/dev/null || true
      if [ -n "$conflicted" ]; then
        # A content conflict recurs identically on every retry: fail now, loudly.
        reason="content conflict in ${conflicted} — not retrying"
        echo "::error::push-state: ${reason}"
        break
      fi
      reason="git pull --rebase failed (network, auth or dirty tree)"
    fi
  fi
  echo "push-state: attempt ${i} failed: ${reason}"
  if [ "$i" -lt "$attempts" ] && [ "${PUSH_STATE_NO_SLEEP:-}" != "1" ]; then
    sleep $(( (2 ** i) + RANDOM % 3 ))
  fi
done

attempt_word="attempts"; [ "$tried" -eq 1 ] && attempt_word="attempt"
echo "::error::push-state: failed to push ${label} after ${tried} ${attempt_word}: ${reason}"
alert "$reason (after ${tried} ${attempt_word})"
exit 1
