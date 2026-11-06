import path from 'node:path';

import { coverageConfigDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@/': path.resolve(__dirname, 'src'),
      '@shared': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    include: ['**/*.{test,spec}.{js,ts,jsx,tsx}'],

    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**'],

    environment: 'node',

    testTimeout: 5000,

    env: {
      API_KEY: 'test-api-key',
      API_URL: 'https://test.api.url',
      ENCRYPTION_KEY: 'test-encryption-key-32-characters',
      DATABASE_URL: 'not-needed-for-tests',
      OTC_ACCESS_KEY_ID: 'not-needed-for-tests',
      OTC_BUCKET_NAME: 'not-needed-for-tests',
      OTC_S3_HOSTNAME: 'not-needed-for-tests',
      OTC_SECRET_ACCESS_KEY: 'not-needed-for-tests',
    },

    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json', 'html'],
      exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**', ...coverageConfigDefaults.exclude],
    },
  },
});
