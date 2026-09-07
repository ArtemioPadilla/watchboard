/**
 * claim-status.ts — epistemic taxonomy for contested claims.
 *
 * Legacy rows have no `status`; they are all disputes by construction, so
 * the inferred default is `contested` rather than hiding the field.
 */
import type { Claim, ClaimStatus } from './schemas';

export const CLAIM_STATUSES: readonly ClaimStatus[] = ['confirmed', 'contested', 'unverifiable', 'retracted'];

export interface ClaimStatusMeta {
  /** Unicode glyph, no emoji so it renders in the mono UI font. */
  icon: string;
  label: string;
  /** CSS modifier class suffix. */
  tone: 'green' | 'amber' | 'muted' | 'red';
}

export const CLAIM_STATUS_META: Record<ClaimStatus, ClaimStatusMeta> = {
  confirmed: { icon: '✓', label: 'Confirmed', tone: 'green' },
  contested: { icon: '⚔', label: 'Contested', tone: 'amber' },
  unverifiable: { icon: '?', label: 'Unverifiable', tone: 'muted' },
  retracted: { icon: '✕', label: 'Retracted', tone: 'red' },
};

/** Effective status for a claim, inferring `contested` for legacy rows. */
export function resolveClaimStatus(claim: Pick<Claim, 'status'>): ClaimStatus {
  const s = claim.status;
  return s && (CLAIM_STATUSES as readonly string[]).includes(s) ? s : 'contested';
}

export function claimStatusMeta(claim: Pick<Claim, 'status'>): ClaimStatusMeta & { status: ClaimStatus } {
  const status = resolveClaimStatus(claim);
  return { status, ...CLAIM_STATUS_META[status] };
}
