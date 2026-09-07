import { describe, it, expect } from 'vitest';
import { extractConnectSrc, extractPolicies, hostAllowed, effectivePort, CSP_META_RE } from './csp-hosts';

const CSP = "default-src 'self'; connect-src 'self' https://api.example.com https://*.tiles.example.org wss://stream.example.net https:; img-src *";

describe('extractConnectSrc', () => {
  it('returns the connect-src sources', () => {
    expect(extractConnectSrc(CSP)).toEqual([
      "'self'", 'https://api.example.com', 'https://*.tiles.example.org', 'wss://stream.example.net', 'https:',
    ]);
  });
  it('returns [] when the directive is missing', () => {
    expect(extractConnectSrc("default-src 'self'")).toEqual([]);
  });
});

describe('extractPolicies', () => {
  it('finds the astro meta tag and the _headers line', () => {
    const astro = `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; connect-src https://a.b">`;
    const headers = `/*\n  Content-Security-Policy: default-src 'self'; connect-src https://c.d\n`;
    expect(extractPolicies(astro)).toHaveLength(1);
    expect(extractPolicies(headers)).toHaveLength(1);
    expect(extractPolicies('nothing here')).toHaveLength(0);
  });
});

describe('hostAllowed', () => {
  const allow = ['https://api.example.com', 'https://*.tiles.example.org', 'wss://stream.example.net'];
  it('matches exact origin', () => {
    expect(hostAllowed('https://api.example.com/v1?x=1', allow)).toBe(true);
  });
  it('rejects a different scheme on the same host', () => {
    expect(hostAllowed('http://api.example.com/', allow)).toBe(false);
    expect(hostAllowed('https://stream.example.net/', allow)).toBe(false);
  });
  it('matches wildcard subdomains, including nested, but not the bare domain', () => {
    expect(hostAllowed('https://a.tiles.example.org/z', allow)).toBe(true);
    expect(hostAllowed('https://x.y.tiles.example.org/z', allow)).toBe(true);
    expect(hostAllowed('https://tiles.example.org/z', allow)).toBe(false);
  });
  it('does not match a host that merely ends with the same text', () => {
    expect(hostAllowed('https://evilapi.example.com/', allow)).toBe(false);
    expect(hostAllowed('https://api.example.com.evil.net/', allow)).toBe(false);
  });
  it('honours scheme-only sources', () => {
    expect(hostAllowed('https://anything.test/', ['https:'])).toBe(true);
    expect(hostAllowed('wss://anything.test/', ['https:'])).toBe(false);
  });
  it('returns false for unparsable input', () => {
    expect(hostAllowed('not a url', allow)).toBe(false);
  });
  it('matches on the effective port', () => {
    expect(hostAllowed('https://api.example.com:443/', allow)).toBe(true);
    expect(hostAllowed('https://api.example.com:8443/', allow)).toBe(false);
    expect(hostAllowed('https://api.example.com:8443/', ['https://api.example.com:8443'])).toBe(true);
    expect(hostAllowed('https://api.example.com/', ['https://api.example.com:8443'])).toBe(false);
    expect(hostAllowed('https://a.tiles.example.org:9000/', allow)).toBe(false);
    expect(effectivePort(new URL('wss://x.y'))).toBe('443');
    expect(effectivePort(new URL('http://x.y'))).toBe('80');
    expect(effectivePort(new URL('http://x.y:8080'))).toBe('8080');
  });
  it('exports the meta regex csp-hashes.ts rewrites with', () => {
    const m = `<meta http-equiv="Content-Security-Policy" content="default-src 'self'">`.match(CSP_META_RE);
    expect(m?.[2]).toBe("default-src 'self'");
  });
});
