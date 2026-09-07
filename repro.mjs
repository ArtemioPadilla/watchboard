import { geoparse } from './src/lib/gazetteer.ts';
import { readFileSync } from 'node:fs';
const gz = JSON.parse(readFileSync('./scripts/state/gazetteer.json', 'utf8'));

const cases = [
  ["China's tech sector booms", "china-tech-revolution"],
  ["India border clash", "india-pakistan-conflict"],
  ["Cuba announces new policy", "cuba-crises"],
  ["Mali junta statement", "sahel-insurgency"],
  ["Chile election update", "chile"],
  ["Georgia parliament vote", "georgia-crisis"],
];
for (const [text, tracker] of cases) {
  const r = geoparse(text, tracker, gz);
  console.log(tracker, '->', JSON.stringify(r));
}

// Show all China-named entries in the gazetteer
console.log('--- china entries ---');
for (const e of gz.entries) {
  if (e.normalized === 'china' || e.aliases.map(a=>a.toLowerCase()).includes('china')) {
    console.log(JSON.stringify(e));
  }
}
console.log('--- georgia entries ---');
for (const e of gz.entries) {
  if (e.normalized === 'georgia' || e.aliases.map(a=>a.toLowerCase()).includes('georgia')) {
    console.log(JSON.stringify(e));
  }
}
