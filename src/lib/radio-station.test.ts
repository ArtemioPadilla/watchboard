import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { hasAcceptedRadioPrivacyNotice, setAcceptedRadioPrivacyNotice, buildRadioStreamIssueUrl, isRadioStationProperties, releaseAudio, createStreamPlayer, type StreamPlaybackState } from './radio-station';

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

  it('does not throw when setItem is unavailable (private browsing / quota exceeded)', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => { throw new Error('QuotaExceededError'); },
      clear: () => {},
    });
    expect(() => setAcceptedRadioPrivacyNotice()).not.toThrow();
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

describe('releaseAudio', () => {
  it('pauses, drops src and reloads so the stream socket closes', () => {
    const calls: string[] = [];
    const audio = {
      pause: () => { calls.push('pause'); },
      removeAttribute: (name: string) => { calls.push(`remove:${name}`); },
      load: () => { calls.push('load'); },
    };
    releaseAudio(audio);
    expect(calls).toEqual(['pause', 'remove:src', 'load']);
  });

  it('is a no-op without an element', () => {
    expect(() => releaseAudio(null)).not.toThrow();
  });
});

/** Fake <audio>: records calls, lets the test fire events and settle play(). */
class FakeAudio {
  calls: string[] = [];
  listeners: Record<string, Array<() => void>> = {};
  private rejectPlay!: () => void;
  private playPromise = new Promise<void>((_, reject) => { this.rejectPlay = () => reject(new Error('NotAllowed')); });
  constructor(public url: string) {}
  pause() { this.calls.push('pause'); }
  removeAttribute(name: string) { this.calls.push(`remove:${name}`); }
  load() { this.calls.push('load'); }
  play() { return this.playPromise; }
  addEventListener(type: string, fn: () => void) { (this.listeners[type] ??= []).push(fn); }
  fire(type: 'playing' | 'error') { for (const fn of this.listeners[type] ?? []) fn(); }
  rejectPlayback() { this.rejectPlay(); }
  get released() { return this.calls.join(',') === 'pause,remove:src,load'; }
}

describe('createStreamPlayer', () => {
  let audios: FakeAudio[];
  let states: StreamPlaybackState[];
  let player: ReturnType<typeof createStreamPlayer>;
  const last = () => states[states.length - 1];

  beforeEach(() => {
    vi.useFakeTimers();
    audios = [];
    states = [];
    player = createStreamPlayer({
      createAudio: (url) => { const a = new FakeAudio(url); audios.push(a); return a; },
      onState: (s) => { states.push(s); },
    });
  });

  afterEach(() => { vi.useRealTimers(); });

  it('goes connecting → playing', () => {
    player.start('https://s.example/stream');
    expect(last()).toBe('connecting');
    audios[0].fire('playing');
    expect(last()).toBe('playing');
    vi.advanceTimersByTime(20_000); // connect timeout was cleared
    expect(last()).toBe('playing');
    expect(audios[0].released).toBe(false);
  });

  it('connect timeout releases the stream, and late events on it change nothing', async () => {
    player.start('https://s.example/stream');
    vi.advanceTimersByTime(9000);
    expect(last()).toBe('error');
    expect(audios[0].released).toBe(true);

    audios[0].fire('error');
    audios[0].rejectPlayback();
    await vi.runAllTimersAsync();
    audios[0].fire('playing'); // slow server answering at 12 s
    expect(last()).toBe('error');
    expect(audios).toHaveLength(1); // no reconnect without a click
  });

  it('Listen still works after a timeout', () => {
    player.start('https://s.example/stream');
    vi.advanceTimersByTime(9000);
    player.start('https://s.example/stream');
    expect(audios).toHaveLength(2);
    audios[1].fire('playing');
    expect(last()).toBe('playing');
  });

  it('retries once on failure, then gives up and releases the retry element', async () => {
    player.start('https://s.example/stream');
    audios[0].fire('error');
    audios[0].rejectPlayback(); // both usually fire: still one retry
    await vi.advanceTimersByTimeAsync(1500);
    expect(audios).toHaveLength(2);
    expect(audios[0].released).toBe(true);

    audios[1].fire('error');
    expect(last()).toBe('error');
    expect(audios[1].released).toBe(true);
    await vi.runAllTimersAsync();
    expect(audios).toHaveLength(2);
  });

  it('stop releases the stream and cancels a pending retry', async () => {
    player.start('https://s.example/stream');
    audios[0].fire('error');
    player.stop();
    expect(last()).toBe('idle');
    expect(audios[0].released).toBe(true);
    await vi.runAllTimersAsync();
    audios[0].fire('playing');
    expect(audios).toHaveLength(1);
    expect(last()).toBe('idle');
  });

  it('release (close/unmount) closes the socket without a state change', () => {
    player.start('https://s.example/stream');
    audios[0].fire('playing');
    const n = states.length;
    player.release();
    expect(audios[0].released).toBe(true);
    expect(states).toHaveLength(n);
  });
});
