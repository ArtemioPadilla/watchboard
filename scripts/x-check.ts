/**
 * X (Twitter) API check.
 *
 * The account was suspended in April 2026 and posting moved to Bluesky. This
 * exists to answer "can we post again?" without finding out the expensive way.
 *
 *   verify     one read-only GET /2/users/me. No writes, minimal quota.
 *   post-test  posts a single tweet, then reports its URL.
 *
 * Deliberately two modes: a suspended or rate-limited app should be discovered
 * with a read, not with a write that could re-trigger enforcement.
 */
import { TwitterApi } from 'twitter-api-v2';

const MODE = process.argv[2] ?? 'verify';

function client(): TwitterApi {
  const appKey = process.env.X_API_KEY;
  const appSecret = process.env.X_API_SECRET;
  const accessToken = process.env.X_ACCESS_TOKEN;
  const accessSecret = process.env.X_ACCESS_TOKEN_SECRET;
  const missing = [
    ['X_API_KEY', appKey], ['X_API_SECRET', appSecret],
    ['X_ACCESS_TOKEN', accessToken], ['X_ACCESS_TOKEN_SECRET', accessSecret],
  ].filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) {
    console.error(`Missing credentials: ${missing.join(', ')}`);
    process.exit(1);
  }
  return new TwitterApi({
    appKey: appKey!, appSecret: appSecret!,
    accessToken: accessToken!, accessSecret: accessSecret!,
  });
}

function describe(err: any): string {
  const code = err?.code ?? err?.data?.status;
  const detail = err?.data?.detail ?? err?.data?.title ?? err?.message;
  // 401/403 on a previously-suspended account almost always means the
  // suspension or the app's write permission, not a typo in the keys.
  const hint =
    code === 401 ? ' (credentials rejected — rotated, revoked, or app suspended)'
    : code === 403 ? ' (forbidden — app lacks write access, or account restricted)'
    : code === 429 ? ' (rate limited — do NOT retry in a loop)'
    : '';
  return `HTTP ${code ?? '?'}: ${detail ?? 'unknown'}${hint}`;
}

async function main() {
  const api = client();

  if (MODE === 'verify') {
    try {
      const me = await api.v2.me();
      console.log(`OK  authenticated as @${me.data.username} (${me.data.name}), id ${me.data.id}`);
      console.log('read_ok=true');
    } catch (err) {
      console.error(`FAIL  read check: ${describe(err)}`);
      console.log('read_ok=false');
      process.exit(1);
    }
    return;
  }

  if (MODE === 'post-test') {
    const text = process.env.X_TEST_TEXT;
    if (!text) { console.error('X_TEST_TEXT is required for post-test'); process.exit(1); }
    // Verify first: never spend a write to discover the account is suspended.
    let username = 'unknown';
    try {
      const me = await api.v2.me();
      username = me.data.username;
      console.log(`Authenticated as @${username}`);
    } catch (err) {
      console.error(`FAIL  cannot authenticate, not attempting a post: ${describe(err)}`);
      process.exit(1);
    }
    try {
      const res = await api.v2.tweet(text);
      const url = `https://x.com/${username}/status/${res.data.id}`;
      console.log(`OK  posted: ${url}`);
      console.log(`post_ok=true url=${url}`);
    } catch (err) {
      console.error(`FAIL  post: ${describe(err)}`);
      console.log('post_ok=false');
      process.exit(1);
    }
    return;
  }

  console.error(`Unknown mode: ${MODE} (expected verify | post-test)`);
  process.exit(1);
}

main();
