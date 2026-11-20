import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const env = createEnv({
  emptyStringAsUndefined: true,
  server: {
    chatBotBaseUrl: z.url(),
  },
  runtimeEnv: {
    chatBotBaseUrl: process.env.CHAT_BOT_BASE_URL,
  },
});
