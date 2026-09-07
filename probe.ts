import { geoparse } from './src/lib/gazetteer.js';
import { loadGazetteerFile } from './scripts/lib/gazetteer-node.js';

const gz = loadGazetteerFile()!;
console.log('total entries', gz.entries.length);

// look at Gaza entries
const gazaEntries = gz.entries.filter(e => e.normalized === 'gaza');
console.log('gaza entries:', JSON.stringify(gazaEntries, null, 2));

const r = geoparse('Strikes hit Gaza overnight', 'gaza-war', gz);
console.log('result:', JSON.stringify(r, null, 2));
