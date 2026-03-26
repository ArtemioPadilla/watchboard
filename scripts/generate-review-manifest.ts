import fs from 'fs';
import path from 'path';

const trackersDir = 'trackers';
const slugs = (process.env.ELIGIBLE_SLUGS || '').split(/\s+/).filter(Boolean);

if (slugs.length === 0) {
  console.log('No eligible slugs provided, skipping manifest generation');
  process.exit(0);
}

const today = new Date();
const todayStr = today.toISOString().slice(0, 10);

for (const slug of slugs) {
  const dataDir = path.join(trackersDir, slug, 'data');
  if (!fs.existsSync(dataDir)) {
    console.log(`Skipping ${slug}: no data directory`);
    continue;
  }

  // Determine review window
  const logPath = path.join(dataDir, 'update-log.json');
  let daysSinceLastRun = 7; // default

  if (fs.existsSync(logPath)) {
    try {
      const log = JSON.parse(fs.readFileSync(logPath, 'utf8'));
      if (log.lastRun) {
        const lastRun = new Date(log.lastRun);
        daysSinceLastRun = Math.floor((today.getTime() - lastRun.getTime()) / 86400000);
      }
    } catch {
      // If log is unreadable, use default
    }
  }

  // Window: min(max(daysSinceLastRun, 7), 30)
  const windowSize = Math.min(Math.max(daysSinceLastRun, 7), 30);

  const windowStart = new Date(today);
  windowStart.setDate(windowStart.getDate() - windowSize);
  const windowStartStr = windowStart.toISOString().slice(0, 10);

  // Scan events directory
  const eventsDir = path.join(dataDir, 'events');
  const existingEvents = new Map<string, number>();

  if (fs.existsSync(eventsDir)) {
    for (const file of fs.readdirSync(eventsDir)) {
      if (!file.endsWith('.json')) continue;
      const date = file.replace('.json', '');
      try {
        const events = JSON.parse(fs.readFileSync(path.join(eventsDir, file), 'utf8'));
        existingEvents.set(date, Array.isArray(events) ? events.length : 0);
      } catch {
        existingEvents.set(date, 0);
      }
    }
  }

  // Build day-by-day inventory for the window
  const days: Array<{ date: string; eventCount: number }> = [];
  const gapDays: string[] = [];
  let totalEvents = 0;

  for (let d = new Date(windowStart); d <= today; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().slice(0, 10);
    const count = existingEvents.get(dateStr) || 0;
    days.push({ date: dateStr, eventCount: count });
    totalEvents += count;
    if (count === 0) {
      gapDays.push(dateStr);
    }
  }

  const manifest = {
    tracker: slug,
    windowStart: windowStartStr,
    windowEnd: todayStr,
    days,
    totalEvents,
    gapDays,
  };

  const manifestPath = path.join(dataDir, 'review-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`Generated manifest for ${slug}: ${days.length} days, ${gapDays.length} gaps, ${totalEvents} total events`);
}
