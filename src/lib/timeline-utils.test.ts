import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveEventDate, flattenTimelineEvents } from './timeline-utils';
import type { TimelineEra } from './schemas';

// ── resolveEventDate ──

describe('resolveEventDate', () => {
  describe('"Mon DD, YYYY" format', () => {
    it('resolves "Mar 1, 2026" to "2026-03-01"', () => {
      /** TC-timeline-001: resolveEventDate Mon DD, YYYY. Verifies: AC-date-resolve */
      expect(resolveEventDate('Mar 1, 2026')).toBe('2026-03-01');
    });

    it('resolves "Sep 26, 2014" to "2014-09-26"', () => {
      /** TC-timeline-002: resolveEventDate multi-digit day. Verifies: AC-date-resolve */
      expect(resolveEventDate('Sep 26, 2014')).toBe('2014-09-26');
    });

    it('resolves "Dec 31, 1999" to "1999-12-31"', () => {
      /** TC-timeline-003: resolveEventDate year boundary. Verifies: AC-date-resolve */
      expect(resolveEventDate('Dec 31, 1999')).toBe('1999-12-31');
    });

    it('resolves "Jan 1, 2000" to "2000-01-01"', () => {
      /** TC-timeline-004: resolveEventDate start of year. Verifies: AC-date-resolve */
      expect(resolveEventDate('Jan 1, 2000')).toBe('2000-01-01');
    });

    it('is case-insensitive for month abbreviation', () => {
      /** TC-timeline-005: resolveEventDate case insensitive. Verifies: AC-date-resolve */
      expect(resolveEventDate('mar 1, 2026')).toBe('2026-03-01');
      expect(resolveEventDate('MAR 1, 2026')).toBe('2026-03-01');
    });

    it('handles format without comma', () => {
      /** TC-timeline-006: resolveEventDate Mon DD YYYY without comma. Verifies: AC-date-resolve */
      expect(resolveEventDate('Mar 1 2026')).toBe('2026-03-01');
    });
  });

  describe('"Mon DD" format (assumes current year)', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('resolves "Mar 1" to current year', () => {
      /** TC-timeline-007: resolveEventDate Mon DD uses current year. Verifies: AC-date-resolve */
      expect(resolveEventDate('Mar 1')).toBe('2026-03-01');
    });

    it('resolves "Dec 31" to current year', () => {
      /** TC-timeline-008: resolveEventDate Dec 31 uses current year. Verifies: AC-date-resolve */
      expect(resolveEventDate('Dec 31')).toBe('2026-12-31');
    });

    it('pads single-digit days', () => {
      /** TC-timeline-009: resolveEventDate single digit day padding. Verifies: AC-date-resolve */
      expect(resolveEventDate('Feb 5')).toBe('2026-02-05');
    });
  });

  describe('"YYYY-MM-DD" format', () => {
    it('returns the string as-is', () => {
      /** TC-timeline-010: resolveEventDate ISO date passthrough. Verifies: AC-date-resolve */
      expect(resolveEventDate('2026-03-01')).toBe('2026-03-01');
    });

    it('handles any valid ISO date', () => {
      /** TC-timeline-011: resolveEventDate various ISO dates. Verifies: AC-date-resolve */
      expect(resolveEventDate('1986-04-26')).toBe('1986-04-26');
      expect(resolveEventDate('2001-09-11')).toBe('2001-09-11');
    });
  });

  describe('invalid or non-day-level inputs', () => {
    it('returns null for a plain year', () => {
      /** TC-timeline-012: resolveEventDate rejects plain year. Verifies: AC-date-resolve */
      expect(resolveEventDate('2026')).toBeNull();
    });

    it('returns null for month/year text', () => {
      /** TC-timeline-013: resolveEventDate rejects month/year. Verifies: AC-date-resolve */
      expect(resolveEventDate('March 2026')).toBeNull();
    });

    it('returns null for empty string', () => {
      /** TC-timeline-014: resolveEventDate rejects empty. Verifies: AC-date-resolve */
      expect(resolveEventDate('')).toBeNull();
    });

    it('returns null for random text', () => {
      /** TC-timeline-015: resolveEventDate rejects random text. Verifies: AC-date-resolve */
      expect(resolveEventDate('Yesterday')).toBeNull();
    });

    it('returns null for partial ISO date', () => {
      /** TC-timeline-016: resolveEventDate rejects partial ISO. Verifies: AC-date-resolve */
      expect(resolveEventDate('2026-03')).toBeNull();
    });
  });
});

