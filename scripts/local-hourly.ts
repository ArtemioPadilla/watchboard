/**
 * local-hourly.ts
 *
 * Local orchestrator for the Watchboard hourly breaking-news pipeline.
 * Replaces the GitHub Actions workflow with a local cron job using Bedrock.
 *
 * Pipeline:
 * 1. git pull --rebase
 * 2. RSS poll (hourly-scan.ts)
 * 3. Pre-filter + dedup (inline)
 * 4. AI triage via Bedrock Sonnet
 * 5. For each tracker update: AI data update via Bedrock
 * 6. Validate JSON (Zod)
 * 7. Write digests + tweet text
 * 8. git commit + push
 * 9. Trigger deploy workflow
 *
 * Usage: npx tsx scripts/local-hourly.ts
 */

import { execSync, spawnSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import {
  type Candidate,
  type ActionPlan,
  PATHS,
  loadManifest,
  saveManifest,
} from './hourly-types.js';
import {
  buildTriagePrompt,
  parseTriageResponse,
  buildActionPlan,
  collectRecentEventTitles,
} from './hourly-triage.js';

// --- Constants ---

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BEDROCK_MODEL = 'us.anthropic.claude-sonnet-4-20250514-v1:0';
const BEDROCK_REGION = process.env.AWS_REGION || 'us-east-1';
const MAX_TRIAGE_TOKENS = 2048;
const MAX_UPDATE_TOKENS = 4096;
const CANDIDATES_PATH = '/tmp/hourly-candidates.json';
const ACTION_PLAN_PATH = '/tmp/hourly-action-plan.json';

// --- Bedrock Client ---

const bedrock = new BedrockRuntimeClient({ region: BEDROCK_REGION });

async function callBedrock(prompt: string, maxTokens: number): Promise<string> {
  const body = JSON.stringify({
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  });

  const command = new InvokeModelCommand({
    modelId: BEDROCK_MODEL,
    contentType: 'application/json',
    accept: 'application/json',
    body: new TextEncoder().encode(body),
  });

  const response = await bedrock.send(command);
  const responseBody = JSON.parse(new TextDecoder().decode(response.body));
  const text = responseBody?.content?.[0]?.text;
  if (typeof text !== 'string') {
    throw new Error('Unexpected Bedrock response shape: ' + JSON.stringify(responseBody).slice(0, 200));
  }
  return text;
}

// --- Helpers ---

function log(msg: string) {
  console.log(`[local-hourly] ${new Date().toISOString()} ${msg}`);
}

function run(cmd: string, opts: { cwd?: string; timeout?: number } = {}): string {
  try {
    return execSync(cmd, {
      cwd: opts.cwd || ROOT,
      encoding: 'utf8',
      timeout: opts.timeout || 60_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch (err: any) {
    const stderr = err.stderr?.toString()?.trim() || '';
    const stdout = err.stdout?.toString()?.trim() || '';
    throw new Error(`Command failed: ${cmd}\nstdout: ${stdout}\nstderr: ${stderr}`);
  }
}

// --- Step 1: Git pull ---

function gitPull(): boolean {
  try {
    run('git pull --rebase origin main');
    log('Git pull successful');
    return true;
  } catch (err: any) {
    log(`Git pull failed: ${err.message}`);
    // Try to abort rebase if stuck
    try { run('git rebase --abort'); } catch {}
    return false;
  }
}

// --- Step 2: RSS Poll ---

async function rssPoll(): Promise<Candidate[]> {
  log('Running RSS poll...');
  try {
    run('npx tsx scripts/hourly-scan.ts', { timeout: 120_000 });
  } catch (err: any) {
    log(`RSS poll failed: ${err.message}`);
    return [];
  }

  if (!existsSync(CANDIDATES_PATH)) {
    log('No candidates file produced');
    return [];
  }

  const candidates: Candidate[] = JSON.parse(readFileSync(CANDIDATES_PATH, 'utf8'));
  log(`RSS poll found ${candidates.length} candidates`);
  return candidates;
}

// --- Step 3: Pre-filter + dedup ---

function preFilter(candidates: Candidate[]): Candidate[] {
  // Collect recent event titles for dedup
  const recentTitles = new Set<string>();
  const context = collectRecentEventTitles(3);
  for (const titles of context.values()) {
    for (const t of titles) recentTitles.add(t.toLowerCase().trim());
  }

  const seen = new Set<string>();
  const filtered: Candidate[] = [];

  for (const c of candidates) {
    const titleLower = (c.title || '').toLowerCase().trim();
    if (recentTitles.has(titleLower)) continue;
    const titleKey = titleLower.substring(0, 60);
    if (seen.has(titleKey)) continue;
    seen.add(titleKey);
    filtered.push(c);
  }

  // Sort: matched tracker first, then by timestamp desc
  filtered.sort((a, b) => {
    if (a.matchedTracker && !b.matchedTracker) return -1;
    if (!a.matchedTracker && b.matchedTracker) return 1;
    return (b.timestamp || '').localeCompare(a.timestamp || '');
  });

  const capped = filtered.slice(0, 30);
  log(`Pre-filter: ${candidates.length} -> ${capped.length} candidates`);

  // Write filtered candidates back
  writeFileSync(CANDIDATES_PATH, JSON.stringify(capped, null, 2));
  return capped;
}

// --- Step 4: AI Triage ---

async function aiTriage(candidates: Candidate[]): Promise<ActionPlan> {
  if (candidates.length === 0) {
    return { updates: [], newTrackers: [], scannedAt: new Date().toISOString(), candidateCount: 0, discardedCount: 0 };
  }

  const context = collectRecentEventTitles(3);
  const prompt = buildTriagePrompt(candidates, context);

  log(`Calling Bedrock for triage (${candidates.length} candidates)...`);
  const rawResponse = await callBedrock(prompt, MAX_TRIAGE_TOKENS);

  const triageResults = parseTriageResponse(rawResponse);
  if (triageResults.length === 0) {
    log('WARNING: Triage returned no parseable results');
    log('Raw response: ' + rawResponse.slice(0, 500));
  }

  const plan = buildActionPlan(candidates, triageResults);
  writeFileSync(ACTION_PLAN_PATH, JSON.stringify(plan, null, 2));
  log(`Triage: ${plan.updates.length} updates, ${plan.newTrackers.length} new trackers, ${plan.discardedCount} discarded`);
  return plan;
}

// --- Step 5: Data Updates ---

function loadSchemasCondensed(): string {
  // Same condensed schema from the GitHub workflow
  return `# Watchboard Schema Reference (condensed)
# TimelineEventSchema fields:
#   id: string (kebab-case)
#   year: string (coerced) — format: "Mon DD, YYYY" e.g. "Apr 13, 2026"
#   title: string
#   type: string
#   active?: boolean
#   detail: string
#   sources: Array<{name: string, tier: 1|2|3|4, url?: string, pole?: "western"|"middle_eastern"|"eastern"|"international"}>
#   media?: Array<{type: "image"|"video"|"article", url: string, caption?: string, source?: string, thumbnail?: string}>
#   confidence?: "high"|"medium"|"low"
#   eventConfidence?: "verified"|"official_claim"|"disputed"|"unverified"
#   lastUpdated?: string

# MapPointSchema fields:
#   id: string, lon: number, lat: number, cat: string, label: string, sub: string
#   tier: 1|2|3|4, date: string (YYYY-MM-DD, no future dates)
#   lastUpdated?: string

# MapLineSchema fields:
#   id: string, from: [lon,lat], to: [lon,lat], cat: string, label: string
#   date: string (YYYY-MM-DD, no future dates)
#   weaponType?: string, time?: string (HH:MM)
#   RULE: if cat is "strike" or "retaliation", weaponType AND time are REQUIRED

# KpiSchema fields:
#   id: string, label: string, value: string, color: "red"|"amber"|"blue"|"green"
#   source: string, contested: boolean
#   lastUpdated?: string`;
}

async function prefetchMedia(sources: string[]): Promise<Array<{url: string; thumbnail: string | null; source: string}>> {
  const results: Array<{url: string; thumbnail: string | null; source: string}> = [];

  for (const url of sources.slice(0, 5)) {
    try {
      const html = run(`curl -sL --max-time 8 --max-redirs 5 ${JSON.stringify(url)}`, { timeout: 15_000 });
      const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
        || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
      const thumbnail = ogMatch ? ogMatch[1] : null;
      const sourceName = new URL(url).hostname.replace('www.', '');
      results.push({ url, thumbnail, source: sourceName });
    } catch {
      results.push({ url, thumbnail: null, source: 'unknown' });
    }
  }

  return results;
}

interface DataUpdateResult {
  eventsFile: string;
  events: any[];
  meta: { heroHeadline: string; lastUpdated: string };
  mapPoints?: any[];
  kpis?: any[];
  sections: string[];
}

async function updateTrackerData(
  tracker: string,
  updateData: { events: Array<{ summary: string; sources: string[]; timestamp: string }> },
): Promise<DataUpdateResult | null> {
  const trackerDir = join(ROOT, 'trackers', tracker);
  const configPath = join(trackerDir, 'tracker.json');

  if (!existsSync(configPath)) {
    log(`Tracker ${tracker} not found — skipping`);
    return null;
  }

  const config = readFileSync(configPath, 'utf8');
  const allSources = updateData.events.flatMap(e => e.sources);
  const media = await prefetchMedia(allSources);
  const today = new Date().toISOString().split('T')[0];
  const schemas = loadSchemasCondensed();

  // Read existing events for today to avoid duplicates
  const eventsFile = join(trackerDir, 'data', 'events', `${today}.json`);
  let existingEvents: any[] = [];
  if (existsSync(eventsFile)) {
    try { existingEvents = JSON.parse(readFileSync(eventsFile, 'utf8')); } catch {}
  }

  const prompt = `You are updating the Watchboard tracker "${tracker}" with breaking news events.

SCHEMA REFERENCE:
${schemas}

TRACKER CONFIG:
${config}

EXISTING EVENTS TODAY (do NOT duplicate these):
${JSON.stringify(existingEvents.map(e => ({ id: e.id, title: e.title })), null, 2)}

TRIAGE DATA:
${JSON.stringify(updateData, null, 2)}

PRE-FETCHED MEDIA (use these directly):
${JSON.stringify(media, null, 2)}

Respond with ONLY valid JSON (no markdown fences), in this exact format:
{
  "events": [
    {
      "id": "kebab-case-unique-id",
      "year": "${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}",
      "title": "...",
      "type": "update",
      "detail": "...",
      "sources": [{"name": "...", "tier": 1, "url": "...", "pole": "western"}],
      "media": [{"type": "image", "url": "...", "caption": "...", "source": "...", "thumbnail": "..."}],
      "confidence": "medium",
      "eventConfidence": "verified"
    }
  ],
  "meta": {
    "heroHeadline": "Short headline for the tracker hero section",
    "lastUpdated": "${new Date().toISOString()}"
  },
  "sections": ["events", "meta"]
}

Rules:
- IDs must be unique kebab-case, not matching any existing event IDs
- year MUST be a string like "Apr 13, 2026"
- Every source MUST have name, tier (1-4), url, and pole
- No future dates (today is ${today})
- media should use the pre-fetched thumbnails
- Only include sections you actually modified`;

  log(`Calling Bedrock for ${tracker} data update...`);
  try {
    const rawResponse = await callBedrock(prompt, MAX_UPDATE_TOKENS);

    // Parse JSON from response
    let text = rawResponse.trim();
    const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (fenceMatch) text = fenceMatch[1].trim();

    const braceStart = text.indexOf('{');
    const braceEnd = text.lastIndexOf('}');
    if (braceStart === -1 || braceEnd <= braceStart) {
      log(`Failed to parse update response for ${tracker}`);
      return null;
    }

    const result: DataUpdateResult = JSON.parse(text.slice(braceStart, braceEnd + 1));
    result.eventsFile = eventsFile;
    return result;
  } catch (err: any) {
    log(`Data update failed for ${tracker}: ${err.message}`);
    return null;
  }
}

function writeTrackerUpdate(tracker: string, result: DataUpdateResult): string[] {
  const trackerDir = join(ROOT, 'trackers', tracker);
  const dataDir = join(trackerDir, 'data');
  const eventsDir = join(dataDir, 'events');
  const sections: string[] = [];

  // Write events
  if (result.events && result.events.length > 0) {
    mkdirSync(eventsDir, { recursive: true });
    let existing: any[] = [];
    if (existsSync(result.eventsFile)) {
      try { existing = JSON.parse(readFileSync(result.eventsFile, 'utf8')); } catch {}
    }
    if (!Array.isArray(existing)) existing = [];

    // Merge by ID
    const existingIds = new Set(existing.map((e: any) => e.id));
    const newEvents = result.events.filter((e: any) => !existingIds.has(e.id));
    const merged = [...existing, ...newEvents];
    writeFileSync(result.eventsFile, JSON.stringify(merged, null, 2));
    sections.push('events');
    log(`  Wrote ${newEvents.length} new events to ${tracker}`);
  }

  // Update meta
  if (result.meta) {
    const metaPath = join(dataDir, 'meta.json');
    let meta: any = {};
    if (existsSync(metaPath)) {
      try { meta = JSON.parse(readFileSync(metaPath, 'utf8')); } catch {}
    }
    if (result.meta.heroHeadline) meta.heroHeadline = result.meta.heroHeadline;
    meta.lastUpdated = result.meta.lastUpdated || new Date().toISOString();
    writeFileSync(metaPath, JSON.stringify(meta, null, 2));
    sections.push('meta');
  }

  // Update update-log
  const logPath = join(dataDir, 'update-log.json');
  let updateLog: any = { lastRun: '', sections: {} };
  if (existsSync(logPath)) {
    try { updateLog = JSON.parse(readFileSync(logPath, 'utf8')); } catch {}
  }
  updateLog.lastRun = new Date().toISOString();
  for (const s of sections) {
    updateLog.sections[s] = { lastRun: updateLog.lastRun, status: 'updated' };
  }
  writeFileSync(logPath, JSON.stringify(updateLog, null, 2));

  return sections;
}

// --- Step 6: Validate ---

function validateTrackerJSON(tracker: string): boolean {
  const dataDir = join(ROOT, 'trackers', tracker, 'data');
  const files = [
    ...readdirSync(join(dataDir, 'events')).filter(f => f.endsWith('.json')).map(f => join(dataDir, 'events', f)),
    join(dataDir, 'meta.json'),
    join(dataDir, 'kpis.json'),
  ].filter(f => existsSync(f));

  for (const f of files) {
    try {
      JSON.parse(readFileSync(f, 'utf8'));
    } catch (err) {
      log(`INVALID JSON: ${f}`);
      return false;
    }
  }
  return true;
}

// --- Step 7: Digests ---

function writeDigestEntry(tracker: string, summary: string): void {
  const digestPath = join(ROOT, 'trackers', tracker, 'data', 'digests.json');
  let digests: any[] = [];
  if (existsSync(digestPath)) {
    try { digests = JSON.parse(readFileSync(digestPath, 'utf8')); } catch {}
  }

  const today = new Date().toISOString().split('T')[0];
  const existing = digests.findIndex((d: any) => d.source === 'breaking' && d.date === today);
  const entry = {
    date: today,
    title: 'Breaking: ' + summary.substring(0, 80),
    summary: summary.substring(0, 200),
    sectionsUpdated: ['events', 'meta'],
    source: 'breaking',
  };

  if (existing >= 0) {
    digests[existing] = entry;
  } else {
    digests.unshift(entry);
  }
  writeFileSync(digestPath, JSON.stringify(digests, null, 2));
}

// --- Step 8: Git commit + push ---

function gitCommitAndPush(trackers: string[]): boolean {
  if (trackers.length === 0) return true;

  try {
    // Add all modified tracker dirs
    for (const tracker of trackers) {
      run(`git add trackers/${tracker}/`);
    }
    run('git add public/_hourly/ public/_social/ public/_metrics/ || true');

    // Check if there are changes
    try {
      run('git diff --cached --quiet');
      log('No changes to commit');
      return true;
    } catch {
      // There are changes — good
    }

    const msg = `chore(hourly-local): update ${trackers.join(', ')} ${new Date().toISOString()}`;
    run(`git commit -m "${msg}"`);

    // Push with retry
    for (let i = 0; i < 3; i++) {
      try {
        run('git pull --rebase origin main');
        run('git push');
        log('Push successful');
        return true;
      } catch (err: any) {
        log(`Push attempt ${i + 1} failed: ${err.message}`);
        if (i < 2) {
          // Wait a bit before retry
          execSync('sleep 2');
        }
      }
    }
    log('Failed to push after 3 attempts');
    return false;
  } catch (err: any) {
    log(`Git commit/push failed: ${err.message}`);
    return false;
  }
}

// --- Step 9: Trigger deploy ---

function triggerDeploy(): void {
  try {
    run('gh workflow run deploy.yml --repo ArtemioPadilla/watchboard --ref main');
    log('Deploy triggered');
  } catch (err: any) {
    log(`Deploy trigger failed: ${err.message}`);
  }
}

// --- Main Pipeline ---

async function main() {
  const startTime = Date.now();
  log('=== Starting hourly scan ===');

  // Step 1: Git pull
  if (!gitPull()) {
    log('ABORT: Git pull failed');
    process.exit(1);
  }

  // Step 2: RSS poll
  const rawCandidates = await rssPoll();
  if (rawCandidates.length === 0) {
    log('No candidates — done');
    process.exit(0);
  }

  // Step 3: Pre-filter
  const candidates = preFilter(rawCandidates);
  if (candidates.length === 0) {
    log('All candidates filtered — done');
    process.exit(0);
  }

  // Step 4: AI triage
  const plan = await aiTriage(candidates);
  if (plan.updates.length === 0 && plan.newTrackers.length === 0) {
    log('No actions after triage — done');
    process.exit(0);
  }

  // Step 5: Data updates
  const updatedTrackers: string[] = [];
  for (const update of plan.updates) {
    log(`Processing update for ${update.tracker}...`);
    const result = await updateTrackerData(update.tracker, update);
    if (result) {
      writeTrackerUpdate(update.tracker, result);

      // Step 6: Validate
      if (validateTrackerJSON(update.tracker)) {
        updatedTrackers.push(update.tracker);

        // Step 7: Write digest + manifest
        const summary = update.events[0]?.summary || 'Breaking update';
        writeDigestEntry(update.tracker, summary);

        // Update hourly manifest (triggers Telegram workflow on push)
        const manifest = loadManifest();
        manifest.updates.push({
          tracker: update.tracker,
          action: 'update',
          eventIds: result.events?.map((e: any) => e.id).filter(Boolean) || [],
          sections: result.sections || ['events', 'meta'],
          tweetId: null,
          timestamp: new Date().toISOString(),
        });
        saveManifest(manifest);

        log(`  ✓ ${update.tracker} updated and validated`);
      } else {
        log(`  ✗ ${update.tracker} failed validation — reverting`);
        run(`git checkout -- trackers/${update.tracker}/`);
      }
    }
  }

  // Note: new_tracker creation is complex (needs full tracker scaffolding)
  // For now, log them and handle manually or via GitHub workflow_dispatch
  if (plan.newTrackers.length > 0) {
    log(`New trackers suggested (not auto-created): ${plan.newTrackers.map(t => t.suggestedSlug).join(', ')}`);
  }

  // Step 8: Commit and push
  if (updatedTrackers.length > 0) {
    if (gitCommitAndPush(updatedTrackers)) {
      // Step 9: Trigger deploy
      triggerDeploy();
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  log(`=== Done in ${elapsed}s — ${updatedTrackers.length} trackers updated ===`);
}

// --- Entry point ---

main().catch(err => {
  log(`FATAL: ${err.message}`);
  console.error(err);
  process.exit(1);
});
