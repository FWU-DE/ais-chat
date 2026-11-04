import { fixupConfigRules } from '@eslint/compat';
import next from 'eslint-config-next';
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';
import turboConfig from 'eslint-config-turbo/flat';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import packageJson from 'eslint-plugin-package-json';
import prettier from 'eslint-plugin-prettier';
import simpleImportSort from 'eslint-plugin-simple-import-sort';

/**
 * ESLint config for Next.js apps and React packages.
 */
const nextJsConfig = [
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'out/**',
      'build/**',
      'coverage/**',
      'playwright-report/**',
      'next-env.d.ts',
    ],
  },
  // eslint-config-next still ships legacy rule APIs; fixupConfigRules adapts them for ESLint v10.
  ...fixupConfigRules(next),
  ...fixupConfigRules(nextCoreWebVitals),
  ...fixupConfigRules(nextTypescript),
  ...turboConfig,
  {
    files: ['**/*.{js,mjs,cjs,jsx,ts,tsx}'],
    plugins: {
      prettier,
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,
      'prettier/prettier': 'error',
      'turbo/no-undeclared-env-vars': 'warn',
      eqeqeq: ['error', 'always'],
      'simple-import-sort/imports': 'off',
      'simple-import-sort/exports': 'off',
      'react/jsx-no-target-blank': 'error',
    },
  },
  {
    ...packageJson.configs.recommended,
    files: ['package.json'],
    rules: {
      ...packageJson.configs.recommended.rules,
      'package-json/restrict-dependency-ranges': ['error', { rangeType: 'pin' }],
    },
  },
];

export default nextJsConfig;
