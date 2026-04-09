// src/components/islands/mobile/MobileHeader.tsx

interface Props {
  operationName: string;
  trackerSlug: string;
  mapMode: '2d' | '3d';
  onToggleMapMode: () => void;
  globeEnabled?: boolean;
  isHistorical?: boolean;
}

export default function MobileHeader({
  operationName,
  trackerSlug,
  mapMode,
  onToggleMapMode,
  globeEnabled,
  isHistorical,
}: Props) {
  return (
    <header className="mtab-header">
      <div className="mtab-header-left">
        <a className="mtab-home-link" href="/" title="Watchboard Home">WB</a>
        {!isHistorical && <span className="mtab-live-dot" />}
        <span className="mtab-op-name">{operationName}</span>
      </div>
      {globeEnabled && (
        <div className="mtab-toggle" role="radiogroup" aria-label="Map mode">
          <button
            className={`mtab-toggle-btn${mapMode === '2d' ? ' active' : ''}`}
            onClick={() => mapMode !== '2d' && onToggleMapMode()}
            role="radio"
            aria-checked={mapMode === '2d'}
          >
            2D
          </button>
          <a
            className={`mtab-toggle-btn${mapMode === '3d' ? ' active' : ''}`}
            href={`/${trackerSlug}/globe/`}
            role="radio"
            aria-checked={mapMode === '3d'}
          >
            3D
          </a>
        </div>
      )}
    </header>
  );
}
