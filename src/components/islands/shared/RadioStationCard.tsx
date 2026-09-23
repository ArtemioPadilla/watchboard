import { useEffect, useRef, useState } from 'react';
import { t } from '../../../i18n/translations';
import { useLocale } from '../../../i18n/useLocale';
import {
  type RadioStationProperties, type StreamPlaybackState, isRadioStationProperties,
  hasAcceptedRadioPrivacyNotice, setAcceptedRadioPrivacyNotice, buildRadioStreamIssueUrl, createStreamPlayer,
} from '../../../lib/radio-station';

interface TowerProperties { osmId: string; name: string | null; heightM: number | null; radioBand: string }

interface Props {
  station: RadioStationProperties | TowerProperties | null;
  onClose: () => void;
  className?: string;
}

export default function RadioStationCard({ station, onClose, className = '' }: Props) {
  const locale = useLocale();
  const [playback, setPlayback] = useState<StreamPlaybackState>('idle');
  const [needsConsent, setNeedsConsent] = useState(false);
  // Stream lifecycle (connect timeout, one retry, releasing the socket on
  // stop/close/give-up) lives in createStreamPlayer so it is unit-tested.
  const playerRef = useRef<ReturnType<typeof createStreamPlayer> | null>(null);
  if (!playerRef.current) {
    playerRef.current = createStreamPlayer({ createAudio: (url) => new Audio(url), onState: setPlayback });
  }

  useEffect(() => {
    setPlayback('idle');
    setNeedsConsent(false);
    return () => playerRef.current?.release();
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

  function startPlayback() {
    if (!isRadioStationProperties(station)) return;
    playerRef.current?.start(station.streamUrl);
  }

  function stop() {
    playerRef.current?.stop();
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
