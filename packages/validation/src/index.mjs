function databaseUrl(value, name, production) {
  if (!value) throw new Error(`${name} is required`);
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error(`${name} must be a valid PostgreSQL URL`); }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) throw new Error(`${name} must use PostgreSQL`);
  if (production && parsed.searchParams.get('sslmode') !== 'verify-full') {
    throw new Error(`${name} must use sslmode=verify-full in production`);
  }
  return parsed;
}

export function parseEnvironment(env) {
  const mode = env.NODE_ENV ?? 'development';
  if (!['development', 'test', 'production'].includes(mode)) throw new Error('Invalid NODE_ENV');
  databaseUrl(env.DATABASE_URL, 'DATABASE_URL', mode === 'production');
  const port = Number(env.PORT ?? 4000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  const poolMax = Number(env.DB_POOL_MAX ?? 3);
  if (!Number.isInteger(poolMax) || poolMax < 1 || poolMax > 20) throw new Error('DB_POOL_MAX must be an integer between 1 and 20');
  return Object.freeze({ mode, databaseUrl: env.DATABASE_URL, port, poolMax });
}

export function parseMigrationEnvironment(env) {
  const production = env.NODE_ENV === 'production';
  const connection = env.DATABASE_DIRECT_URL || (!production ? env.DATABASE_URL : undefined);
  const parsed = databaseUrl(connection, 'DATABASE_DIRECT_URL', production);
  if (parsed.hostname.includes('-pooler.')) throw new Error('Migrations require the direct Neon endpoint, not its pooler');
  return parseEnvironment({ ...env, DATABASE_URL: connection });
}
