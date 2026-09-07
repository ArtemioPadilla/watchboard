import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseHeadersFile, patternToLocation, renderNginxLocations, reconcileFraming, mergeHeaders } from './headers-to-nginx';

const SAMPLE = `# comment
/*
  X-Frame-Options: SAMEORIGIN
  Content-Security-Policy: default-src 'self'; connect-src https://a.b; frame-ancestors 'none'

/_astro/*
  Cache-Control: public, max-age=31536000, immutable

/api/v1/*
  Access-Control-Allow-Origin: *
  Content-Type: application/json

/embed/*
  X-Frame-Options: ALLOWALL
`;

describe('parseHeadersFile', () => {
  it('groups headers under their path and skips comments', () => {
    const rules = parseHeadersFile(SAMPLE);
    expect(rules.map(r => r.path)).toEqual(['/*', '/_astro/*', '/api/v1/*', '/embed/*']);
    expect(rules[0].headers['X-Frame-Options']).toBe('SAMEORIGIN');
    expect(rules[0].headers['Content-Security-Policy']).toContain("connect-src https://a.b");
  });
  it('handles CRLF and an empty file', () => {
    expect(parseHeadersFile('/*\r\n  A: 1\r\n')[0].headers).toEqual({ A: '1' });
    expect(parseHeadersFile('')).toEqual([]);
  });
});

describe('patternToLocation', () => {
  it('maps prefix wildcards and rejects others', () => {
    expect(patternToLocation('/*')).toEqual({ kind: 'root', path: '/' });
    expect(patternToLocation('/_astro/*')).toEqual({ kind: 'prefix', path: '/_astro/' });
    expect(patternToLocation('/robots.txt')).toEqual({ kind: 'exact', path: '/robots.txt' });
    expect(() => patternToLocation('/*.json')).toThrow();
  });
});

describe('renderNginxLocations', () => {
  const out = renderNginxLocations(parseHeadersFile(SAMPLE));
  it('repeats root headers in every location (nginx add_header inheritance)', () => {
    const astro = out.slice(out.indexOf('location ^~ /_astro/'), out.indexOf('location ^~ /api/v1/'));
    expect(astro).toContain('add_header Content-Security-Policy');
    expect(astro).toContain('add_header X-Frame-Options "SAMEORIGIN" always;');
    expect(astro).toContain("frame-ancestors 'none'");
  });
  it('an ALLOWALL rule drops frame-ancestors and the bogus X-Frame-Options', () => {
    const embed = out.slice(out.indexOf('location ^~ /embed/'));
    expect(embed).toContain('add_header Content-Security-Policy');
    expect(embed).not.toContain('frame-ancestors');
    expect(embed).not.toContain('X-Frame-Options');
    expect(reconcileFraming({ 'X-Frame-Options': 'SAMEORIGIN', 'Content-Security-Policy': "frame-ancestors 'none'" })).toEqual({ 'X-Frame-Options': 'SAMEORIGIN', 'Content-Security-Policy': "frame-ancestors 'none'" });
  });
  it('merges header names case-insensitively', () => {
    expect(mergeHeaders({ 'Cache-Control': 'a' }, { 'cache-control': 'b' })).toEqual({ 'cache-control': 'b' });
    expect(mergeHeaders({ 'X-A': '1' }, { 'X-B': '2' })).toEqual({ 'X-A': '1', 'X-B': '2' });
  });
  it('refuses header values containing a dollar sign', () => {
    expect(() => renderNginxLocations([{ path: '/*', headers: { 'X-Test': 'a$b' } }])).toThrow(/\$/);
  });
  it('quotes values with semicolons and never emits Content-Type', () => {
    expect(out).toContain(`add_header Content-Security-Policy "default-src 'self'; connect-src https://a.b" always;`);
    expect(out).not.toContain('add_header Content-Type');
    expect(out).toContain('add_header Access-Control-Allow-Origin "*" always;');
  });
  it('round-trips the real public/_headers into one block per rule', () => {
    const real = parseHeadersFile(readFileSync(resolve(__dirname, '../public/_headers'), 'utf8'));
    const rendered = renderNginxLocations(real);
    expect((rendered.match(/^location /gm) ?? []).length).toBe(real.length);
    expect(rendered).toContain('location ^~ /api/v1/');
    expect(rendered).toContain('location ^~ /cesium/');
  });
});
