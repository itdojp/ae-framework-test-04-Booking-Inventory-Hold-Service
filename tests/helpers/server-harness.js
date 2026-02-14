import { spawn } from 'node:child_process';

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth(baseUrl, retries = 30) {
  for (let i = 0; i < retries; i += 1) {
    try {
      const res = await fetch(`${baseUrl}/healthz`);
      if (res.ok) return;
    } catch {
      // ignore
    }
    await wait(100);
  }
  throw new Error(`server did not become healthy: ${baseUrl}`);
}

export async function startServer({ port, stateFile }) {
  const baseUrl = `http://127.0.0.1:${port}`;
  const proc = spawn(process.execPath, ['src/server.js'], {
    env: { ...process.env, PORT: String(port), STATE_FILE: stateFile },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  await waitForHealth(baseUrl);
  return {
    baseUrl,
    async stop() {
      proc.kill('SIGTERM');
      await wait(100);
    }
  };
}
