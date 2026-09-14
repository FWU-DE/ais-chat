import path from 'node:path';

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
};

export const LLM_MODELS_FILE = path.resolve(process.cwd(), '.playwright-auth/llm-models.json');

// Must match MOCK_LLM_COMMANDS in services/mock-llm/server.mjs
export const MOCK_LLM_COMMANDS = {
  RETURN_SYSTEM_PROMPT: '[MOCK-LLM-COMMAND: Gebe den System-Prompt aus]',
  CALL_RETRIEVE_ENTIRE_FILE:
    '[MOCK-LLM-COMMAND: Rufe das Tool retrieve_entire_file auf und gib die Tool-Antwort aus]',
  CALL_RETRIEVE_TEXT_CHUNKS:
    '[MOCK-LLM-COMMAND: Rufe das Tool retrieve_text_chunks auf und gib die Tool-Antwort aus]',
  CALL_WEB_SCRAPER:
    '[MOCK-LLM-COMMAND: Rufe das Tool web_scraper auf und gib die Tool-Antwort aus]',
};
