import assert from 'node:assert/strict';
import { Server } from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Exercise Vercel's server capture without cloud credentials or a live database.
// Its Node adapter temporarily replaces listen(), imports the entrypoint, then
// opens the captured server itself. The replacement does not run the callback.
// https://github.com/vercel/vercel/blob/main/packages/node/src/serverless-functions/serverless-handler.mts
Object.assign(process.env, {
  NODE_ENV: 'production',
  VERCEL: '1',
  PORT: '4498',
  DATABASE_URL: 'postgresql://test:unused@127.0.0.1:1/test?sslmode=verify-full',
  DB_POOL_MAX: '3',
});

async function within(promise, label, milliseconds = 15000) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timed out: ${label}`)), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

const originalListen = Server.prototype.listen;
let server;
let resolveCaptured;
const captured = new Promise(resolve => { resolveCaptured = resolve; });
Server.prototype.listen = function () {
  server = this;
  Server.prototype.listen = originalListen;
  resolveCaptured();
  return this;
};

try {
  const entrypoint = process.argv[2]
    ? pathToFileURL(resolve(process.argv[2]))
    : new URL('../dist/main.js', import.meta.url);
  const imported = import(entrypoint.href);
  // Surface import failures immediately while also detecting the silent case:
  // listen() was captured but top-level await prevents import() from settling.
  await within(Promise.race([captured, imported.then(() => captured)]), 'server capture');
  await within(imported, 'entrypoint import after server capture', 1000);
  assert.ok(server, 'Vercel must be able to capture the HTTP server');
  await within(new Promise((resolve, reject) => {
    server.once('error', reject);
    originalListen.call(server, { host: '127.0.0.1', port: 0 }, resolve);
  }), 'captured server listening');

  const base = `http://127.0.0.1:${server.address().port}`;
  const live = await fetch(`${base}/health/live`, {
    headers: { 'X-Request-ID': 'vercel-startup-test' },
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(live.status, 200);
  assert.deepEqual(await live.json(), { status: 'ok' });
  assert.equal(live.headers.get('x-request-id'), 'vercel-startup-test');
  assert.equal(live.headers.get('cache-control'), 'no-store');
  const ready = await fetch(`${base}/health/ready`, { signal: AbortSignal.timeout(5000) });
  assert.equal(ready.status, 503, 'Unreachable database must fail readiness');
  await ready.text();
  const docs = await fetch(`${base}/api/v1/docs-json`, { signal: AbortSignal.timeout(5000) });
  assert.equal(docs.status, 404, 'Production must not expose OpenAPI');
  await docs.text();
  console.log('PASS: Vercel-style startup, liveness, request IDs, unavailable database and production docs');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  Server.prototype.listen = originalListen;
  if (server?.listening) {
    await new Promise(resolve => {
      server.close(resolve);
      server.closeAllConnections();
    });
  }
}
