import { attachDatabasePool } from '@vercel/functions';
import type pg from 'pg';

/** Hosting-specific cleanup stays outside commerce modules. */
export function registerPoolLifecycle(pool: pg.Pool) {
  if (process.env.VERCEL === '1') attachDatabasePool(pool);
}
