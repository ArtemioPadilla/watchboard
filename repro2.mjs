import { buildGazetteer, geoparse } from './src/lib/gazetteer.ts';

// Minimal isolated repro, no dependency on the real built gazetteer.
const TRACKERS = [
  { slug: 'china-tech-revolution', country: 'CN', map: { center: { lat: 35.9, lon: 104.2 } }, points: [] },
  { slug: 'unrelated-tracker', country: 'ZZ', map: { center: { lat: 0, lon: 0 } }, points: [{ label: 'China', lat: 40.5, lon: 105 }] },
];

const gz = buildGazetteer(TRACKERS, new Date('2026-09-07T00:00:00Z'));
const r = geoparse("China's tech sector booms", 'china-tech-revolution', gz);
console.log('result:', JSON.stringify(r));
console.log('expected place=China kind=country lat=35.9 (own tracker) per AC "resolve prefiere el del matchedTracker"');
