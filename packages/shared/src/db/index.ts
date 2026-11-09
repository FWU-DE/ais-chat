import path from 'node:path';

import { MemoryCache } from '@shared/db/memory-cache';
import { logError, logInfo } from '@shared/logging';
import { isDevelopment } from '@shared/utils/isDevelopment';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { env } from './env';
import { migrateWithLock } from './migrate';

const globalState = global as unknown as {
  pool?: Pool;
};

const pool =
  globalState.pool ??
  new Pool({
    connectionString: env.databaseUrl,
    max: 12,
  });

// In development mode, store the pool globally to reuse it across hot reloads.
if (isDevelopment()) {
  globalState.pool = pool;
}

export const db = drizzle({
  client: pool,
  // Setup in-memory cache if a global TTL is configured
  cache: env.dbCacheTtlSeconds
    ? new MemoryCache({
        ex: env.dbCacheTtlSeconds,
      })
    : undefined,
});

export async function shutdownDatabase() {
  console.log('[shutdown] Closing PostgreSQL connection pool...');
  await pool.end();
  console.log('[shutdown] PostgreSQL connection pool closed');
}

export async function runDatabaseMigration() {
  try {
    logInfo('Running database migrations...');
    await migrateWithLock(db, {
      migrationsFolder: path.join(process.cwd(), '..', '..', 'packages', 'shared', 'migrations'),
    });
    logInfo('Database migrations completed successfully.');
  } catch (error) {
    logError('Error running database migrations', error);
  }
}
