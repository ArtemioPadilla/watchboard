import { useEffect, useRef, useState } from 'react';
import { t } from '../../../i18n/translations';
import { useLocale } from '../../../i18n/useLocale';
import {
  type RadioStationProperties, isRadioStationProperties,
  hasAcceptedRadioPrivacyNotice, setAcceptedRadioPrivacyNotice, buildRadioStreamIssueUrl, releaseAudio,
} from '../../../lib/radio-station';

interface TowerProperties { osmId: string; name: string | null; heightM: number | null; radioBand: string }

interface Props {
  station: RadioStationProperties | TowerProperties | null;
  onClose: () => void;
  className?: string;
}

type PlaybackState = 'idle' | 'connecting' | 'playing' | 'error';

export default function RadioStationCard({ station, onClose, className = '' }: Props) {
  const locale = useLocale();
  const [playback, setPlayback] = useState<PlaybackState>('idle');
  const [needsConsent, setNeedsConsent] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const connectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Detach the ref *before* releasing: every pending callback (the 1.5 s
  // retry, the 9 s connect timeout, late 'playing'/'error' events and the
  // play() rejection that load() itself triggers) checks
  // `audioRef.current === audio`, so none of them can restart playback or
  // flip the state once the stream is stopped.
  function releaseCurrentAudio() {
    const audio = audioRef.current;
    audioRef.current = null;
    if (connectTimeoutRef.current) { clearTimeout(connectTimeoutRef.current); connectTimeoutRef.current = null; }
    releaseAudio(audio);
  }

  useEffect(() => {
    setPlayback('idle');
    setNeedsConsent(false);
    return releaseCurrentAudio;
  }, [station]);

  if (!station) return null;

  if (!isRadioStationProperties(station)) {
    const tower = station as TowerProperties;
    // `communication:radio=yes` just means the tag is set — it says nothing
    // about which band, so it's not worth a row. Only show a real value
    // (fm, am, shortwave, ...).
    const hasBand = tower.radioBand && tower.radioBand !== 'yes' && tower.radioBand !== 'no';
    return (
      <div className={`radio-card ${className}`} role="dialog" aria-label={t('radio.tower', locale)}>
        <button className="radio-card-close" onClick={onClose} aria-label={t('radio.close', locale)}>×</button>
        <div className="radio-card-title">{tower.name ?? t('radio.towerNoName', locale)}</div>
        {hasBand && <div className="radio-card-meta">{t('radio.band', locale)}: {tower.radioBand}</div>}
        {tower.heightM != null && <div className="radio-card-meta">{tower.heightM} m</div>}
      </div>
    );
  }

  function play() {
    if (!hasAcceptedRadioPrivacyNotice()) { setNeedsConsent(true); return; }
    startPlayback();
  }

  // One retry before giving up: the weekly file can drift from a stream
  // that just went down since its last radio-browser.info health check.
  function startPlayback(isRetry = false) {
    if (!isRadioStationProperties(station)) return;
    setPlayback('connecting');
    releaseCurrentAudio(); // the failed first attempt, on a retry
    const audio = new Audio(station.streamUrl);
    audioRef.current = audio;
    // The common real-world failure for internet radio is a socket that opens
    // and then sends nothing — neither the 'error' event nor the play()
    // rejection fires, so without this the UI is stuck on "Connecting…"
    // forever with no Stop button and no way to reach the report-broken link.
    connectTimeoutRef.current = setTimeout(() => {
      if (audioRef.current === audio) setPlayback('error');
    }, 9000);
    audio.addEventListener('playing', () => {
      if (audioRef.current !== audio) return;
      if (connectTimeoutRef.current) { clearTimeout(connectTimeoutRef.current); connectTimeoutRef.current = null; }
      setPlayback('playing');
    });
    const onFailure = () => {
      if (audioRef.current !== audio) return; // stopped, closed or superseded
      if (isRetry) { setPlayback('error'); return; }
      setTimeout(() => { if (audioRef.current === audio) startPlayback(true); }, 1500);
    };
    audio.addEventListener('error', onFailure);
    audio.play().catch(onFailure);
  }

  function stop() {
    releaseCurrentAudio();
    setPlayback('idle');
  }

  return (
    <div className={`radio-card ${className}`} role="dialog" aria-label={station.name}>
      <button className="radio-card-close" onClick={onClose} aria-label={t('radio.close', locale)}>×</button>
      <div className="radio-card-title">{station.name}</div>
      <div className="radio-card-meta">
        {station.country ?? '—'}{station.language ? ` · ${station.language}` : ''}
        {station.freqLabel ? ` · ${station.freqLabel} (${t('radio.frequencyApprox', locale)})` : ''}
      </div>

      {needsConsent && (
        <div className="radio-card-consent">
          <div className="radio-card-consent-title">{t('radio.privacyTitle', locale)}</div>
          <p>{t('radio.privacyBody', locale)}</p>
          <button onClick={() => { setAcceptedRadioPrivacyNotice(); setNeedsConsent(false); startPlayback(); }}>
            {t('radio.privacyAccept', locale)}
          </button>
        </div>
      )}

      {!needsConsent && playback !== 'playing' && (
        <button className="radio-card-play" onClick={play} disabled={playback === 'connecting'}>
          {playback === 'connecting' ? t('radio.connecting', locale) : t('radio.listen', locale)}
        </button>
      )}
      {playback === 'playing' && (
        <button className="radio-card-play radio-card-play-active" onClick={stop}>
          {t('radio.playing', locale)} · {t('radio.stop', locale)}
        </button>
      )}
      {playback === 'error' && (
        <div className="radio-card-error">
          {t('radio.error', locale)}
          {' — '}
          <a href={buildRadioStreamIssueUrl(station)} target="_blank" rel="noopener noreferrer">
            {t('radio.reportBroken', locale)}
          </a>
        </div>
      )}
    </div>
  );
}
