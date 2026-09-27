import { test } from 'node:test';
import assert from 'node:assert/strict';
// Run against a compiled API; readiness must fail closed without a database.
test('live, readiness, request IDs and OpenAPI', { skip: !process.env.API_TEST_URL }, async () => {
  const base = process.env.API_TEST_URL;
  const live = await fetch(`${base}/health/live`, { headers: { 'X-Request-ID': 'foundation-test' } });
  assert.equal(live.status, 200);
  assert.equal(live.headers.get('x-request-id'), 'foundation-test');
  assert.deepEqual(await live.json(), { status: 'ok' });
  const ready = await fetch(`${base}/health/ready`);
  assert.equal(ready.status, process.env.EXPECT_DB_READY === 'true' ? 200 : 503);
  const docs = await fetch(`${base}/api/v1/docs-json`);
  assert.equal(docs.status, 200);
  assert.equal((await docs.json()).info.title, 'ShowHunt API');
});
