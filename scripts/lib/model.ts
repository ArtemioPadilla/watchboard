/**
 * model.ts — the one place that decides which Claude model the scripts use.
 *
 * Before this, the model was written out at seven sites across `scripts/`,
 * and they had drifted: five said `claude-sonnet-4-6`, one
 * `claude-sonnet-4-6-20250514`, and `local-hourly.ts` a Bedrock id for
 * Sonnet *4*. Meanwhile seven of the eight workflows tracked the
 * claude-code-action default (`claude-sonnet-5-5`) and only
 * `hourly-scan.yml` pinned one — a generation behind, in the workflow with
 * the worst failure history. Nobody chose that spread; it accumulated.
 *
 * `CLAUDE_MODEL` is deliberately the same name as the repo variable the
 * workflows read (`vars.CLAUDE_MODEL`), so the model can be changed, or
 * rolled back, in one place for both surfaces without a commit.
 *
 * Pure: the environment is injectable so this is testable without touching
 * `process.env`.
 */

/**
 * The model used when nothing says otherwise.
 *
 * Verified rather than assumed: the nightly run of 2026-10-14 resolved the
 * claude-code-action default to `claude-sonnet-5-5`, so scripts and workflows
 * now agree by default instead of by coincidence.
 */
export const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-5-5';

/** Env keys consulted, in order of precedence. */
export const MODEL_ENV_KEYS = ['CLAUDE_MODEL', 'ANTHROPIC_MODEL'] as const;

/**
 * Resolves the model for Anthropic API calls.
 *
 * `ANTHROPIC_MODEL` stays supported because it is already documented in
 * `docs/self-hosting.md` and used by self-hosters; `CLAUDE_MODEL` wins when
 * both are set, since it is the name shared with the workflows.
 *
 * An empty or whitespace-only value is treated as unset — a blank env var in
 * CI should fall back to the default, not send `model: ""` to the API and
 * fail at request time.
 */
export function resolveClaudeModel(
  // Each key is read as a literal `process.env.X` rather than through
  // `env[key]`, because scripts/list-env-vars.ts discovers env vars by
  // matching that exact shape and gates docs/self-hosting.md on the result in
  // CI. Indirection here would silently leave CLAUDE_MODEL undocumented.
  env: Record<string, string | undefined> = {
    CLAUDE_MODEL: process.env.CLAUDE_MODEL,
    ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL,
  },
): string {
  for (const key of MODEL_ENV_KEYS) {
    const value = env[key]?.trim();
    if (value) return value;
  }
  return DEFAULT_CLAUDE_MODEL;
}
