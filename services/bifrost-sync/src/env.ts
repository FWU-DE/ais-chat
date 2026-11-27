import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

// Variable names avoid the patterns Kubernetes service links inject for the services `bifrost` and
// `bifrost-sync` (`BIFROST_PORT=tcp://…`, `BIFROST_SYNC_PORT=…`). Set `enableServiceLinks: false`.
export const env = createEnv({
  clientPrefix: '',
  client: {},
  emptyStringAsUndefined: true,
  server: {
    bifrostSyncToken: z.string().min(16),
    bifrostAdminUsername: z.string(),
    bifrostAdminPassword: z.string(),
    namespace: z.string().optional(),
    deploymentName: z.string(),
    podSelector: z.string(),
    podPort: z.coerce.number().int().default(8080),
    stateConfigMap: z.string().default('bifrost-sync-state'),
    rolloutTimeoutMs: z.coerce.number().int().default(600_000),
    restartRetryDelayMs: z.coerce.number().int().default(2000),
    pollMs: z.coerce.number().int().default(2000),
    logLevel: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    host: z.string().default('0.0.0.0'),
    port: z.coerce.number().int().default(8080),
  },
  runtimeEnv: {
    bifrostSyncToken: process.env.BIFROST_SYNC_TOKEN,
    bifrostAdminUsername: process.env.BIFROST_ADMIN_USERNAME,
    bifrostAdminPassword: process.env.BIFROST_ADMIN_PASSWORD,
    namespace: process.env.NAMESPACE,
    deploymentName: process.env.DEPLOYMENT_NAME,
    podSelector: process.env.POD_SELECTOR,
    podPort: process.env.POD_PORT,
    stateConfigMap: process.env.STATE_CONFIGMAP,
    rolloutTimeoutMs: process.env.ROLLOUT_TIMEOUT_MS,
    restartRetryDelayMs: process.env.RESTART_RETRY_DELAY_MS,
    pollMs: process.env.POLL_MS,
    logLevel: process.env.LOG_LEVEL,
    host: process.env.HOST,
    port: process.env.PORT,
  },
});
