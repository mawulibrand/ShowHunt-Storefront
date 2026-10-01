import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { Database } from './database.js';
const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
app.enableShutdownHooks();
const database = app.get(Database);
try {
  const result = await database.pool.query('SELECT version FROM schema_migrations WHERE version = $1', ['0001_foundation.sql']);
  if (result.rowCount !== 1) throw new Error('Missing foundation migration');
  console.log(JSON.stringify({ level: 'info', event: 'worker_started', mode: 'foundation_no_job_handlers' }));
  // Do not keep Neon compute awake just to log that this placeholder is alive.
  // Durable job polling, retries and leases are implemented with the jobs slice.
  const timer = setInterval(() => console.log(JSON.stringify({ level: 'info', event: 'worker_process_heartbeat' })), 60000);
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => clearInterval(timer));
} catch {
  console.error(JSON.stringify({ level: 'error', event: 'worker_startup_database_unavailable' }));
  await app.close();
  process.exitCode = 1;
}
