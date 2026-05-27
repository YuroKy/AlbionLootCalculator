import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const serverUrl = 'http://127.0.0.1:5173';
const pidFile = resolve('test-results', 'vite.pid');

async function isServerReady() {
  try {
    const response = await fetch(serverUrl);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForServer() {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 120_000) {
    if (await isServerReady()) return;
    await new Promise((resolveTimer) => setTimeout(resolveTimer, 250));
  }

  throw new Error(`Vite dev server did not start at ${serverUrl}`);
}

export default async function globalSetup() {
  await mkdir(dirname(pidFile), { recursive: true });

  if (await isServerReady()) {
    await writeFile(pidFile, '');
    return;
  }

  const server = spawn(
    'node',
    ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5173'],
    {
      cwd: process.cwd(),
      detached: false,
      stdio: 'ignore',
      windowsHide: true,
    },
  );

  server.unref();
  await writeFile(pidFile, String(server.pid));
  await waitForServer();
}
