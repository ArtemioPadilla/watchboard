import { geoparse } from './src/lib/gazetteer.js';
import { loadGazetteerFile } from './scripts/lib/gazetteer-node.js';

const gz = loadGazetteerFile()!;
console.log('total entries', gz.entries.length);

const gazaEntries = gz.entries.filter(e => e.normalized === 'gaza');
console.log('entries named exactly "gaza":', JSON.stringify(gazaEntries, null, 2));

const r = geoparse('Strikes hit Gaza overnight', 'gaza-war', gz);
console.log('geoparse result:', JSON.stringify(r));

const r2 = geoparse('Strikes hit Gaza City overnight', 'gaza-war', gz);
console.log('geoparse Gaza City result:', JSON.stringify(r2));

const r3 = geoparse('Strikes hit Gaza overnight', null, gz);
console.log('geoparse no-tracker result:', JSON.stringify(r3));

const r4 = geoparse('Strikes hit Gaza overnight', 'israel', gz);
console.log('geoparse israel-tracker result:', JSON.stringify(r4));

const r5 = geoparse('Strikes hit Gaza overnight', 'peace-processes', gz);
console.log('geoparse peace-processes-tracker result:', JSON.stringify(r5));

const r6 = geoparse('Strikes hit Gaza overnight', 'world-war-1', gz);
console.log('geoparse world-war-1-tracker result:', JSON.stringify(r6));

// Does gaza-war's own country entry (Palestine) match "Gaza" at all?
const psEntry = gz.entries.find(e => e.kind === 'country' && e.trackers.includes('gaza-war'));
console.log('gaza-war country entry:', JSON.stringify(psEntry));
