import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as dotenvConfig } from '@dotenvx/dotenvx';

export const chatBotAppDir = fileURLToPath(new URL('../..', import.meta.url));
export const adminAppDir = path.resolve(chatBotAppDir, '../admin');

/**
 * Loads an app's own .env.development (committed) and .env.local (gitignored,
 * optional) in isolation. Used to give each webServer its own app's env
 * instead of leaking whichever app's dotenvx-injected env the top-level
 * `playwright test` process happened to be started with (e.g. running
 * chat-bot's `e2e:ui`, which injects chat-bot's .env.local, would otherwise
 * also leak into the admin webServer and shadow admin-specific values like
 * AUTH_SECRET or PORT).
 */
export function loadAppEnv(appDir: string): Record<string, string> {
  const env: Record<string, string> = {};
  dotenvConfig({
    path: ['.env.local', '.env.development'].map((file) => path.join(appDir, file)),
    processEnv: env,
    quiet: true,
    ignore: ['MISSING_ENV_FILE'],
  });
  return env;
}

export function getAppBaseUrl(appDir: string): string {
  const port = loadAppEnv(appDir).PORT;
  if (!port) throw new Error(`PORT is not set in ${appDir}/.env.development or .env.local`);
  return `http://localhost:${port}`;
}
