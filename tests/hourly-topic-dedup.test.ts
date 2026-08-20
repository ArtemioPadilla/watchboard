import { describe, it, expect } from 'vitest';
import { topicKeyOf, sameTopic } from '../scripts/hourly-light-scan';

/**
 * These cases are not invented. Every headline below was pulled from
 * public/_hourly/triage-log.json on 2026-08-19, and every "same story" pair
 * alerted twice to the public Telegram channel that day because the 0.6 ratio
 * did not match them.
 *
 * The dedup has now failed silently twice: once because the state file was
 * never committed (so it started every run with no memory), and once because
 * the threshold was too strict. Both times it looked fine from the outside.
 * Hence tests.
 */
const same: Array<[string, string, string]> = [
  [
    'UAE trade suspension, three outlets',
    'United Arab Emirates suspends trade with Iran after coming under renewed missile fire',
    'UAE says it is suspending trade with Iran after missile launch - The Washington Post',
  ],
  [
    'Clancy trial, two outlets',
    'Lindsay Clancy trial ends earlier than expected "due to unforeseen circumstances"',
    'Lindsay Clancy trial recap: Court ends abruptly after TikToker questioned - USA Today',
  ],
  [
    'Kim/Trump overture, Al Jazeera vs wire',
    'Trump cosying up to Kim Jong Un again, tit for tat - Al Jazeera',
    'Donald Trump claimed the North Korean leader Kim Jong Un had responded positively to his talk proposal',
  ],
  [
    'mRNA cancer vaccine, WSJ vs Reuters',
    'Moderna shares double on mRNA cancer vaccine success - WSJ',
    'Moderna, Merck cancer vaccine breakthrough could usher new wave - Reuters',
  ],
  [
    'Canada tariff deal',
    'Trump and Canada’s Carney Seem to Make Progress on a Tariff Deal, but Talks Continue',
    'U.S. Eyes Lower Tariffs on Metals and Autos in Canada Trade Deal - WSJ',
  ],
];

const different: Array<[string, string, string]> = [
  [
    'same region, unrelated events',
    'Israel confirms soldiers fired at car in which Hind Rajab was killed',
    'Moderna shares double on mRNA cancer vaccine success',
  ],
  [
    'shared country, different story',
    'Ukraine drone strike hits Kyiv apartment block overnight',
    'Moderna, Merck cancer vaccine breakthrough could usher new wave',
  ],
  [
    'two entities in common is not enough',
    'Russia and Ukraine open talks in Geneva over prisoner exchange',
    'Russia says Ukraine grain corridor deal will not be renewed',
  ],
];

describe('topicKeyOf', () => {
  it('drops outlet names, which are what differs between two takes on one story', () => {
    expect(topicKeyOf('Cancer vaccine trial - Reuters')).not.toContain('reuters');
    expect(topicKeyOf('Cancer vaccine trial - BBC')).toBe(topicKeyOf('Cancer vaccine trial - Reuters'));
  });

  it('drops tracking-slug fragments but keeps numbers that identify a story', () => {
    expect(topicKeyOf('Blast kills 150 in Kabul market 4x9tv5m')).not.toContain('4x9tv5m');
    // Numbers survive the mixed-token filter; the 3-char minimum in the tokeniser
    // means short counts like "12" are dropped for length, which predates this.
    expect(topicKeyOf('Blast kills 150 in Kabul market')).toContain('150');
  });

  it('singularises so wire copy and longform match', () => {
    expect(topicKeyOf('Houthis claim missile attacks')).toContain('missile');
    expect(topicKeyOf('Houthi missile attack')).toContain('missile');
  });
});

describe('sameTopic', () => {
  it.each(same)('treats as one story: %s', (_label, a, b) => {
    expect(sameTopic(topicKeyOf(a), topicKeyOf(b))).toBe(true);
  });

  it.each(different)('keeps separate: %s', (_label, a, b) => {
    expect(sameTopic(topicKeyOf(a), topicKeyOf(b))).toBe(false);
  });

  it('never matches an empty key, so a title of pure stopwords cannot swallow everything', () => {
    expect(sameTopic('', topicKeyOf('Moderna cancer vaccine breakthrough'))).toBe(false);
  });
});
