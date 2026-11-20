import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

export const env = createEnv({
  clientPrefix: 'NEXT_PUBLIC_',
  client: {
    NEXT_PUBLIC_SENTRY_LOG_LEVEL: z
      .union([
        z.literal('fatal'),
        z.literal('error'),
        z.literal('warning'),
        z.literal('log'),
        z.literal('info'),
        z.literal('debug'),
      ])
      .default('info'),
  },
  emptyStringAsUndefined: true,
  server: {
    LOG_TO_STDOUT: z.stringbool().default(false),
  },
  runtimeEnv: {
    NEXT_PUBLIC_SENTRY_LOG_LEVEL: process.env.NEXT_PUBLIC_SENTRY_LOG_LEVEL,
    LOG_TO_STDOUT: process.env.LOG_TO_STDOUT,
  },
});
