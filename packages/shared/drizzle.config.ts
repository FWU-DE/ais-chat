import { defineConfig } from 'drizzle-kit';

import { env } from './src/db/env';

const databaseUrl = env.databaseUrl;

if (databaseUrl === undefined) {
  throw new Error('Expected process.env.DATABASE_URL to be defined');
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './migrations',
  dbCredentials: {
    url: databaseUrl,
  },
  dialect: 'postgresql',
  verbose: true,
  strict: true,
});
