const fs = require('fs');
const path = require('path');
const trackers = ['world-cup-2026','ice-history','global-recession-risk','myanmar-civil-war','afghanistan-pakistan-war'];
let total = 0, withMedia = 0;
for (const t of trackers) {
  const dir = path.join(__dirname, '..', 'trackers', t, 'data', 'events');
  let tTotal = 0, tMedia = 0;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    const raw = fs.readFileSync(path.join(dir, f), 'utf8');
    if (!raw.trim()) continue;
    const data = JSON.parse(raw);
    const arr = Array.isArray(data) ? data : [data];
    for (const e of arr) {
      tTotal++;
      if (e.media && e.media.length > 0) {
        tMedia++;
      }
    }
  }
  console.log(t + ': ' + tMedia + '/' + tTotal + ' events with media');
  total += tTotal; withMedia += tMedia;
}
console.log('\nTOTAL: ' + withMedia + '/' + total + ' events enriched with media');
