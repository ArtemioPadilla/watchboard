import { describe, it, expect } from 'vitest';
import { buildPrompt, validateCandidates, chooseHook, HOOK_PATTERNS } from '../scripts/generate-hook';

/**
 * The validation here is the load-bearing part. A generated hook is the first
 * thing a viewer sees and it publishes unattended, so a bad generation must be
 * rejected rather than rendered — the fallback is a trimmed real headline,
 * which is duller but always true.
 */
describe('validateCandidates', () => {
  it('accepts a well-formed candidate', () => {
    expect(validateCandidates([{ pattern: 'threat', text: 'Iran flew 47 sorties in a day' }]))
      .toEqual([{ pattern: 'threat', text: 'Iran flew 47 sorties in a day' }]);
  });

  it('rejects anything too long to render', () => {
    expect(validateCandidates([{ pattern: 'threat', text: 'x'.repeat(73) }])).toEqual([]);
  });

  it('rejects hashtags and emoji, which read as marketing', () => {
    expect(validateCandidates([{ pattern: 'threat', text: 'Big news #osint' }])).toEqual([]);
    expect(validateCandidates([{ pattern: 'threat', text: 'Big news 🔥' }])).toEqual([]);
  });

  it('treats an empty string as the model declining the pattern', () => {
    // The prompt tells it to decline rather than force a pattern onto facts
    // that do not support one. That must not become an empty on-screen hook.
    expect(validateCandidates([
      { pattern: 'threat', text: 'Real hook here' },
      { pattern: 'contrarian', text: '   ' },
    ])).toEqual([{ pattern: 'threat', text: 'Real hook here' }]);
  });

  it('rejects unknown patterns', () => {
    expect(validateCandidates([{ pattern: 'clickbait', text: 'You will not believe' }])).toEqual([]);
  });

  it('survives malformed input without throwing', () => {
    expect(validateCandidates(null)).toEqual([]);
    expect(validateCandidates('nope')).toEqual([]);
    expect(validateCandidates([null, 42, { pattern: 'threat' }])).toEqual([]);
  });

  it('strips trailing punctuation', () => {
    expect(validateCandidates([{ pattern: 'stakes', text: 'This could reshape the Gulf.' }])[0].text)
      .toBe('This could reshape the Gulf');
  });
});

describe('chooseHook', () => {
  it('prefers threat over contrarian, which needs the viewer to hold a prior', () => {
    const chosen = chooseHook([
      { pattern: 'contrarian', text: 'Everyone thinks it is over' },
      { pattern: 'threat', text: 'Iran flew 47 sorties' },
    ], 'fallback');
    expect(chosen).toBe('Iran flew 47 sorties');
  });

  it('breaks ties on length', () => {
    const chosen = chooseHook([
      { pattern: 'threat', text: 'A much longer opening line about it' },
      { pattern: 'threat', text: 'Short and sharp' },
    ], 'fallback');
    expect(chosen).toBe('Short and sharp');
  });

  it('falls back when nothing survived validation', () => {
    expect(chooseHook([], 'Somalia: Israel appoints ambassador')).toBe('Somalia: Israel appoints ambassador');
  });
});

describe('buildPrompt', () => {
  it('names every pattern and states the character budget', () => {
    const p = buildPrompt({ name: 'Iran Conflict', headline: 'Strikes resume' });
    for (const { id } of HOOK_PATTERNS) expect(p).toContain(id);
    expect(p).toContain('72 characters');
  });

  it('tells the model to decline rather than invent', () => {
    const p = buildPrompt({ name: 'x' });
    expect(p).toContain('Do not invent');
    expect(p).toContain('empty string');
  });
});
