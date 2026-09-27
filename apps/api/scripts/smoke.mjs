import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
const cwd = fileURLToPath(new URL('..', import.meta.url));
const port = '4400';
const service = spawn(process.execPath, ['dist/main.js'], {
  cwd,
  env: { ...process.env, NODE_ENV: 'test', PORT: port, DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://showhunt:unused@127.0.0.1:1/showhunt' },
  stdio: ['ignore', 'inherit', 'inherit'],
});
try {
  let ready = false;
  for (let attempt = 0; attempt < 240; attempt++) {
    if (service.exitCode !== null) throw new Error(`API exited with ${service.exitCode}`);
    try { ready = (await fetch(`http://127.0.0.1:${port}/health/live`, { signal: AbortSignal.timeout(1000) })).ok; } catch {}
    if (ready) break;
    await delay(250);
  }
  if (!ready) throw new Error('API startup timed out');
  const test = spawn(process.execPath, ['--test', 'test/health.test.mjs'], {
    cwd,
    env: { ...process.env, API_TEST_URL: `http://127.0.0.1:${port}` },
    stdio: 'inherit',
  });
  process.exitCode = await new Promise((resolve, reject) => {
    test.once('error', reject);
    test.once('exit', code => resolve(code ?? 1));
  });
} finally {
  service.kill();
}
