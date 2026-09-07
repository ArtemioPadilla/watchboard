import { loadGazetteerFile } from './scripts/lib/gazetteer-node.js';
import { geoparse } from './src/lib/gazetteer.js';

const gz = loadGazetteerFile()!;

// For every country entry, check if its normalized name or any alias also
// exists as a point-kind entry belonging to a DIFFERENT tracker than the
// country's own tracker(s).
let collisions = 0;
for (const c of gz.entries) {
  if (c.kind !== 'country') continue;
  const names = new Set([c.normalized, ...c.aliases.map(a => a.toLowerCase())]);
  for (const name of names) {
    const pts = gz.entries.filter(e => e.kind === 'point' && e.normalized === name);
    for (const p of pts) {
      const overlapsOwner = p.trackers.some(t => c.trackers.includes(t));
      if (!overlapsOwner && c.trackers.length > 0) {
        collisions++;
        if (collisions <= 15) {
          console.log(`Collision: country="${c.name}" (owner trackers=${JSON.stringify(c.trackers)}) vs point in tracker=${JSON.stringify(p.trackers)} name="${p.name}"`);
        }
      }
    }
  }
}
console.log('total collisions (country owned by a tracker, but a foreign point shares the name):', collisions);
