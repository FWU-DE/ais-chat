import { config } from '@dotenvx/dotenvx';
import path from 'node:path';

// Unlike Next.js (chat-bot/admin), Fastify does not auto-load .env files.
// This must be imported before any other module that reads process.env.
// In production, environment variables are provided by the runtime (e.g. Docker).
if (process.env.NODE_ENV !== 'production') {
  // Load defaults for the current NODE_ENV first (e.g. .env.development), then
  // .env.local with override so it takes precedence, mirroring Next.js's own
  // .env.local > .env.$(NODE_ENV) precedence. Defaults to 'development' when
  // NODE_ENV is unset to avoid trying to load a nonsensical ".env.undefined".
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  config({ path: path.resolve(import.meta.dirname, '..', `.env.${nodeEnv}`) });
  config({
    path: path.resolve(import.meta.dirname, '..', '.env.local'),
    override: true,
  });
}

// Default API_DATABASE_URL to DATABASE_URL so operators only need to configure
// one variable when both point to the same database.
if (!process.env.API_DATABASE_URL && process.env.DATABASE_URL) {
  process.env.API_DATABASE_URL = process.env.DATABASE_URL;
}
