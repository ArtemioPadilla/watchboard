import { existsSync, unlinkSync } from 'node:fs';
import { STARTED_FLAG, stopDaemon } from './dev-server';

export default async function globalTeardown(): Promise<void> {
  if (!existsSync(STARTED_FLAG)) return; // reused someone else's; leave it alone
  unlinkSync(STARTED_FLAG);
  console.log('[e2e] stopping the dev server it started');
  stopDaemon();
}
