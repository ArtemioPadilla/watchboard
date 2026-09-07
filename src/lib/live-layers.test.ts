import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LIVE_LAYERS, LiveLayerSpecSchema, layersForTracker, feedUrls, getLiveLayer } from './live-layers';
import { extractConnectSrc, extractPolicies, hostAllowed } from '../../scripts/lib/csp-hosts';

const ROOT = resolve(__dirname, '../..');

describe('LIVE_LAYERS registry', () => {
  it('every entry validates against the schema', () => {
    for (const layer of LIVE_LAYERS) {
      const parsed = LiveLayerSpecSchema.safeParse(layer);
      expect(parsed.success, `${layer.id}: ${JSON.stringify(parsed.success ? null : parsed.error.issues)}`).toBe(true);
    }
  });

  it('ids are unique', () => {
    const ids = LIVE_LAYERS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('snapshots carry a date and a scope, feeds carry url and ttl', () => {
    for (const layer of LIVE_LAYERS) {
      if (layer.kind === 'snapshot') {
        expect(layer.snapshotDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(layer.scope.length, `${layer.id} snapshot must be scoped`).toBeGreaterThan(0);
      } else {
        if (layer.cors === 'same-origin') expect(layer.url).toMatch(/^\//);
        else expect(layer.url).toMatch(/^(https|wss):\/\//);
        expect(layer.ttlMs).toBeGreaterThan(0);
      }
    }
  });

  it('rejects a feed without ttl and a snapshot without date', () => {
    expect(
      LiveLayerSpecSchema.safeParse({
        id: 'x', label: 'x', kind: 'feed', renderer: 'both', url: 'https://a.b', cors: true,
        attribution: { source: 's', license: 'l' },
      }).success,
    ).toBe(false);
    expect(
      LiveLayerSpecSchema.safeParse({
        id: 'x', label: 'x', kind: 'snapshot', renderer: 'both', dataPath: 'p',
        attribution: { source: 's', license: 'l' },
      }).success,
    ).toBe(false);
  });

  it('rejects cross-kind fields instead of stripping them', () => {
    const attribution = { source: 's', license: 'l' };
    expect(
      LiveLayerSpecSchema.safeParse({
        id: 'x', label: 'x', kind: 'snapshot', renderer: 'both', snapshotDate: '2026-01-01', dataPath: 'p', attribution,
        url: 'https://a.b', ttlMs: 1000,
      }).success,
    ).toBe(false);
    expect(
      LiveLayerSpecSchema.safeParse({
        id: 'x', label: 'x', kind: 'feed', renderer: 'both', url: 'https://a.b', ttlMs: 1000, cors: true, attribution,
        snapshotDate: '2026-01-01',
      }).success,
    ).toBe(false);
  });

  it('scopes snapshot layers to their trackers', () => {
    const iran = layersForTracker('iran-conflict').map((l) => l.id);
    const mexico = layersForTracker('mexico-history').map((l) => l.id);
    expect(iran).toContain('nfz');
    expect(mexico).not.toContain('nfz');
    expect(mexico).toContain('flights');
    expect(getLiveLayer('flights')?.kind).toBe('feed');
  });
});

describe('CSP allowlist covers every feed host', () => {
  const files = ['src/layouts/BaseLayout.astro', 'public/_headers'];

  for (const file of files) {
    it(`${file} allows every registered feed`, () => {
      const body = readFileSync(resolve(ROOT, file), 'utf8');
      const policies = extractPolicies(body);
      expect(policies.length, `${file} has no CSP`).toBeGreaterThan(0);
      for (const policy of policies) {
        const allow = extractConnectSrc(policy);
        expect(allow.length).toBeGreaterThan(0);
        for (const { id, url } of feedUrls()) {
          expect(hostAllowed(url, allow), `${id} (${url}) is not in connect-src of ${file}`).toBe(true);
        }
      }
    });
  }
});
