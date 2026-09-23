import { t, type Locale, type TranslationKey } from '../../../i18n/translations';
import { hasInterests, type Interests, type interestOptions } from '../../../lib/interests';

interface InterestChipsProps {
  interests: Interests;
  options: ReturnType<typeof interestOptions>;
  locale: Locale;
  onToggle: (kind: 'domains' | 'regions', value: string) => void;
  onClear?: () => void;
  compact?: boolean;
}

/**
 * Topic and region chips for declared interests. Every click persists
 * immediately through onToggle; there is no save step. Only values some
 * tracker actually carries are offered (interestOptions filters count > 0).
 */
export default function InterestChips({ interests, options, locale, onToggle, onClear, compact }: InterestChipsProps) {
  const groups: { kind: 'domains' | 'regions'; label: TranslationKey; prefix: 'domain' | 'region'; items: { value: string; count: number }[] }[] = [
    { kind: 'domains', label: 'interests.topics', prefix: 'domain', items: options.domains },
    { kind: 'regions', label: 'interests.regions', prefix: 'region', items: options.regions },
  ];

  return (
    <div className="interest-chips">
      {!compact && <p className="interest-chips-hint">{t('interests.hint', locale)}</p>}
      {groups.map(g => g.items.length > 0 && (
        <div key={g.kind} className="interest-chips-group" role="group" aria-label={t(g.label, locale)}>
          <div className="interest-chips-label">{t(g.label, locale)}</div>
          <div className="interest-chips-row">
            {g.items.map(({ value, count }) => {
              const selected = (interests[g.kind] as string[]).includes(value);
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={selected}
                  className={'interest-chip' + (selected ? ' active' : '')}
                  onClick={() => onToggle(g.kind, value)}
                >
                  {t(`${g.prefix}.${value}` as TranslationKey, locale)}
                  <span className="interest-chip-count">{count}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {onClear && hasInterests(interests) && (
        <button type="button" className="interest-chip interest-chips-clear" onClick={onClear}>
          {t('interests.clear', locale)}
        </button>
      )}
    </div>
  );
}
