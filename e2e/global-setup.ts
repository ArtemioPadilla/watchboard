import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { STARTED_FLAG, isListening, startDaemon, warmUp, waitUntilListening } from './dev-server';

export default async function globalSetup(): Promise<void> {
  if (existsSync(STARTED_FLAG)) unlinkSync(STARTED_FLAG);

  if (await isListening()) {
    console.log('[e2e] reusing the dev server already listening on 4321');
  } else {
    console.log('[e2e] starting the dev server');
    startDaemon();
    await waitUntilListening();
    // Only a server we started is ours to stop.
    writeFileSync(STARTED_FLAG, String(Date.now()));
  }

  // Warm either way: a reused server may still be cold.
  await warmUp();
}
