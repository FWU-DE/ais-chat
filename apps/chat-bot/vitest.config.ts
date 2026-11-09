import fs from 'node:fs';

import { config as dotenvConfig } from '@dotenvx/dotenvx';
import react from '@vitejs/plugin-react';
import path from 'path';
import { coverageConfigDefaults, defineConfig } from 'vitest/config';

const envTestPath = path.resolve(__dirname, '.env.test');
const envLocalPath = path.resolve(__dirname, '.env.local');

if (fs.existsSync(envTestPath)) {
  dotenvConfig({ path: envTestPath });
} else {
  dotenvConfig({ path: envLocalPath });
}

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@ui': path.resolve(__dirname, '../../packages/ui/src'),
      '@shared': path.resolve(__dirname, '../../packages/shared/src'),
    },
  },
  test: {
    include: ['**/*.{test,spec}.{js,ts,jsx,tsx}'],

    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**'],

    environment: 'node',

    testTimeout: 5000,

    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json', 'html'],
      exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**', ...coverageConfigDefaults.exclude],
    },
  },
});
