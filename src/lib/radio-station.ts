/**
 * radio-station.ts — shared, framework-free logic for the radio-stations
 * layer: the feature-properties shape, the privacy-consent gate (audio
 * plays direct-to-broadcaster, exposing the listener's IP — see
 * docs/licenses/radio-browser.md), and the prefilled "report a broken
 * stream" issue link. Used by every surface (Leaflet, Cesium, home globe)
 * so the notice and the report flow behave identically everywhere.
 */
export interface RadioStationProperties {
  stationUuid: string;
  name: string;
  country: string | null;
  countryCode: string | null;
  language: string | null;
  freqLabel: string | null;
  streamUrl: string;
  codec: string;
  votes: number;
}

export function isRadioStationProperties(v: unknown): v is RadioStationProperties {
  return !!v && typeof v === 'object' && typeof (v as any).stationUuid === 'string' && typeof (v as any).streamUrl === 'string';
}

const CONSENT_KEY = 'watchboard-radio-privacy-ack-v1';

export function hasAcceptedRadioPrivacyNotice(): boolean {
  try { return localStorage.getItem(CONSENT_KEY) === '1'; } catch { return false; }
}

export function setAcceptedRadioPrivacyNotice(): void {
  try { localStorage.setItem(CONSENT_KEY, '1'); } catch { /* private browsing / blocked storage: ask again next time */ }
}

const REPO = 'https://github.com/ArtemioPadilla/watchboard';

export function buildRadioStreamIssueUrl(station: RadioStationProperties): string {
  const params = new URLSearchParams({
    template: 'radio-stream-issue.yml',
    'station-uuid': station.stationUuid,
    'stream-url': station.streamUrl,
    'station-name': station.name,
  });
  return `${REPO}/issues/new?${params.toString()}`;
}

/**
 * `pause()` alone keeps the stream's socket open — the browser goes on
 * buffering a live broadcast nobody hears. Dropping `src` and calling
 * `load()` resets the element and closes the connection.
 */
export function releaseAudio(audio: Pick<HTMLAudioElement, 'pause' | 'removeAttribute' | 'load'> | null | undefined): void {
  if (!audio) return;
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
}

export type StreamPlaybackState = 'idle' | 'connecting' | 'playing' | 'error';

/** The slice of HTMLAudioElement the player uses; tests pass a fake. */
export interface StreamAudio {
  pause(): void;
  removeAttribute(name: string): void;
  load(): void;
  play(): Promise<void>;
  addEventListener(type: 'playing' | 'error', listener: () => void): void;
}

export interface StreamPlayerOptions {
  createAudio: (url: string) => StreamAudio;
  onState: (state: StreamPlaybackState) => void;
  connectTimeoutMs?: number;
  retryDelayMs?: number;
}

/**
 * One stream at a time, one retry before giving up: the weekly file can
 * drift from a stream that went down since its last radio-browser.info
 * health check.
 *
 * Invariant: whenever the player gives up on an element (Stop, close, a
 * retry replacing it, the connect timeout, the retry failing) that element
 * is detached and released first, and every late callback (its
 * 'playing'/'error' events, the play() rejection that load() itself
 * triggers, a pending retry) checks it is still the current one. A stream
 * the UI calls stopped or failed can neither keep downloading nor come
 * back on its own.
 */
export function createStreamPlayer({
  createAudio, onState, connectTimeoutMs = 9000, retryDelayMs = 1500,
}: StreamPlayerOptions) {
  let current: StreamAudio | null = null;
  let connectTimer: ReturnType<typeof setTimeout> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  function release() {
    const audio = current;
    current = null;
    if (connectTimer) { clearTimeout(connectTimer); connectTimer = null; }
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
    releaseAudio(audio);
  }

  function start(url: string, isRetry = false) {
    release(); // the failed first attempt, on a retry
    onState('connecting');
    const audio = createAudio(url);
    current = audio;
    // The common real-world failure for internet radio is a socket that opens
    // and then sends nothing — neither the 'error' event nor the play()
    // rejection fires, so without this the UI is stuck on "Connecting…"
    // forever. Giving up closes the socket too: an "unavailable" stream must
    // not keep downloading, or answer late and start playing.
    connectTimer = setTimeout(() => {
      if (current !== audio) return;
      release();
      onState('error');
    }, connectTimeoutMs);
    audio.addEventListener('playing', () => {
      if (current !== audio) return;
      if (connectTimer) { clearTimeout(connectTimer); connectTimer = null; }
      onState('playing');
    });
    // 'error' and the play() rejection usually both fire: queue one retry.
    const onFailure = () => {
      if (current !== audio || retryTimer) return;
      if (isRetry) { release(); onState('error'); return; }
      retryTimer = setTimeout(() => {
        retryTimer = null;
        if (current === audio) start(url, true);
      }, retryDelayMs);
    };
    audio.addEventListener('error', onFailure);
    audio.play().catch(onFailure);
  }

  function stop() {
    release();
    onState('idle');
  }

  return { start, stop, release };
}
