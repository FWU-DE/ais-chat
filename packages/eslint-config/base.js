import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import turboConfig from 'eslint-config-turbo/flat';
import packageJson from 'eslint-plugin-package-json';
import prettier from 'eslint-plugin-prettier';
import simpleImportSort from 'eslint-plugin-simple-import-sort';

/**
 * Base ESLint config for pure TypeScript/Node.js packages.
 */
export default tseslint.config(
  {
    ignores: ['node_modules/**', 'dist/**', 'coverage/**', 'playwright-report/**'],
  },
  {
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
      ...turboConfig,
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        projectService: true,
      },
    },
    plugins: {
      prettier,
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      'prettier/prettier': 'error',
      eqeqeq: ['error', 'always'],
      'simple-import-sort/imports': 'off',
      'simple-import-sort/exports': 'off',
      'turbo/no-undeclared-env-vars': 'warn',
    },
    files: ['**/*.ts'],
  },
  {
    ...packageJson.configs.recommended,
    files: ['package.json'],
    rules: {
      ...packageJson.configs.recommended.rules,
      'package-json/restrict-dependency-ranges': ['error', { rangeType: 'pin' }],
    },
  },
  {
    files: ['**/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
