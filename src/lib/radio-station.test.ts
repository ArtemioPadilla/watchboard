import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { hasAcceptedRadioPrivacyNotice, setAcceptedRadioPrivacyNotice, buildRadioStreamIssueUrl, isRadioStationProperties } from './radio-station';

describe('radio privacy consent (localStorage, try/catch)', () => {
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    mockStorage = {};
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, value: string) => { mockStorage[key] = value; },
      clear: () => { mockStorage = {}; },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is false until set, true after', () => {
    expect(hasAcceptedRadioPrivacyNotice()).toBe(false);
    setAcceptedRadioPrivacyNotice();
    expect(hasAcceptedRadioPrivacyNotice()).toBe(true);
  });

  it('degrades to false instead of throwing when localStorage is unavailable', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('SecurityError'); },
      setItem: () => {},
      clear: () => {},
    });
    expect(hasAcceptedRadioPrivacyNotice()).toBe(false);
  });
});

describe('buildRadioStreamIssueUrl', () => {
  it('prefills the radio-stream-issue template with the station uuid and stream url', () => {
    const url = buildRadioStreamIssueUrl({ stationUuid: 'abc-123', name: 'Test FM', streamUrl: 'https://stream.example/x', country: 'Ukraine', countryCode: 'UA', language: null, freqLabel: null, codec: 'MP3', votes: 1 });
    expect(url).toContain('https://github.com/ArtemioPadilla/watchboard/issues/new');
    expect(url).toContain('template=radio-stream-issue.yml');
    expect(url).toContain(encodeURIComponent('abc-123'));
    expect(url).toContain(encodeURIComponent('https://stream.example/x'));
  });
});

describe('isRadioStationProperties', () => {
  it('accepts a station-shaped object and rejects anything without stationUuid', () => {
    expect(isRadioStationProperties({ stationUuid: 'x', name: 'n', streamUrl: 'https://a', codec: 'MP3', votes: 0, country: null, countryCode: null, language: null, freqLabel: null })).toBe(true);
    expect(isRadioStationProperties({ osmId: '1', radioBand: 'fm' })).toBe(false);
    expect(isRadioStationProperties(null)).toBe(false);
  });
});
