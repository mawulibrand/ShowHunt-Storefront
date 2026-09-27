import { Injectable, OnModuleDestroy } from '@nestjs/common';
import pg from 'pg';
import { parseEnvironment } from '@showhunt/validation';
@Injectable()
export class Database implements OnModuleDestroy {
  readonly pool = new pg.Pool({ connectionString: parseEnvironment(process.env).databaseUrl, max: 10, connectionTimeoutMillis: 3000, query_timeout: 3000 });
  constructor() { this.pool.on('error', () => console.error(JSON.stringify({ level: 'error', event: 'database_pool_error' }))); }
  async onModuleDestroy() { await this.pool.end(); }
}
