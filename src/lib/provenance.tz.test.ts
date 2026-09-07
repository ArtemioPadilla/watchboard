process.env.TZ = 'Pacific/Kiritimati'; // UTC+14: local date differs from the UTC date for most of the day
import { describe, it, expect } from 'vitest';
import { shortDate, describeProvenance } from './provenance';

describe('shortDate is UTC-based whatever the runner zone', () => {
  it('reports the UTC calendar day', () => {
    expect(new Date('2026-09-06T22:00:00Z').getDate()).toBe(7); // proves the zone is in effect
    expect(shortDate('2026-09-06T22:00:00Z')).toBe('6 Sep');
    expect(describeProvenance({ method: 'llm', generatedAt: '2026-12-31T23:30:00Z' }).date).toBe('31 Dec');
  });
});
