import { loadGazetteerFile } from './scripts/lib/gazetteer-node.js';
import { geoparse } from './src/lib/gazetteer.js';
const gz = loadGazetteerFile()!;
const r = geoparse('United Kingdom announces new sanctions', 'united-kingdom', gz);
console.log(JSON.stringify(r));
const ukCountry = gz.entries.find(e => e.kind==='country' && e.name==='United Kingdom');
console.log('UK country entry:', JSON.stringify(ukCountry));
