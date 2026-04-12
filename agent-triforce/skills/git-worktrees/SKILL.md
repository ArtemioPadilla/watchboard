---
name: git-worktrees
description: >
  Create and manage git worktrees for isolated feature work. Use when starting
  implementation that should not touch the main workspace, or for parallel
  development. Handles creation, baseline verification, and cleanup.
---

# Git Worktrees

Manage an isolated worktree for: $ARGUMENTS

## When to Use

- Starting feature implementation (keeps main workspace clean)
- Parallel development (multiple features simultaneously)
- Risky experiments (delete worktree if it fails, main untouched)
- Subagent isolation (agents work in worktree, can't pollute main)

## Create Worktree

```sh
PROJECT_ROOT="$(git rev-parse --show-toplevel)"
PROJECT_NAME="$(basename "$PROJECT_ROOT")"
FEATURE_NAME="{feature-name}"  # kebab-case, no spaces

WORKTREE_DIR="../${PROJECT_NAME}-worktrees/feat-${FEATURE_NAME}"
BRANCH_NAME="feat/${FEATURE_NAME}"

git worktree add -b "$BRANCH_NAME" "$WORKTREE_DIR"
cd "$WORKTREE_DIR"
```

## Verify Clean Baseline

After creating the worktree, run the project's test suite:

```sh
# Detect and run test command
if [ -f "package.json" ]; then
    npm test
elif [ -f "pyproject.toml" ] || [ -f "setup.py" ]; then
    pytest
elif [ -f "Cargo.toml" ]; then
    cargo test
elif [ -f "go.mod" ]; then
    go test ./...
fi
```

**If tests fail:** Fix baseline before starting implementation. Do not proceed with a broken baseline.

## During Implementation

- All work happens in the worktree directory
- Commit frequently to the feature branch
- Main workspace remains untouched
- Subagents receive the worktree path, not the main project path

## Finish Branch

When implementation is complete, present exactly these 4 options:

```
Implementation complete. What would you like to do?

1. Merge back to {base-branch} locally
2. Push and create a Pull Request
3. Keep the branch as-is (I'll handle it later)
4. Discard this work
```

### Option 1: Merge Locally
```sh
BASE_BRANCH="main"  # or detected base
cd "$PROJECT_ROOT"
git checkout "$BASE_BRANCH"
git pull
git merge "$BRANCH_NAME"
# Verify tests pass on merged result
git branch -d "$BRANCH_NAME"
git worktree remove "$WORKTREE_DIR"
```

### Option 2: Push + Create PR
```sh
git push -u origin "$BRANCH_NAME"
gh pr create --title "{title}" --body "## Summary
- {changes}

## Test Plan
- [ ] {verification steps}"
```
Worktree kept until PR merges.

### Option 3: Keep As-Is
Report worktree location. Do not clean up.

### Option 4: Discard
**Requires typed "discard" confirmation.**
```sh
cd "$PROJECT_ROOT"
git checkout "$BASE_BRANCH"
git branch -D "$BRANCH_NAME"
git worktree remove "$WORKTREE_DIR" --force
```

## Safety Rules

- Never create worktrees on `main`/`master` — always a new branch
- Always verify test baseline before starting work
- Discard requires typed confirmation — no accidental deletion
- Check `git worktree list` before creating to avoid duplicates
