import { describe, it, expect } from 'vitest';
import { describeProvenance, displayModel, makeProvenance, shortDate } from './provenance';
import { ProvenanceSchema, DigestEntrySchema, MetaSchema } from './schemas';

describe('describeProvenance', () => {
  it('labels llm output as AI with model and date', () => {
    const l = describeProvenance({ method: 'llm', model: 'claude', generatedAt: '2026-09-06T14:03:00Z' });
    expect(l.kind).toBe('ai');
    expect(l.labelKey).toBe('provenance.ai');
    expect(l.model).toBe('Claude');
    expect(l.date).toBe('6 Sep');
  });
  it('labels human copy as editorial without a model', () => {
    const l = describeProvenance({ method: 'human', model: 'claude' });
    expect(l.kind).toBe('editorial');
    expect(l.model).toBeUndefined();
  });
  it('does not hide a missing value', () => {
    expect(describeProvenance(undefined).kind).toBe('unknown');
    expect(describeProvenance(null).labelKey).toBe('provenance.unknown');
  });
  it('tolerates garbage timestamps', () => {
    expect(shortDate('not a date')).toBeUndefined();
    expect(describeProvenance({ method: 'heuristic', generatedAt: 'x' }).date).toBeUndefined();
  });
});

describe('displayModel', () => {
  it('title-cases model ids', () => {
    expect(displayModel('claude')).toBe('Claude');
    expect(displayModel('claude-sonnet-4')).toBe('Claude Sonnet 4');
    expect(displayModel('  ')).toBeUndefined();
  });
});

describe('makeProvenance', () => {
  it('defaults llm model to claude and stamps time', () => {
    const p = makeProvenance('llm', { pipeline: 'update-data', now: new Date('2026-09-07T00:00:00Z') });
    expect(p).toEqual({ method: 'llm', model: 'claude', generatedAt: '2026-09-07T00:00:00.000Z', pipeline: 'update-data' });
    expect(ProvenanceSchema.safeParse(p).success).toBe(true);
  });
  it('omits model for human', () => {
    expect(makeProvenance('human').model).toBeUndefined();
  });
});

describe('schemas accept provenance', () => {
  it('on digest entries and meta', () => {
    const d = DigestEntrySchema.parse({ date: '2026-09-07', title: 't', summary: 's', provenance: { method: 'llm', model: 'claude' } });
    expect(d.provenance?.method).toBe('llm');
    const m = MetaSchema.parse({
      operationName: 'o', dayCount: 1, dateline: 'd', heroHeadline: 'h', heroSubtitle: 's', footerNote: 'f', lastUpdated: '2026-09-07T00:00:00Z',
      provenance: { method: 'human' },
    });
    expect(m.provenance?.method).toBe('human');
  });
  it('rejects unknown methods', () => {
    expect(ProvenanceSchema.safeParse({ method: 'magic' }).success).toBe(false);
  });
});
