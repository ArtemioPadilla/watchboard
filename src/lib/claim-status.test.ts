import { describe, it, expect } from 'vitest';
import { claimStatusMeta, resolveClaimStatus, CLAIM_STATUSES } from './claim-status';
import { ClaimSchema } from './schemas';

const base = { id: 'c', question: 'q', sideA: { label: 'a', text: 'a' }, sideB: { label: 'b', text: 'b' }, resolution: 'r' };

describe('resolveClaimStatus', () => {
  it('infers contested for legacy rows', () => {
    expect(resolveClaimStatus({})).toBe('contested');
    expect(resolveClaimStatus({ status: undefined })).toBe('contested');
  });
  it('treats an unknown string as contested rather than trusting it', () => {
    expect(resolveClaimStatus({ status: 'maybe' as never })).toBe('contested');
    expect(claimStatusMeta({ status: 'MAYBE' as never }).status).toBe('contested');
  });
  it('passes through every known status', () => {
    for (const s of CLAIM_STATUSES) expect(resolveClaimStatus({ status: s })).toBe(s);
  });
  it('carries icon and tone', () => {
    expect(claimStatusMeta({ status: 'retracted' })).toMatchObject({ status: 'retracted', tone: 'red' });
    expect(claimStatusMeta({})).toMatchObject({ status: 'contested', tone: 'amber' });
  });
});

describe('ClaimSchema.status', () => {
  it('accepts the taxonomy and stays optional', () => {
    expect(ClaimSchema.parse(base).status).toBeUndefined();
    expect(ClaimSchema.parse({ ...base, status: 'unverifiable' }).status).toBe('unverifiable');
  });
  it('rejects free text', () => {
    expect(ClaimSchema.safeParse({ ...base, status: 'maybe' }).success).toBe(false);
  });
});
