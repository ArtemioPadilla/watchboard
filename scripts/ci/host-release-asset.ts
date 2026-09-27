#!/usr/bin/env tsx
/**
 * host-release-asset.ts — give a build artefact a stable public URL.
 *
 * The Meta Graph API cannot take a file upload for Instagram Reels: it needs
 * a `video_url` its servers can fetch. Workflow artifacts are not public, so
 * daily-video.yml uploads the MP4 as an asset on one rolling GitHub release
 * (tag `daily-video`, created on first use) and passes the download URL on.
 * Old assets are pruned so the release does not grow forever.
 *
 * Prints ONLY the asset's browser_download_url on stdout; everything else
 * goes to stderr, so `URL=$(npx tsx scripts/ci/host-release-asset.ts …)` works.
 *
 * Usage:
 *   npx tsx scripts/ci/host-release-asset.ts --file video/output/x.mp4 [--tag daily-video] [--keep 14]
 * Env: GITHUB_TOKEN (contents: write), GITHUB_REPOSITORY (owner/repo)
 */
import { readFileSync, statSync } from 'node:fs';
import { basename } from 'node:path';

interface Asset { id: number; name: string; created_at: string; browser_download_url: string }
interface Release { id: number; upload_url: string; assets: Asset[] }

const API = 'https://api.github.com';

function arg(flag: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i === -1 ? fallback : process.argv[i + 1];
}

function log(line: string): void {
  process.stderr.write(`${line}\n`);
}

async function gh<T>(token: string, url: string, init: RequestInit = {}): Promise<{ status: number; body: T }> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  const text = await res.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok && res.status !== 404) {
    throw new Error(`GitHub ${init.method ?? 'GET'} ${url} → HTTP ${res.status}: ${typeof body === 'string' ? body.slice(0, 200) : JSON.stringify(body).slice(0, 200)}`);
  }
  return { status: res.status, body: body as T };
}

async function getOrCreateRelease(token: string, repo: string, tag: string): Promise<Release> {
  const existing = await gh<Release>(token, `${API}/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`);
  if (existing.status === 200) return existing.body;
  log(`[host] release ${tag} not found — creating`);
  const created = await gh<Release>(token, `${API}/repos/${repo}/releases`, {
    method: 'POST',
    body: JSON.stringify({
      tag_name: tag,
      target_commitish: 'main',
      name: 'Daily video assets',
      body: 'Rolling home for the daily brief MP4s so Meta (Instagram Reels / Facebook) can fetch them by URL. Assets older than a couple of weeks are pruned automatically. Not a software release.',
      draft: false,
      prerelease: true,
      make_latest: 'false',
    }),
  });
  return created.body;
}

export function pickAssetsToPrune(assets: readonly Asset[], keep: number, protectName: string): Asset[] {
  return [...assets]
    .filter((a) => a.name !== protectName)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(Math.max(0, keep - 1));
}

async function main(): Promise<void> {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  const file = arg('--file');
  const tag = arg('--tag', 'daily-video')!;
  const keep = Number(arg('--keep', '14'));
  if (!token || !repo) throw new Error('GITHUB_TOKEN and GITHUB_REPOSITORY are required');
  if (!file) throw new Error('--file <path> is required');
  const size = statSync(file).size;
  const name = basename(file);

  const release = await getOrCreateRelease(token, repo, tag);

  // Replace an asset with the same name (a re-run of the same day).
  const dup = release.assets.find((a) => a.name === name);
  if (dup) {
    log(`[host] asset ${name} already exists (#${dup.id}) — replacing`);
    await gh(token, `${API}/repos/${repo}/releases/assets/${dup.id}`, { method: 'DELETE' });
  }

  const uploadUrl = `${release.upload_url.replace(/\{\?name,label\}$/, '')}?name=${encodeURIComponent(name)}`;
  log(`[host] uploading ${name} (${(size / 1024 / 1024).toFixed(1)} MB)`);
  const uploaded = await gh<Asset>(token, uploadUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(size) },
    body: readFileSync(file),
  });
  if (!uploaded.body?.browser_download_url) throw new Error('upload returned no browser_download_url');

  for (const old of pickAssetsToPrune(release.assets.filter((a) => a.id !== dup?.id), keep, name)) {
    log(`[host] pruning ${old.name} (${old.created_at})`);
    await gh(token, `${API}/repos/${repo}/releases/assets/${old.id}`, { method: 'DELETE' }).catch((e) => log(`[host] prune failed: ${e}`));
  }

  // Verify the artefact, not the status code: the URL must answer.
  const head = await fetch(uploaded.body.browser_download_url, { method: 'HEAD', redirect: 'follow' });
  if (!head.ok) throw new Error(`uploaded asset not reachable: HTTP ${head.status}`);
  log(`[host] ok → ${uploaded.body.browser_download_url}`);
  process.stdout.write(`${uploaded.body.browser_download_url}\n`);
}

const invokedDirectly = process.argv[1]?.endsWith('host-release-asset.ts');
if (invokedDirectly) {
  main().catch((e: unknown) => {
    log(`::error::host-release-asset: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  });
}
