import { loadGazetteerFile } from './scripts/lib/gazetteer-node.js';
const gz = loadGazetteerFile()!;
const gazaWarEntries = gz.entries.filter(e => e.trackers.includes('gaza-war'));
console.log('gaza-war entry count:', gazaWarEntries.length);
console.log(gazaWarEntries.filter(e => e.kind !== 'point').map(e => ({name: e.name, kind: e.kind, aliases: e.aliases})));
// any gaza-war entry whose normalized or alias is 'gaza'?
const matches = gazaWarEntries.filter(e => e.normalized === 'gaza' || e.aliases.some(a => a.toLowerCase() === 'gaza'));
console.log('gaza-war entries matching "gaza":', matches);
