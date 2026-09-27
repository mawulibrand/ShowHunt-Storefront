import { Controller, Get, Module, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Database } from './database.js';
@ApiTags('health')
@Controller('health')
class HealthController {
  constructor(private readonly database: Database) {}
  @Get('live') live() { return { status: 'ok' }; }
  @Get('ready') async ready() {
    try {
      const result = await this.database.pool.query('SELECT version FROM schema_migrations WHERE version = $1', ['0001_foundation.sql']);
      if (result.rowCount !== 1) throw new Error('Missing foundation migration');
      return { status: 'ok' };
    }
    catch { throw new ServiceUnavailableException({ status: 'unavailable' }); }
  }
}
@Module({ controllers: [HealthController], providers: [Database] })
export class AppModule {}
