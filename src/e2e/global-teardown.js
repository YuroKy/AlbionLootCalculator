import { readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const pidFile = resolve('test-results', 'vite.pid');

export default async function globalTeardown() {
  let pid;

  try {
    pid = Number.parseInt(await readFile(pidFile, 'utf8'), 10);
  } catch {
    pid = null;
  }

  if (pid) {
    try {
      process.kill(pid);
    } catch {
      // Server may already be closed; teardown should stay idempotent.
    }
  }

  await rm(pidFile, { force: true });
}
