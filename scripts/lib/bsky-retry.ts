/**
 * bsky-retry.ts — create a Bluesky record without losing it to one dropped
 * connection, and without posting it twice.
 *
 * On 2026-09-29 the daily video uploaded and finished processing, then
 * `agent.post()` died with `XRPCError: fetch failed`. Nothing retried, the
 * record said `posted: {}` and the job stayed green.
 *
 * A blind retry is not safe: "fetch failed" can mean the request reached the
 * PDS and only the response was lost. So the record gets its rkey up front
 * (a TID, which `app.bsky.feed.post` requires), and before every retry we ask
 * the PDS whether that rkey already exists. If it does, the earlier attempt
 * went through and we return it instead of posting again.
 */

const S32 = '234567abcdefghijklmnopqrstuvwxyz';

/**
 * A timestamp identifier (atproto TID): 53 bits of microseconds since the
 * epoch, 10 bits of clock id, base32-sortable, 13 characters.
 */
export function makeTid(nowMs: number = Date.now(), clockId: number = Math.floor(Math.random() * 1024)): string {
  let n = (BigInt(Math.floor(nowMs)) * BigInt(1000)) << BigInt(10);
  n |= BigInt(clockId & 1023);
  let out = '';
  for (let i = 0; i < 13; i++) {
    out = S32[Number(n & BigInt(31))] + out;
    n >>= BigInt(5);
  }
  return out;
}

export interface RetryDeps {
  sleep: (ms: number) => Promise<void>;
  log?: (line: string) => void;
  /** Wait before each retry; its length is the number of retries. */
  delaysMs?: readonly number[];
}

export const DEFAULT_RETRY_DELAYS_MS = [2000, 5000, 15000] as const;

/**
 * Run `create`; on failure wait, ask `findExisting` whether the record landed
 * anyway, and only then try again. Throws the last error once retries run out.
 */
export async function createWithRetry<T>(
  create: () => Promise<T>,
  findExisting: () => Promise<T | null>,
  deps: RetryDeps,
): Promise<T> {
  const delays = deps.delaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  const log = deps.log ?? (() => {});
  let lastError: unknown;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    if (attempt > 0) {
      await deps.sleep(delays[attempt - 1]);
      const found = await findExisting().catch(() => null);
      if (found) {
        log(`record already exists — attempt ${attempt} went through despite the error`);
        return found;
      }
      log(`retrying (${attempt}/${delays.length})`);
    }
    try {
      return await create();
    } catch (err) {
      lastError = err;
      log(`attempt ${attempt + 1} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  throw lastError;
}
