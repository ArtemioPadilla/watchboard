import fs from 'fs';
import path from 'path';

const PROFILES: Record<string, number[]> = {
  crisis:     [1, 1, 1, 7, 7, 30, 60, 90],
  steady:     [3, 3, 7, 14, 30, 60],
  historical: [30, 60, 90, 180],
};

const trackersDir = 'trackers';
let migrated = 0;
let skipped = 0;

for (const slug of fs.readdirSync(trackersDir)) {
  const configPath = path.join(trackersDir, slug, 'tracker.json');
  if (!fs.existsSync(configPath)) continue;

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (!config.ai) {
    console.log(`SKIP ${slug}: no ai config`);
    skipped++;
    continue;
  }

  if (config.ai.updatePolicy) {
    console.log(`SKIP ${slug}: already has updatePolicy`);
    skipped++;
    continue;
  }

  const interval = config.ai.updateIntervalDays ?? 1;
  let profile: string;
  if (interval <= 2) {
    profile = 'crisis';
  } else if (interval <= 7) {
    profile = 'steady';
  } else {
    profile = 'historical';
  }

  config.ai.updatePolicy = {
    escalation: PROFILES[profile],
    quietThreshold: 0,
  };

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
  console.log(`MIGRATED ${slug}: interval=${interval} → profile=${profile}`);
  migrated++;
}

console.log(`\nDone: ${migrated} migrated, ${skipped} skipped`);
