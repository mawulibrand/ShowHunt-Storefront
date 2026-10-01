import { Injectable, OnModuleDestroy } from '@nestjs/common';
import pg from 'pg';
import { parseEnvironment } from '@showhunt/validation';
import { registerPoolLifecycle } from './platform/vercel-pool.js';
@Injectable()
export class Database implements OnModuleDestroy {
  readonly pool: pg.Pool;
  constructor() {
    const env = parseEnvironment(process.env);
    this.pool = new pg.Pool({ connectionString: env.databaseUrl, max: env.poolMax, min: 0, idleTimeoutMillis: 5000, connectionTimeoutMillis: 10000, query_timeout: 3000, allowExitOnIdle: true });
    registerPoolLifecycle(this.pool);
    this.pool.on('error', () => console.error(JSON.stringify({ level: 'error', event: 'database_pool_error' })));
  }
  async onModuleDestroy() { await this.pool.end(); }
}
