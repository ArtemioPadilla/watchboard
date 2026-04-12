---
description: Guide for installing Agent Triforce CI/CD workflow templates into your GitHub Actions pipeline
---

Set up Agent Triforce CI/CD integration for this project. This command explains how to install the GitHub Actions workflow templates.

## Available Workflow Templates

Agent Triforce provides 3 GitHub Actions workflow templates in `templates/ci/`:

### 1. PR Security Review (`pr-review.yml`)
- **Triggers on**: Pull request opened or updated
- **What it does**: Runs Centinela security review on changed files, posts findings as a PR comment
- **Blocks merge if**: Critical or High severity findings detected
- **Model**: Haiku (cost-efficient for routine reviews)
- **Timeout**: 5 minutes

### 2. Security Audit (`security-audit.yml`)
- **Triggers on**: Push to main branch
- **What it does**: Runs a full OWASP-focused security audit on changed files
- **Output**: Saves audit report as a GitHub Actions artifact (90-day retention)
- **Model**: Haiku
- **Timeout**: 10 minutes

### 3. Release Check (`release-check.yml`)
- **Triggers on**: Tag push matching `v*` (e.g., `v1.0.0`)
- **What it does**: Runs the 5-criterion release readiness check (test coverage, security, CHANGELOG, dependencies, tech debt)
- **Blocks release if**: Verdict is NO-GO
- **Output**: Attaches go/no-go report to the GitHub release
- **Model**: Sonnet (higher capability for release decisions)
- **Timeout**: 10 minutes

## Installation Steps

Tell the user to follow these steps:

1. **Set up the API key secret**:
   - Go to your repository Settings > Secrets and variables > Actions
   - Create a new repository secret named `ANTHROPIC_API_KEY`
   - Paste your Anthropic API key as the value

2. **Copy the workflow files**:
   ```bash
   mkdir -p .github/workflows
   cp templates/ci/pr-review.yml .github/workflows/
   cp templates/ci/security-audit.yml .github/workflows/
   cp templates/ci/release-check.yml .github/workflows/
   ```

3. **Commit and push**:
   ```bash
   git add .github/workflows/
   git commit -m "ci: add Agent Triforce CI/CD workflows"
   git push
   ```

4. **Verify**: Open a pull request to test the PR review workflow. The security audit runs automatically on the next push to main.

## Cost Considerations

- PR reviews and security audits use **Haiku** to minimize costs (~$0.01-0.03 per run)
- Release checks use **Sonnet** for higher accuracy (~$0.05-0.15 per run)
- All workflows have timeouts to prevent runaway costs
- Estimated monthly cost for an active project (20 PRs, 50 pushes, 2 releases): ~$1-3

## Customization

The templates are starting points. Common customizations:
- Adjust `timeout-minutes` for larger codebases
- Change the model in the `model` field (e.g., use Sonnet for PR reviews on security-sensitive repos)
- Add path filters to `on.pull_request.paths` to skip reviews for docs-only changes
- Add `on.pull_request.paths-ignore` for files that do not need security review

Note: These templates require the `anthropic/claude-code-action@v1` GitHub Action and an active Anthropic API key.
