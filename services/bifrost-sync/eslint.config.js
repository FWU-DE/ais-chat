import baseConfig from '@ais-chat/eslint-config/base';

export default [
  ...baseConfig,
  { ignores: ['package.json'] },
  {
    rules: { 'turbo/no-undeclared-env-vars': 'off' },
  },
  {
    files: ['src/**/*.test.ts', 'src/test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
    },
  },
];
