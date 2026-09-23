import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

export const env = createEnv({
  // Empty client prefix means do not expose any variables to the client
  clientPrefix: '',
  client: {},
  emptyStringAsUndefined: true,
  server: {
    // TODO: @AsamMax - "optional" is highly temporary, just to skip some e2e errors
    apiDatabaseUrl: z.string().optional(),
    bifrostApiKey: z.string().optional(),
    bifrostBaseUrl: z.url().optional(),
    maxAgenticIterations: z.coerce.number().int().positive().default(8),
    maxToolCallsPerIteration: z.coerce.number().int().positive().default(8),
  },
  runtimeEnv: {
    apiDatabaseUrl: process.env.API_DATABASE_URL,
    bifrostApiKey: process.env.BIFROST_API_KEY,
    bifrostBaseUrl: process.env.BIFROST_BASE_URL,
    maxAgenticIterations: process.env.MAX_AGENTIC_ITERATIONS,
    maxToolCallsPerIteration: process.env.MAX_TOOL_CALLS_PER_ITERATION,
  },
});
