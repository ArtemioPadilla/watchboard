import { describe, it, expect } from 'vitest';
import {
  UPLOAD_SCOPE,
  buildConsentUrl,
  codeFromCallback,
  parseTokenResponse,
} from '../scripts/lib/youtube-oauth.js';

const OPTS = { clientId: 'cid.apps.googleusercontent.com', redirectUri: 'http://localhost:8787/callback', state: 'abc123' };

describe('buildConsentUrl', () => {
  it('asks for offline access and forces the consent screen', () => {
    // Without both, Google returns an access token and no refresh token — and
    // on a re-run for an already-consented account it does that silently,
    // which is the single most confusing way this can fail.
    const u = new URL(buildConsentUrl(OPTS));
    expect(u.searchParams.get('access_type')).toBe('offline');
    expect(u.searchParams.get('prompt')).toBe('consent');
  });

  it('asks only for the upload scope', () => {
    const u = new URL(buildConsentUrl(OPTS));
    expect(u.searchParams.get('scope')).toBe(UPLOAD_SCOPE);
    expect(u.searchParams.get('scope')).not.toContain('force-ssl');
  });

  it('carries the client, redirect and state through', () => {
    const u = new URL(buildConsentUrl(OPTS));
    expect(u.searchParams.get('client_id')).toBe(OPTS.clientId);
    expect(u.searchParams.get('redirect_uri')).toBe(OPTS.redirectUri);
    expect(u.searchParams.get('state')).toBe('abc123');
    expect(u.searchParams.get('response_type')).toBe('code');
  });
});

describe('codeFromCallback', () => {
  it('returns the code when the state matches', () => {
    expect(codeFromCallback('/callback?code=xyz&state=abc123', 'abc123')).toBe('xyz');
  });

  it('refuses a mismatched state rather than exchanging it', () => {
    expect(() => codeFromCallback('/callback?code=xyz&state=other', 'abc123')).toThrow(/state did not match/);
  });

  it('reports a refused consent in Google\'s own words', () => {
    expect(() => codeFromCallback('/callback?error=access_denied&state=abc123', 'abc123')).toThrow(/access_denied/);
  });

  it('says so when the callback carries no code', () => {
    expect(() => codeFromCallback('/callback?state=abc123', 'abc123')).toThrow(/no code/);
  });
});

describe('parseTokenResponse', () => {
  it('returns the refresh token and what it is scoped to', () => {
    const r = parseTokenResponse({ refresh_token: '1//abc', scope: UPLOAD_SCOPE, expires_in: 3599 });
    expect(r.refreshToken).toBe('1//abc');
    expect(r.scope).toBe(UPLOAD_SCOPE);
    expect(r.expiresIn).toBe(3599);
  });

  it('explains the no-refresh-token case instead of returning undefined', () => {
    // An already-consented account gets an access token and nothing else.
    // Returning undefined here would surface as a cryptic failure days later,
    // in a nightly, as "refresh token rejected".
    expect(() => parseTokenResponse({ access_token: 'ya29.x', expires_in: 3599 }))
      .toThrow(/no refresh_token[\s\S]*prompt=consent/);
  });

  it('surfaces Google\'s error verbatim', () => {
    expect(() => parseTokenResponse({ error: 'invalid_grant', error_description: 'Bad Request' }))
      .toThrow(/invalid_grant — Bad Request/);
  });

  it('treats an empty body as a failure, not a success', () => {
    expect(() => parseTokenResponse({})).toThrow();
    expect(() => parseTokenResponse(null)).toThrow();
  });
});
