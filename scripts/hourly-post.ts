#!/usr/bin/env tsx
/**
 * hourly-post.ts
 *
 * Direct X/Twitter posting for breaking news detected by the hourly pipeline.
 * Unlike the nightly social queue system (which queues tweets for later posting),
 * this posts immediately and writes to the same budget.json / history.json files.
 *
 * Exports:
 *   postBreaking(tracker, tweetText, eventIds, sections) → ManifestUpdate
 *   postNewTracker(slug, name, summary, seeded)          → ManifestUpdate
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { TwitterApi } from 'twitter-api-v2';
import {
  loadManifest,
  saveManifest,
  PATHS,
  type ManifestUpdate,
} from './hourly-types.js';
import type { BudgetData, HistoryEntry } from './social-types.js';

// ── Constants ────────────────────────────────────────────────────────────────

const COST_PER_TWEET = 0.01;
const BASE_URL = 'https://watchboard.dev/watchboard';
const MAX_TWEET_LENGTH = 280;

// ── Twitter client ────────────────────────────────────────────────────────────

function getTwitterClient(): TwitterApi | null {
  const appKey = process.env.X_API_KEY;
  const appSecret = process.env.X_API_SECRET;
  const accessToken = process.env.X_ACCESS_TOKEN;
  const accessSecret = process.env.X_ACCESS_TOKEN_SECRET;
  if (!appKey || !appSecret || !accessToken || !accessSecret) {
    console.log('[hourly-post] Missing X API credentials — skipping post');
    return null;
  }
  return new TwitterApi({ appKey, appSecret, accessToken, accessSecret });
}

// ── Core tweet posting ────────────────────────────────────────────────────────

async function postTweet(client: TwitterApi, text: string): Promise<string | null> {
  try {
    const result = await client.v2.tweet({ text });
    return result.data.id;
  } catch (err) {
    console.error('[hourly-post] Tweet failed:', err);
    return null;
  }
}

// ── Budget helpers ────────────────────────────────────────────────────────────

function updateBudget(cost: number): void {
  if (!existsSync(PATHS.socialBudget)) {
    console.warn('[hourly-post] budget.json not found — skipping budget update');
    return;
  }
  const budget: BudgetData = JSON.parse(readFileSync(PATHS.socialBudget, 'utf8'));

  // Month rollover
  const currentMonth = new Date().toISOString().slice(0, 7);
  if (budget.currentMonth !== currentMonth) {
    budget.currentMonth = currentMonth;
    budget.spent = 0;
    budget.tweetsPosted = 0;
    budget.remaining = budget.monthlyTarget;
  }

  budget.spent = Math.round((budget.spent + cost) * 100) / 100;
  budget.remaining = Math.round((budget.monthlyTarget - budget.spent) * 100) / 100;
  budget.tweetsPosted++;

  writeFileSync(PATHS.socialBudget, JSON.stringify(budget, null, 2), 'utf8');
}

// ── History helpers ───────────────────────────────────────────────────────────

function appendHistory(entry: HistoryEntry): void {
  mkdirSync(dirname(PATHS.socialBudget), { recursive: true });

  let history: HistoryEntry[] = [];
  if (existsSync(PATHS.socialHistory)) {
    try {
      history = JSON.parse(readFileSync(PATHS.socialHistory, 'utf8'));
    } catch {
      history = [];
    }
  }
  history.push(entry);
  writeFileSync(PATHS.socialHistory, JSON.stringify(history, null, 2), 'utf8');
}

// ── Public exports ────────────────────────────────────────────────────────────

/**
 * Post a breaking news tweet for an updated tracker.
 * Updates budget + history, appends to the hourly manifest.
 */
export async function postBreaking(
  tracker: string,
  tweetText: string,
  eventIds: string[],
  sections: string[],
): Promise<ManifestUpdate> {
  const timestamp = new Date().toISOString();
  let tweetId: string | null = null;

  const client = getTwitterClient();
  if (client) {
    tweetId = await postTweet(client, tweetText);
    if (tweetId) {
      console.log(`[hourly-post] Breaking tweet posted for ${tracker}: ${tweetId}`);
      updateBudget(COST_PER_TWEET);
      appendHistory({
        tweetId,
        date: timestamp.slice(0, 10),
        tracker,
        type: 'breaking',
        voice: 'journalist',
        lang: 'en',
        text: tweetText,
        cost: COST_PER_TWEET,
        utmClicks: 0,
        publishedAt: timestamp,
      });
    }
  }

  const update: ManifestUpdate = {
    tracker,
    action: 'update',
    eventIds,
    sections,
    tweetId,
    timestamp,
  };

  const manifest = loadManifest();
  manifest.updates.push(update);
  saveManifest(manifest);

  return update;
}

/**
 * Post a new tracker announcement tweet.
 * Updates budget + history, appends to the hourly manifest.
 */
export async function postNewTracker(
  slug: string,
  name: string,
  summary: string,
  seeded: boolean,
): Promise<ManifestUpdate> {
  const timestamp = new Date().toISOString();
  let tweetId: string | null = null;

  const link = `${BASE_URL}/${slug}/?utm_source=x&utm_medium=breaking_hourly&utm_campaign=${timestamp.slice(0, 10)}`;
  const rawText = `BREAKING: New tracker launched — ${name}. ${summary}\n\nFollow live: ${link}\n\n#Watchboard`;
  const tweetText = rawText.length > MAX_TWEET_LENGTH
    ? rawText.slice(0, MAX_TWEET_LENGTH - 1) + '…'
    : rawText;

  const client = getTwitterClient();
  if (client) {
    tweetId = await postTweet(client, tweetText);
    if (tweetId) {
      console.log(`[hourly-post] New tracker tweet posted for ${slug}: ${tweetId}`);
      updateBudget(COST_PER_TWEET);
      appendHistory({
        tweetId,
        date: timestamp.slice(0, 10),
        tracker: slug,
        type: 'breaking',
        voice: 'journalist',
        lang: 'en',
        text: tweetText,
        cost: COST_PER_TWEET,
        utmClicks: 0,
        publishedAt: timestamp,
      });
    }
  }

  const update: ManifestUpdate = {
    tracker: slug,
    action: 'new_tracker',
    eventIds: [],
    sections: [],
    tweetId,
    timestamp,
    seeded,
  };

  const manifest = loadManifest();
  manifest.updates.push(update);
  saveManifest(manifest);

  return update;
}
