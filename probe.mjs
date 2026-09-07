import { geoparse } from './src/lib/gazetteer.ts';
import { readFileSync } from 'node:fs';
const gz = JSON.parse(readFileSync('./scripts/state/gazetteer.json','utf8'));
console.log('Mexico announces new policy ->', JSON.stringify(geoparse('Mexico announces new policy', null, gz)));
console.log('Earthquake shakes Mexico City today ->', JSON.stringify(geoparse('Earthquake shakes Mexico City today', null, gz)));
const mexEntries = gz.entries.filter(e => e.normalized === 'mexico');
console.log('mexico entries:', JSON.stringify(mexEntries));
