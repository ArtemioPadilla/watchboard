import { loadGazetteerFile } from './scripts/lib/gazetteer-node.js';
import { geoparse } from './src/lib/gazetteer.js';

const gz = loadGazetteerFile()!;

const r1 = geoparse('Tensions rise in Lebanon amid new escalation', 'lebanon', gz);
console.log('lebanon tracker, text "Lebanon":', JSON.stringify(r1));

const r2 = geoparse('Saudi Arabia announces new economic plan', 'saudi-arabia', gz);
console.log('saudi-arabia tracker, text "Saudi Arabia":', JSON.stringify(r2));

// what are Lebanon's own country entry coords?
const lebCountry = gz.entries.find(e => e.kind === 'country' && e.normalized === 'lebanon');
console.log('Lebanon country entry:', lebCountry);
const lebPoint = gz.entries.find(e => e.kind === 'point' && e.normalized === 'lebanon');
console.log('Lebanon point entry (foreign):', lebPoint);
