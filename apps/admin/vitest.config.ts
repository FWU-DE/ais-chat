import path from 'node:path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
      '@ui': path.resolve(import.meta.dirname, '../../packages/ui/src'),
      '@shared': path.resolve(import.meta.dirname, '../../packages/shared/src'),
    },
  },
  test: {
    environment: 'node',
    exclude: ['**/node_modules/**', '**/e2e/**'],
  },
});
