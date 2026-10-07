import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, FullConfig, Page } from '@playwright/test';
import { login } from './utils/login';
import { adminLogin } from './utils/admin-login';
import { ADMIN_BASE_URL, AUTH_FILES, EDITOR_AUTH_FILE, LLM_MODELS_FILE } from './utils/const';
import { selectDifferentModel } from './utils/chat';
import { LLM_MODELS } from './utils/llm-models';

/**
 * Display names of models that exist only for e2e testing purposes and must
 * not appear in the external-services test matrix (which tests real LLMs).
 */
const MOCK_MODEL_DISPLAY_NAMES = new Set<string>([
  LLM_MODELS.TEXT_MODEL_1,
  LLM_MODELS.TEXT_MODEL_2,
]);

async function readModelsFromDropdown(page: Page): Promise<string[]> {
  const dropdown = page.getByTestId(`text-model-dropdown`);

  if (!(await dropdown.isVisible())) return [];

  const selectedModelName = await dropdown.innerText();

  const isDisabled = await dropdown.evaluate((el) => (el as HTMLButtonElement).disabled);
  if (isDisabled) return selectedModelName ? [selectedModelName] : [];

  await dropdown.click();

  const otherModels = await page
    .getByRole('menuitem')
    .evaluateAll((els) =>
      els.map((el) => el.getAttribute('data-testid')).filter((id) => id !== null),
    );

  await page.keyboard.press('Escape');

  return [selectedModelName, ...otherModels].filter(Boolean);
}

async function saveLlmModels(page: Page) {
  const allModels = await readModelsFromDropdown(page);
  const realModels = allModels.filter((name) => !MOCK_MODEL_DISPLAY_NAMES.has(name));

  await fs.mkdir(path.dirname(LLM_MODELS_FILE), { recursive: true });
  await fs.writeFile(LLM_MODELS_FILE, JSON.stringify(realModels, null, 2));
}

async function saveAuthState(baseUrl: string) {
  await using browser = await chromium.launch();
  let llmModelsSaved = false;

  for (const [user, file] of Object.entries(AUTH_FILES)) {
    await fs.mkdir(path.dirname(file), { recursive: true });

    await using context = await browser.newContext({ baseURL: baseUrl });
    const page = await context.newPage();

    await login(page, user);
    await selectDifferentModel(page, LLM_MODELS.TEXT_MODEL_1);

    if (!llmModelsSaved) {
      await saveLlmModels(page);
      llmModelsSaved = true;
    }

    await context.storageState({ path: file });

    await page.close();
  }
}

/**
 * Logs into the admin app as an editor and persists the session so cross-app
 * tests (e.g. community templates) can drive the admin UI without re-authenticating.
 */
async function saveAdminEditorAuthState() {
  await using browser = await chromium.launch();
  await using context = await browser.newContext({ baseURL: ADMIN_BASE_URL });
  const page = await context.newPage();

  await adminLogin(page, 'editor');

  await fs.mkdir(path.dirname(EDITOR_AUTH_FILE), { recursive: true });
  await context.storageState({ path: EDITOR_AUTH_FILE });

  await page.close();
}

/**
 * Global Playwright setup — runs once before all test suites.
 *
 * - Reads available text models from the UI dropdown (menuitem data-testid) and
 *   writes their display names to LLM_MODELS_FILE so tests can discover them
 *   dynamically at load time. Mock models are excluded so that the
 *   external-services suite only tests real LLMs.
 * - For each user defined in AUTH_FILES, performs a real browser login and
 *   saves the resulting storage state under `.playwright-auth/`. Tests restore
 *   this session via `test.use({ storageState: AUTH_FILES.<user> })`, avoiding
 *   repeated VIDIS OAuth flows.
 *
 * Both files are git-ignored and regenerated on every `playwright test` run.
 */
export default async function globalSetup(config: FullConfig) {
  const baseUrl = config.projects[0]?.use.baseURL;
  if (!baseUrl) {
    throw new Error('Playwright globalSetup requires `use.baseURL` to be configured. ');
  }

  await saveAuthState(baseUrl);
  await saveAdminEditorAuthState();
}