// ── flattenTimelineEvents ──

describe('flattenTimelineEvents', () => {
  function makeEra(era: string, events: Array<{ year: string; id?: string }>): TimelineEra {
    return {
      era,
      events: events.map((ev, i) => ({
        id: ev.id || `${era}-${i}`,
        year: ev.year,
        title: `Event ${i}`,
        type: 'military',
        detail: 'Details here',
        sources: [],
      })),
    };
  }

  it('flattens multiple eras into a single array', () => {
    /** TC-timeline-017: flattenTimelineEvents basic flattening. Verifies: AC-flatten */
    const timeline: TimelineEra[] = [
      makeEra('Era 1', [{ year: '2026-03-01' }, { year: '2026-03-02' }]),
      makeEra('Era 2', [{ year: '2026-03-03' }]),
    ];
    const flat = flattenTimelineEvents(timeline);
    expect(flat).toHaveLength(3);
    expect(flat[0].resolvedDate).toBe('2026-03-01');
    expect(flat[1].resolvedDate).toBe('2026-03-02');
    expect(flat[2].resolvedDate).toBe('2026-03-03');
  });

  it('excludes events with non-resolvable dates', () => {
    /** TC-timeline-018: flattenTimelineEvents skips unresolvable dates. Verifies: AC-flatten */
    const timeline: TimelineEra[] = [
      makeEra('Mixed', [
        { year: '2026-03-01' },
        { year: '2026' },
        { year: 'Mar 5, 2026' },
      ]),
    ];
    const flat = flattenTimelineEvents(timeline);
    expect(flat).toHaveLength(2);
    expect(flat[0].resolvedDate).toBe('2026-03-01');
    expect(flat[1].resolvedDate).toBe('2026-03-05');
  });

  it('returns empty array for empty timeline', () => {
    /** TC-timeline-019: flattenTimelineEvents empty input. Verifies: AC-flatten */
    expect(flattenTimelineEvents([])).toEqual([]);
  });

  it('preserves all original event properties plus resolvedDate', () => {
    /** TC-timeline-020: flattenTimelineEvents preserves event fields. Verifies: AC-flatten */
    const timeline: TimelineEra[] = [
      {
        era: 'Test',
        events: [{
          id: 'evt-1',
          year: 'Sep 26, 2014',
          title: 'Ayotzinapa Disappearance',
          type: 'humanitarian',
          detail: 'Students disappeared',
          sources: [{ name: 'AP', tier: 1 }],
        }],
      },
    ];
    const flat = flattenTimelineEvents(timeline);
    expect(flat).toHaveLength(1);
    expect(flat[0].id).toBe('evt-1');
    expect(flat[0].title).toBe('Ayotzinapa Disappearance');
    expect(flat[0].type).toBe('humanitarian');
    expect(flat[0].resolvedDate).toBe('2014-09-26');
    expect(flat[0].sources).toHaveLength(1);
  });

  it('handles eras with no events', () => {
    /** TC-timeline-021: flattenTimelineEvents empty era. Verifies: AC-flatten */
    const timeline: TimelineEra[] = [
      { era: 'Empty', events: [] },
      makeEra('Has data', [{ year: '2026-03-01' }]),
    ];
    const flat = flattenTimelineEvents(timeline);
    expect(flat).toHaveLength(1);
  });
});
