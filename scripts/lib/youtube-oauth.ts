/**
 * youtube-oauth.ts — the pure half of getting a YouTube refresh token.
 *
 * Uploading writes to a channel, so `YOUTUBE_API_KEY` cannot do it — that is
 * why backfill-youtube.ts gets by with a key and the publisher does not. What
 * the publisher needs is an OAuth refresh token, and the only way to mint one
 * is a consent flow in a browser, as the channel's owner. This builds the URL
 * and reads the response; scripts/youtube-oauth.ts runs the server.
 */

export const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const TOKEN_URL = 'https://oauth2.googleapis.com/token';
/** Uploading is all this needs. Narrower than youtube.force-ssl on purpose. */
export const UPLOAD_SCOPE = 'https://www.googleapis.com/auth/youtube.upload';

export interface ConsentOptions {
  clientId: string;
  redirectUri: string;
  /** Guards against a tampered callback. */
  state: string;
}

export function buildConsentUrl(opts: ConsentOptions): string {
  const params = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    response_type: 'code',
    scope: UPLOAD_SCOPE,
    // Without BOTH of these Google returns an access token and no refresh
    // token, and the whole point of this exercise is the refresh token.
    // `prompt=consent` matters on a re-run: an already-consented account is
    // otherwise handed a token with no refresh half, silently.
    access_type: 'offline',
    prompt: 'consent',
    state: opts.state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export interface TokenResult {
  refreshToken: string;
  scope?: string;
  expiresIn?: number;
}

/** Reads Google's token response, failing loudly on the silent-no-refresh case. */
export function parseTokenResponse(body: unknown): TokenResult {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.error === 'string') {
    throw new Error(`Google rejected the exchange: ${b.error}${b.error_description ? ` — ${b.error_description}` : ''}`);
  }
  if (typeof b.refresh_token !== 'string' || b.refresh_token.length === 0) {
    throw new Error(
      'the exchange worked but returned no refresh_token. That happens when the ' +
        'account already consented and the request omitted prompt=consent — revoke ' +
        "the app under your Google account's third-party access and run this again.",
    );
  }
  return {
    refreshToken: b.refresh_token,
    scope: typeof b.scope === 'string' ? b.scope : undefined,
    expiresIn: typeof b.expires_in === 'number' ? b.expires_in : undefined,
  };
}

/** The `code` from the callback, or a readable reason there is none. */
export function codeFromCallback(url: string, expectedState: string): string {
  const parsed = new URL(url, 'http://localhost');
  const error = parsed.searchParams.get('error');
  if (error) throw new Error(`consent was refused: ${error}`);
  const state = parsed.searchParams.get('state');
  if (state !== expectedState) throw new Error('state did not match — ignoring this callback');
  const code = parsed.searchParams.get('code');
  if (!code) throw new Error('callback carried no code');
  return code;
}
