import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const project = resolve(process.argv[2]);
const require = createRequire(join(project, 'apps/api/package.json'));
const { Client } = require('pg');
const envPath = join(project, 'apps/api/.env');
if (existsSync(envPath)) throw new Error('API environment file already exists; refusing to overwrite.');
if (!process.env.SHOWHUNT_POSTGRES_ADMIN_PASSWORD) throw new Error('Missing administrator credential.');
const client = new Client({
  host: '127.0.0.1', port: 5432, database: 'postgres', user: 'postgres',
  password: process.env.SHOWHUNT_POSTGRES_ADMIN_PASSWORD,
  connectionTimeoutMillis: 5000,
});
try {
  await client.connect();
  const roles = await client.query("SELECT 1 FROM pg_roles WHERE rolname = 'showhunt'");
  const databases = await client.query("SELECT 1 FROM pg_database WHERE datname = 'showhunt'");
  if (roles.rowCount || databases.rowCount) throw new Error('ShowHunt database or role already exists; refusing to overwrite.');
  const password = randomBytes(32).toString('hex');
  // The password contains only generated hex characters; it cannot contain SQL syntax.
  await client.query(`CREATE ROLE showhunt LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION`);
  await client.query('CREATE DATABASE showhunt OWNER showhunt');
  await client.query("ALTER DATABASE showhunt SET timezone TO 'UTC'");
  writeFileSync(envPath, `NODE_ENV=development\nPORT=4000\nDATABASE_URL=postgres://showhunt:${password}@127.0.0.1:5432/showhunt\n`, { flag: 'wx' });
  console.log('Created showhunt database and non-superuser application login; API .env configured.');
  console.log('Database timezone is UTC. The application connects through 127.0.0.1.');
} catch (error) {
  console.error(error.code === '28P01'
    ? 'PostgreSQL rejected the administrator password. Run setup again with the password chosen during installation.'
    : `Database setup failed: ${error.code ?? error.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
