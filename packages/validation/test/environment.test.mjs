import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEnvironment } from '../src/index.mjs';
test('rejects missing or incorrect database configuration', () => {
  assert.throws(() => parseEnvironment({}), /DATABASE_URL/);
  assert.throws(() => parseEnvironment({ DATABASE_URL: 'https://example.com' }), /PostgreSQL/);
});
test('validates the port and environment', () => {
  const base = { DATABASE_URL: 'postgres://localhost/showhunt' };
  for (const PORT of ['0', '65536', 'abc', '3.5']) assert.throws(() => parseEnvironment({ ...base, PORT }), /PORT/);
  assert.throws(() => parseEnvironment({ ...base, NODE_ENV: 'typo' }), /NODE_ENV/);
  assert.equal(parseEnvironment(base).port, 4000);
});
