import { describe, it, expect } from 'vitest';
import { eventToSlug, eventPermalink } from './event-slug';

describe('eventToSlug', () => {
  it('generates slug from date + id', () => {
    expect(eventToSlug('2026-03-31', 'idf_day32_170_targets_mar31'))
      .toBe('2026-03-31-idf-day32-170-targets-mar31');
  });

  it('handles already-kebab-case ids', () => {
    expect(eventToSlug('2026-04-01', 'us-strike-tehran'))
      .toBe('2026-04-01-us-strike-tehran');
  });

  it('strips unsafe characters', () => {
    expect(eventToSlug('2026-01-15', 'test@event#with!chars'))
      .toBe('2026-01-15-test-event-with-chars');
  });

  it('collapses multiple hyphens', () => {
    expect(eventToSlug('2026-02-01', 'too___many___underscores'))
      .toBe('2026-02-01-too-many-underscores');
  });

  it('lowercases everything', () => {
    expect(eventToSlug('2026-03-01', 'IDF_Strike_TEHRAN'))
      .toBe('2026-03-01-idf-strike-tehran');
  });
});

describe('eventPermalink', () => {
  it('builds full permalink path', () => {
    expect(eventPermalink('iran-conflict', '2026-03-31', 'idf_day32'))
      .toBe('/iran-conflict/events/2026-03-31-idf-day32');
  });

  it('accepts custom basePath', () => {
    expect(eventPermalink('iran-conflict', '2026-03-31', 'idf_day32', '/watchboard/'))
      .toBe('/watchboard/iran-conflict/events/2026-03-31-idf-day32');
  });
});
