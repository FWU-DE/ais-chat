import baseConfig from '../../packages/eslint-config/base.js';

export default [
  ...baseConfig,
  { ignores: ['package.json'] },
  {
    rules: { 'turbo/no-undeclared-env-vars': 'off' },
  },
  {
    files: ['src/**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/require-await': 'off',
    },
  },
];
