import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

export const env = createEnv({
  // Empty client prefix means do not expose any variables to the client
  clientPrefix: '',
  client: {},
  emptyStringAsUndefined: true,
  server: {
    apiKey: z.string(),
    apiUrl: z.string(),
    encryptionKey: z.string(),
    rabbitmqUri: z.string().optional(),
  },
  runtimeEnv: {
    apiKey: process.env.API_KEY,
    apiUrl: process.env.API_URL,
    encryptionKey: process.env.ENCRYPTION_KEY,
    rabbitmqUri: process.env.RABBITMQ_URI,
  },
});
