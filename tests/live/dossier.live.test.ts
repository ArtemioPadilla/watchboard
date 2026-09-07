import { expect } from 'vitest';
import { liveDescribe, liveIt, LIVE_TEST_TIMEOUT_MS } from '../helpers/live';
import { reverseGeocode, countryFacts } from '../../src/lib/dossier';

liveDescribe('dossier providers (live)', () => {
  liveIt('Nominatim resolves Baghdad to IQ', async () => {
    const p = await reverseGeocode(33.31, 44.37, { geocodeCache: null });
    expect(p?.countryCode).toBe('IQ');
  }, LIVE_TEST_TIMEOUT_MS);

  liveIt('Wikidata returns facts for IQ', async () => {
    const f = await countryFacts('IQ', { factsCache: null });
    expect(f?.capital).toBeTruthy();
  }, LIVE_TEST_TIMEOUT_MS);
});
