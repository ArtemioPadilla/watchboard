import fs from 'fs';
import path from 'path';

// Map of slug → [state, city] for trackers with sub-national specificity
const SUB_NATIONAL: Record<string, { state?: string; city?: string }> = {
  'culiacanazo': { state: 'Sinaloa', city: 'Culiacán' },
  'sinaloa-fragmentation': { state: 'Sinaloa' },
  'september-11': { state: 'New York', city: 'New York City' },
  'tlatelolco-1968': { state: 'CDMX', city: 'Mexico City' },
  'ayotzinapa': { state: 'Guerrero', city: 'Iguala' },
  'mencho-cjng': { state: 'Jalisco' },
  'fukushima-disaster': { state: 'Fukushima' },
  'chernobyl-disaster': { state: 'Kyiv Oblast', city: 'Pripyat' },
};

const trackersDir = path.resolve('trackers');

for (const slug of fs.readdirSync(trackersDir)) {
  const configPath = path.join(trackersDir, slug, 'tracker.json');
  if (!fs.existsSync(configPath)) continue;

  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  if (!config.country) continue; // skip global trackers
  if (config.geoPath) continue; // already migrated

  const geoPath: string[] = [config.country];
  const sub = SUB_NATIONAL[slug];

  if (sub?.state) {
    geoPath.push(sub.state);
    config.state = sub.state;
  }
  if (sub?.city) {
    geoPath.push(sub.city);
    config.city = sub.city;
  }

  config.geoPath = geoPath;

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
  console.log(`✓ ${slug}: geoPath=${JSON.stringify(geoPath)}`);
}
