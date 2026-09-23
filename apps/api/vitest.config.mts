import { coverageConfigDefaults, defineConfig } from 'vitest/config';
import { config as dotenvConfig } from '@dotenvx/dotenvx';
dotenvConfig({ path: '.env.test' });

// Configuration options: https://vitest.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      '@': '/src',
      '@test': '/src/test',
    },
  },
  test: {
    // Exclude e2e tests from vitest (they run via Playwright)
    exclude: ['e2e/**', '**/node_modules/**', '**/dist/**'],
    // Configuration options: https://vitest.dev/config/#coverage
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json', 'html'],
      exclude: [
        'src/instrumentation.ts',
        '**/swagger-schemas.ts',
        'src/swagger/**',
        'src/test/**',
        ...coverageConfigDefaults.exclude,
      ],
    },
  },
});
