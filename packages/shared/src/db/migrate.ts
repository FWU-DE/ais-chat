import { MigrationConfig } from 'drizzle-orm/migrator';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

// See Github issue for reference: https://github.com/drizzle-team/drizzle-orm/issues/874

const advisoryLock = async (
  pool: Pool,
  { key1, key2 }: { key1: number; key2: number },
  callback: () => Promise<unknown>,
) => {
  await pool.query(`SELECT pg_advisory_lock($1, $2)`, [key1, key2]);

  try {
    await callback();
  } finally {
    await pool.query(`SELECT pg_advisory_unlock($1, $2)`, [key1, key2]);
  }
};

const MIGRATE_ADVISORY_LOCKING_KEY1 = 1_000;
const MIGRATE_ADVISORY_LOCKING_KEY2 = 100_001;

export const migrateWithLock = async (
  db: NodePgDatabase & { $client: Pool },
  opts: MigrationConfig,
) => {
  await advisoryLock(
    db.$client,
    {
      key1: MIGRATE_ADVISORY_LOCKING_KEY1,
      key2: MIGRATE_ADVISORY_LOCKING_KEY2,
    },
    async () => {
      await migrate(db, opts);
    },
  );
};
