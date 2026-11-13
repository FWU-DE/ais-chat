import path from 'node:path';

import type { AiActivityToolName } from '@/types/ai-activity';

import { adminAppDir, getAppBaseUrl } from './app-env';

export const E2E_FEDERAL_STATE = 'DE-TEST';

/**
 * Paths to persisted Playwright authentication state files, one per test user.
 *
 * These files are written by `global-setup.ts` before the test suite runs and
 * contain the browser storage state (cookies + localStorage) of a logged-in
 * session. They are git-ignored and recreated on every `playwright test` run.
 *
 * Usage in test files:
 * ```ts
 * import { AUTH_FILES } from '../utils/const';
 * test.use({ storageState: AUTH_FILES.teacher });
 * ```
 */
export const AUTH_FILES = {
  teacher: path.resolve(process.cwd(), '.playwright-auth/teacher.json'),
  teacher2: path.resolve(process.cwd(), '.playwright-auth/teacher2.json'),
  teacher3: path.resolve(process.cwd(), '.playwright-auth/teacher3.json'),
  teacherWithSettings: path.resolve(process.cwd(), '.playwright-auth/teacher-with-settings.json'),
};

/**
 * Base URL of the admin app, used for cross-app tests (e.g. community templates).
 */
export const ADMIN_BASE_URL = getAppBaseUrl(adminAppDir);

/**
 * Persisted Playwright auth state for an editor session in the admin app.
 * Written by `global-setup.ts`; git-ignored and recreated on every run.
 */
export const EDITOR_AUTH_FILE = path.resolve(process.cwd(), '.playwright-auth/editor.json');

export const LLM_MODELS_FILE = path.resolve(process.cwd(), '.playwright-auth/llm-models.json');

export const IMAGE_MODELS_FILE = path.resolve(process.cwd(), '.playwright-auth/image-models.json');

// Must match MOCK_LLM_COMMANDS in services/mock-llm/server.mjs
export const MOCK_LLM_COMMANDS = {
  RETURN_SYSTEM_PROMPT: '[MOCK-LLM-COMMAND: Gebe den System-Prompt aus]',
  /** Forces a tool call with specific arguments. `toolName` accepts any string, e.g. to test invalid tools. */
  CALL_TOOL: (toolName: AiActivityToolName | (string & {}), args: unknown) =>
    `[MOCK-LLM-COMMAND: Rufe das Tool ${toolName} mit den Argumenten ${JSON.stringify(args)} auf und gib die Tool-Antwort aus]`,
};
