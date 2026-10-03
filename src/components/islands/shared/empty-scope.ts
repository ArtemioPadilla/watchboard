import { t, type Locale, type TranslationKey } from '../../../i18n/translations';
import { countryListLabel } from '../../../lib/geo-layer-schema';

/** The empty-state fields a layer toggle carries (see `emptyScopeReason` / `partialEmptyScope`). */
export interface EmptyScopeFields {
  count: number;
  emptyCodes?: string[];
  partialEmptyCodes?: string[];
  emptyKey?: string;
}

/**
 * Text for a country-scoped layer toggle's "none mapped" state (spec C2), or
 * null when there is nothing to say. `short` is the visible chip ("none tagged",
 * or "none tagged: BF, NE" for owner Q8's partial hint); `full` is the
 * localized sentence used as the chip's title and the toggle's accessible
 * description. Same rule as MapLayerToggles on the 2D map.
 */
export function emptyScopeText(l: EmptyScopeFields, locale: Locale): { short: string; full: string; partial: boolean } | null {
  if (!l.emptyKey) return null;
  const empty = l.count === 0 && l.emptyCodes?.length ? { codes: l.emptyCodes, partial: false }
    : l.partialEmptyCodes?.length ? { codes: l.partialEmptyCodes, partial: true } : null;
  if (!empty) return null;
  const full = t(l.emptyKey as TranslationKey, locale).replace('{codes}', countryListLabel(empty.codes, locale));
  const short = t('layers.radioTowersNoneShort', locale) + (empty.partial ? `: ${empty.codes.join(', ')}` : '');
  return { short, full, partial: empty.partial };
}
