import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

// Env variables for S3 storage on OTC
export const env = createEnv({
  clientPrefix: '',
  client: {},
  emptyStringAsUndefined: true,
  server: {
    otcAccessKeyId: z.string(),
    otcBucketName: z.string(),
    otcS3Hostname: z.string(),
    otcS3Region: z.string().default('eu-nl'),
    otcSecretAccessKey: z.string(),
  },
  runtimeEnv: {
    otcAccessKeyId: process.env.OTC_ACCESS_KEY_ID,
    otcBucketName: process.env.OTC_BUCKET_NAME,
    otcS3Hostname: process.env.OTC_S3_HOSTNAME,
    otcS3Region: process.env.OTC_S3_REGION,
    otcSecretAccessKey: process.env.OTC_SECRET_ACCESS_KEY,
  },
});
