import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node24',
  platform: 'node',
  sourcemap: true,
  clean: true,
  splitting: false,
  // Workspace packages ship TypeScript sources, so they are bundled. Third-party
  // dependencies stay external and come from the deployed node_modules.
  noExternal: [/^@ais-chat\//],
});
