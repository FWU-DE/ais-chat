import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

export const env = createEnv({
  clientPrefix: '',
  client: {},
  emptyStringAsUndefined: true,
  server: {
    databaseUrl: z.string(),
    /** Global TTL for explicitly cached queries; caching is disabled when unset. */
    dbCacheTtlSeconds: z.coerce.number().optional(),
  },
  runtimeEnv: {
    databaseUrl: process.env.API_DATABASE_URL ?? process.env.DATABASE_URL,
    dbCacheTtlSeconds: process.env.DB_CACHE_TTL_SECONDS,
  },
});
