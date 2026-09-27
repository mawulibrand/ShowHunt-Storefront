import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { Database } from './database.js';
const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
app.enableShutdownHooks();
const database = app.get(Database);
async function heartbeat() {
  try { await database.pool.query('SELECT 1'); console.log(JSON.stringify({ level: 'info', event: 'worker_heartbeat' })); }
  catch { console.error(JSON.stringify({ level: 'error', event: 'worker_database_unavailable' })); }
}
await heartbeat();
const timer = setInterval(() => { void heartbeat(); }, 30000);
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => clearInterval(timer));
