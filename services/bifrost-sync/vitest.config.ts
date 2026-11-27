import { coverageConfigDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json', 'html'],
      // `index.ts` wires the process (signals, exit) and runs only in a cluster.
      exclude: ['src/test/**', 'src/index.ts', ...coverageConfigDefaults.exclude],
    },
  },
});
