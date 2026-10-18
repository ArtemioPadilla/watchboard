import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { STARTED_FLAG, answers, startDaemon, waitUntilAnswering } from './dev-server';

export default async function globalSetup(): Promise<void> {
  if (existsSync(STARTED_FLAG)) unlinkSync(STARTED_FLAG);
  if (await answers()) {
    console.log('[e2e] reusing the dev server already listening on 4321');
    return;
  }
  console.log('[e2e] starting the dev server');
  startDaemon();
  await waitUntilAnswering();
  // Only a server we started is ours to stop.
  writeFileSync(STARTED_FLAG, String(Date.now()));
}
