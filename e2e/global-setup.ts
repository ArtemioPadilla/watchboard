import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { STARTED_FLAG, isListening, startDaemon, warmUp, waitUntilListening } from './dev-server';

export default async function globalSetup(): Promise<void> {
  if (existsSync(STARTED_FLAG)) unlinkSync(STARTED_FLAG);

  if (await isListening()) {
    console.log('[e2e] reusing the dev server already listening on 4321');
  } else {
    console.log('[e2e] starting the dev server');
    const pid = startDaemon();
    await waitUntilListening();
    // Only a server we started is ours to stop, and teardown needs the pid for
    // the case where astro stayed in the foreground rather than daemonising.
    writeFileSync(STARTED_FLAG, String(pid ?? ''));
  }

  // Warm either way: a reused server may still be cold.
  await warmUp();
}
