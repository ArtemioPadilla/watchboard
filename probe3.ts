import { loadGazetteerFile } from './scripts/lib/gazetteer-node.js';
import { geoparse } from './src/lib/gazetteer.js';

const gz = loadGazetteerFile()!;
const countryNames = new Set(gz.entries.filter(e => e.kind === 'country').map(e => e.normalized));
// find point entries whose normalized name equals a country's normalized name
const collisions = gz.entries.filter(e => e.kind === 'point' && countryNames.has(e.normalized));
console.log('point-vs-country name collisions:', collisions.length);
for (const c of collisions.slice(0, 20)) {
  console.log(c.name, '|', c.trackers, '|', c.lat, c.lon);
}
