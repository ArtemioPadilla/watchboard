/**
 * video-destinations.ts — what each video destination needs, and whether it
 * has it.
 *
 * Instagram Reels, the Facebook Page and YouTube Shorts are all written and
 * tested, and all dormant: the adapters no-op until their credentials exist.
 * A missing secret is an empty string rather than an error in this repo, so
 * the nightly goes green having published nothing, which is indistinguishable
 * from "it worked". The runbook lists what to set; this answers whether what
 * was set actually works, before a night is spent finding out.
 *
 * Pure: presence and reporting here, the HTTP in
 * scripts/check-video-destinations.ts.
 */

export type CredentialKind = 'secret' | 'variable';

export interface CredentialSpec {
  name: string;
  kind: CredentialKind;
  /** What breaks while it is missing. */
  missing: string;
}

export interface DestinationSpec {
  id: 'instagram' | 'facebook' | 'youtube';
  label: string;
  credentials: CredentialSpec[];
  /** The issue tracking the destination. */
  issue: number;
}

export const DESTINATIONS: readonly DestinationSpec[] = [
  {
    id: 'instagram',
    label: 'Instagram Reels',
    issue: 234,
    credentials: [
      { name: 'META_PAGE_ACCESS_TOKEN', kind: 'secret', missing: 'both Meta adapters stay off' },
      { name: 'META_IG_USER_ID', kind: 'variable', missing: 'the Instagram adapter stays off' },
    ],
  },
  {
    id: 'facebook',
    label: 'Facebook Page',
    issue: 234,
    credentials: [
      { name: 'META_PAGE_ACCESS_TOKEN', kind: 'secret', missing: 'both Meta adapters stay off' },
      { name: 'META_FB_PAGE_ID', kind: 'variable', missing: 'the Facebook adapter stays off' },
    ],
  },
  {
    id: 'youtube',
    label: 'YouTube Shorts',
    issue: 325,
    credentials: [
      { name: 'YOUTUBE_CLIENT_ID', kind: 'secret', missing: 'the YouTube adapter stays off' },
      { name: 'YOUTUBE_CLIENT_SECRET', kind: 'secret', missing: 'the YouTube adapter stays off' },
      // An API key cannot upload: uploading writes to a channel, which needs
      // an OAuth refresh token. backfill-youtube.ts gets by with a key because
      // it only reads.
      { name: 'YOUTUBE_REFRESH_TOKEN', kind: 'secret', missing: 'the YouTube adapter stays off' },
    ],
  },
];

export type Readiness = 'ready' | 'partial' | 'absent';

export interface DestinationStatus {
  spec: DestinationSpec;
  readiness: Readiness;
  present: string[];
  missing: string[];
}

/** Which credentials each destination has, from an environment snapshot. */
export function assess(env: Record<string, string | undefined>): DestinationStatus[] {
  return DESTINATIONS.map((spec) => {
    const present: string[] = [];
    const missing: string[] = [];
    for (const c of spec.credentials) {
      // A set-but-empty secret is the trap this whole script exists for: it
      // reads as configured and behaves as absent.
      if ((env[c.name] ?? '').trim().length > 0) present.push(c.name);
      else missing.push(c.name);
    }
    const readiness: Readiness =
      missing.length === 0 ? 'ready' : present.length === 0 ? 'absent' : 'partial';
    return { spec, readiness, present, missing };
  });
}

export interface CheckOutcome {
  /** Null when nothing was attempted because credentials were missing. */
  ok: boolean | null;
  detail: string;
}

/** A human-readable report. `outcomes` is keyed by destination id. */
export function formatReport(
  statuses: readonly DestinationStatus[],
  outcomes: Partial<Record<string, CheckOutcome>> = {},
): string {
  const lines: string[] = [];
  for (const s of statuses) {
    const o = outcomes[s.spec.id];
    const verdict =
      o?.ok === true ? 'WORKS'
      : o?.ok === false ? 'BROKEN'
      : s.readiness === 'ready' ? 'configured, not verified'
      : s.readiness.toUpperCase();
    lines.push(`${s.spec.label} (#${s.spec.issue}): ${verdict}`);
    if (o?.detail) lines.push(`  ${o.detail}`);
    for (const name of s.missing) {
      const c = s.spec.credentials.find((x) => x.name === name)!;
      lines.push(`  missing ${c.kind} ${name} — ${c.missing}`);
    }
    if (s.readiness === 'partial') {
      lines.push('  partial configuration is detected, not guessed at: the adapter stays off');
    }
  }
  return lines.join('\n');
}

/** Nonzero only when something that IS configured turned out not to work. */
export function exitCodeFor(outcomes: Partial<Record<string, CheckOutcome>>): number {
  return Object.values(outcomes).some((o) => o?.ok === false) ? 1 : 0;
}
