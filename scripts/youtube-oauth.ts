#!/usr/bin/env tsx
/**
 * youtube-oauth.ts — mint the YOUTUBE_REFRESH_TOKEN, locally, once.
 *
 * Uploading writes to a channel, so an API key cannot do it. The publisher
 * needs an OAuth refresh token, and minting one means a consent screen in a
 * browser signed in as the channel's owner. This runs the fiddly half: it
 * serves the redirect URI, catches the code and exchanges it.
 *
 * Nothing is sent anywhere but Google, and nothing is written to disk — the
 * token is printed once, for you to paste into `gh secret set`.
 *
 * Usage:
 *   npx tsx scripts/youtube-oauth.ts --client-id <id> --client-secret <secret>
 *   npx tsx scripts/youtube-oauth.ts            # reads YOUTUBE_CLIENT_ID/SECRET
 *
 * The redirect URI it serves must also be listed in the OAuth client in the
 * Google Cloud console, exactly: http://localhost:8787/callback
 */
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import {
  TOKEN_URL,
  UPLOAD_SCOPE,
  buildConsentUrl,
  codeFromCallback,
  parseTokenResponse,
} from './lib/youtube-oauth.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const clientId = arg('--client-id') ?? process.env.YOUTUBE_CLIENT_ID;
const clientSecret = arg('--client-secret') ?? process.env.YOUTUBE_CLIENT_SECRET;
const port = Number(arg('--port') ?? 8787);
const redirectUri = `http://localhost:${port}/callback`;

if (!clientId || !clientSecret) {
  console.error(
    'Need the OAuth client. Either pass them:\n' +
      '  npx tsx scripts/youtube-oauth.ts --client-id <id> --client-secret <secret>\n' +
      'or set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET in your shell.\n\n' +
      'They come from Google Cloud console → APIs & Services → Credentials →\n' +
      'Create credentials → OAuth client ID → Desktop app (or Web app with\n' +
      `${redirectUri} as an authorised redirect URI).`,
  );
  process.exit(1);
}

const state = randomBytes(16).toString('hex');
const consentUrl = buildConsentUrl({ clientId, redirectUri, state });

async function exchange(code: string): Promise<void> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId!,
      client_secret: clientSecret!,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }).toString(),
  });
  const token = parseTokenResponse(await res.json().catch(() => ({})));

  console.log('\n──────────────────────────────────────────────────────────────');
  console.log('YOUTUBE_REFRESH_TOKEN');
  console.log(token.refreshToken);
  console.log('──────────────────────────────────────────────────────────────');
  if (token.scope && !token.scope.includes(UPLOAD_SCOPE)) {
    console.warn(`\n⚠ the token's scope is "${token.scope}", which does not include ${UPLOAD_SCOPE} — uploads will be refused`);
  }
  console.log('\nSet all three, then verify them without publishing anything:');
  console.log('  gh secret set YOUTUBE_CLIENT_ID');
  console.log('  gh secret set YOUTUBE_CLIENT_SECRET');
  console.log('  gh secret set YOUTUBE_REFRESH_TOKEN');
  console.log('  gh workflow run video-destinations-check.yml');
  console.log('\nThis token is printed once and written nowhere. Copy it now.');
}

const server = createServer((req, res) => {
  if (!req.url?.startsWith('/callback')) {
    res.writeHead(404).end('not the redirect URI');
    return;
  }
  let code: string;
  try {
    code = codeFromCallback(req.url, state);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end(`${msg}\n`);
    console.error(`\n✗ ${msg}`);
    server.close();
    process.exitCode = 1;
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
    .end('Done — the refresh token is in your terminal. You can close this tab.\n');
  server.close();
  exchange(code).catch((err) => {
    console.error(`\n✗ ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  });
});

server.listen(port, () => {
  console.log(`Listening on ${redirectUri}\n`);
  console.log('Open this, signed in as the account that owns the channel:\n');
  console.log(consentUrl);
  console.log('\nWaiting for the callback…');
});
