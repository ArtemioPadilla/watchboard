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
