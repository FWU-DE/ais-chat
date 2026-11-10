import fs from 'node:fs/promises';
import path from 'node:path';

import { chromium, expect, FullConfig, Page } from '@playwright/test';

import { adminLogin } from './utils/admin-login';
import { selectDifferentModel } from './utils/chat';
import {
  ADMIN_BASE_URL,
  AUTH_FILES,
  EDITOR_AUTH_FILE,
  IMAGE_MODELS_FILE,
  LLM_MODELS_FILE,
} from './utils/const';
import { LLM_MODELS } from './utils/llm-models';
import { login } from './utils/login';

async function readModelsFromDropdown(page: Page, modelType: 'text' | 'image'): Promise<string[]> {
  const selected = page.getByTestId(`main-menu-item-${modelType}-model-selected`);
  await selected.waitFor();
  const selectedModelName = await selected.innerText();

  const dropdown = page.getByTestId(`main-menu-item-${modelType}-model-dropdown`);
  if (!(await dropdown.isVisible())) return selectedModelName ? [selectedModelName] : [];

  const isDisabled = await dropdown.evaluate((el) => (el as HTMLButtonElement).disabled);
  if (isDisabled) return selectedModelName ? [selectedModelName] : [];

  const firstMenuItem = page.getByRole('menuitem').first();
  await expect(async () => {
    if ((await dropdown.getAttribute('aria-expanded')) !== 'true') {
      await dropdown.click();
    }
    await expect(firstMenuItem).toBeVisible({ timeout: 1000 });
  }).toPass();

  const otherModels = await page
    .getByRole('menuitem')
    .evaluateAll((els) =>
      els
        .map((el) => el.getAttribute('data-testid')?.replace(/^menu-item-/, ''))
        .filter((name) => name !== undefined),
    );

  await page.keyboard.press('Escape');

  return [selectedModelName, ...otherModels].filter(Boolean);
}

async function saveLlmModels(page: Page) {
  const allModels = await readModelsFromDropdown(page, 'text');

  await fs.mkdir(path.dirname(LLM_MODELS_FILE), { recursive: true });
  await fs.writeFile(LLM_MODELS_FILE, JSON.stringify(allModels, null, 2));
}

/** Visits the image generation page and saves the display names of all available image models. */
async function saveImageModels(page: Page) {
  await page.goto('/image-generation');
  await page.waitForURL('/image-generation**');

  const allModels = await readModelsFromDropdown(page, 'image');

  await fs.mkdir(path.dirname(IMAGE_MODELS_FILE), { recursive: true });
  await fs.writeFile(IMAGE_MODELS_FILE, JSON.stringify(allModels, null, 2));
}

async function saveAuthState(baseUrl: string) {
  await using browser = await chromium.launch();
  let llmModelsSaved = false;
  let imageModelsSaved = false;

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

    if (!imageModelsSaved) {
      await saveImageModels(page);
      imageModelsSaved = true;
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
 * - Reads available text and image models from the UI dropdowns (menuitem data-testid) and
 *   writes their display names to LLM_MODELS_FILE / IMAGE_MODELS_FILE so tests can discover
 *   them dynamically at load time. This includes the mock models, so the external-services
 *   suite also exercises them alongside real LLMs.
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
