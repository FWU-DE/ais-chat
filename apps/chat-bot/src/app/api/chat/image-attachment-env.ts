import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

// Isolated env schema so reading this single var doesn't trigger validation of all chat-bot server env vars.
export const env = createEnv({
  emptyStringAsUndefined: true,
  server: {
    imageAttachmentMode: z.enum(['url', 'base64']).default('url'),
  },
  runtimeEnv: {
    imageAttachmentMode: process.env.IMAGE_ATTACHMENT_MODE,
  },
});
