import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEnvironment, parseMigrationEnvironment } from '../src/index.mjs';
test('rejects missing or incorrect database configuration', () => {
  assert.throws(() => parseEnvironment({}), /DATABASE_URL/);
  assert.throws(() => parseEnvironment({ DATABASE_URL: 'https://example.com' }), /PostgreSQL/);
});

test('production requires verified TLS without exposing connection credentials', () => {
  const NODE_ENV = 'production';
  assert.throws(() => parseEnvironment({ NODE_ENV, DATABASE_URL: 'postgres://example.com/db' }), /verify-full/);
  const DATABASE_URL = 'postgres://example.com/db?sslmode=verify-full';
  assert.equal(parseEnvironment({ NODE_ENV, DATABASE_URL }).poolMax, 3);
  assert.throws(() => parseEnvironment({ DATABASE_URL: 'invalid-secret-value' }), error => !error.message.includes('invalid-secret-value'));
  for (const DB_POOL_MAX of ['0', '21', '1.5', 'abc', '']) {
    assert.throws(() => parseEnvironment({ DATABASE_URL, DB_POOL_MAX }), /DB_POOL_MAX/);
  }
});

test('migrations require direct connections in production and reject Neon transaction pooling', () => {
  const DATABASE_URL = 'postgres://ep-demo-pooler.eu-central-1.aws.neon.tech/db?sslmode=verify-full';
  const DATABASE_DIRECT_URL = 'postgres://ep-demo.eu-central-1.aws.neon.tech/db?sslmode=verify-full';
  assert.throws(() => parseMigrationEnvironment({ NODE_ENV: 'production', DATABASE_URL }), /DATABASE_DIRECT_URL/);
  assert.throws(() => parseMigrationEnvironment({ DATABASE_URL }), /pooler/);
  assert.equal(parseMigrationEnvironment({ NODE_ENV: 'production', DATABASE_URL, DATABASE_DIRECT_URL }).databaseUrl, DATABASE_DIRECT_URL);
  assert.equal(parseMigrationEnvironment({ DATABASE_URL: 'postgres://localhost/showhunt' }).databaseUrl, 'postgres://localhost/showhunt');
});
test('validates the port and environment', () => {
  const base = { DATABASE_URL: 'postgres://localhost/showhunt' };
  for (const PORT of ['0', '65536', 'abc', '3.5']) assert.throws(() => parseEnvironment({ ...base, PORT }), /PORT/);
  assert.throws(() => parseEnvironment({ ...base, NODE_ENV: 'typo' }), /NODE_ENV/);
  assert.equal(parseEnvironment(base).port, 4000);
});
