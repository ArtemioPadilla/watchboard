import { useEffect, useRef, useState } from 'react';
import { t } from '../../../i18n/translations';
import { useLocale } from '../../../i18n/useLocale';
import {
  type RadioStationProperties, isRadioStationProperties,
  hasAcceptedRadioPrivacyNotice, setAcceptedRadioPrivacyNotice, buildRadioStreamIssueUrl,
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

  useEffect(() => {
    setPlayback('idle');
    setNeedsConsent(false);
    return () => { audioRef.current?.pause(); audioRef.current = null; };
  }, [station]);

  if (!station) return null;

  if (!isRadioStationProperties(station)) {
    const tower = station as TowerProperties;
    return (
      <div className={`radio-card ${className}`} role="dialog" aria-label={t('radio.tower', locale)}>
        <button className="radio-card-close" onClick={onClose} aria-label={t('radio.close', locale)}>×</button>
        <div className="radio-card-title">{tower.name ?? t('radio.towerNoName', locale)}</div>
        <div className="radio-card-meta">{t('radio.band', locale)}: {tower.radioBand || '—'}</div>
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
    const audio = new Audio(station.streamUrl);
    audioRef.current = audio;
    audio.addEventListener('playing', () => setPlayback('playing'));
    audio.addEventListener('error', () => {
      if (isRetry) { setPlayback('error'); return; }
      setTimeout(() => { if (audioRef.current === audio) startPlayback(true); }, 1500);
    });
    audio.play().catch(() => {
      if (isRetry) { setPlayback('error'); return; }
      setTimeout(() => { if (audioRef.current === audio) startPlayback(true); }, 1500);
    });
  }

  function stop() {
    audioRef.current?.pause();
    audioRef.current = null;
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
