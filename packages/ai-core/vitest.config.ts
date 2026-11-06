import path from 'node:path';

import { coverageConfigDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@/': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    include: ['**/*.{test,spec}.{js,ts,jsx,tsx}'],

    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**'],

    environment: 'node',

    testTimeout: 5000,

    env: {
      NODE_ENV: 'test',
    },

    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json', 'html'],
      exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**', ...coverageConfigDefaults.exclude],
    },
  },
});
