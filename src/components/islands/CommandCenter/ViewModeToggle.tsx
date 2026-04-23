import { memo } from 'react';

export type ViewMode = 'operations' | 'geographic' | 'domain';

interface Props {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
}

const MODES: { id: ViewMode; label: string }[] = [
  { id: 'operations', label: 'OPS' },
  { id: 'geographic', label: 'GEO' },
  { id: 'domain', label: 'DOMAIN' },
];

export default memo(function ViewModeToggle({ mode, onChange }: Props) {
  return (
    <div className="cc-feed-tabs" role="tablist" aria-label="Tracker list view">
      {MODES.map(m => (
        <button
          key={m.id}
          type="button"
          role="tab"
          aria-selected={mode === m.id}
          className={`cc-feed-tab${mode === m.id ? ' is-active' : ''}`}
          onClick={() => onChange(m.id)}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
});
