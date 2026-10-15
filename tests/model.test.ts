import { describe, it, expect } from 'vitest';
import {
  resolveClaudeModel,
  DEFAULT_CLAUDE_MODEL,
  MODEL_ENV_KEYS,
} from '../scripts/lib/model';

describe('resolveClaudeModel', () => {
  it('falls back to the default when nothing is set', () => {
    expect(resolveClaudeModel({})).toBe(DEFAULT_CLAUDE_MODEL);
  });

  it('defaults to the model the workflows resolve to', () => {
    // The point of this module: scripts and workflows agree by default
    // instead of by coincidence. Verified against the nightly run of
    // 2026-10-14, which resolved the action default to claude-sonnet-5-5.
    expect(DEFAULT_CLAUDE_MODEL).toBe('claude-sonnet-5-5');
  });

  it('honours CLAUDE_MODEL', () => {
    expect(resolveClaudeModel({ CLAUDE_MODEL: 'claude-opus-5-5' })).toBe('claude-opus-5-5');
  });

  it('still honours ANTHROPIC_MODEL, which self-hosters already have', () => {
    expect(resolveClaudeModel({ ANTHROPIC_MODEL: 'claude-haiku-4-5' })).toBe('claude-haiku-4-5');
  });

  it('prefers CLAUDE_MODEL when both are set', () => {
    expect(
      resolveClaudeModel({ CLAUDE_MODEL: 'a-model', ANTHROPIC_MODEL: 'b-model' }),
    ).toBe('a-model');
  });

  it('treats blank and whitespace-only values as unset', () => {
    // A blank env var in CI must not send `model: ""` and fail at request time.
    expect(resolveClaudeModel({ CLAUDE_MODEL: '' })).toBe(DEFAULT_CLAUDE_MODEL);
    expect(resolveClaudeModel({ CLAUDE_MODEL: '   ' })).toBe(DEFAULT_CLAUDE_MODEL);
    expect(resolveClaudeModel({ CLAUDE_MODEL: '  ', ANTHROPIC_MODEL: 'fallback' })).toBe(
      'fallback',
    );
  });

  it('trims a padded value rather than passing the padding through', () => {
    expect(resolveClaudeModel({ CLAUDE_MODEL: '  claude-opus-5-5  ' })).toBe('claude-opus-5-5');
  });

  it('documents its precedence order', () => {
    expect([...MODEL_ENV_KEYS]).toEqual(['CLAUDE_MODEL', 'ANTHROPIC_MODEL']);
  });
});
