import { expect, test } from '../../fixtures/test';
import { selectDifferentModel } from '../../utils/chat';
import { AUTH_FILES } from '../../utils/const';
import { LLM_MODELS } from '../../utils/llm-models';

test.use({ storageState: AUTH_FILES.teacher });

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage({ storageState: AUTH_FILES.teacher });

  try {
    // restore default text model
    await page.goto('/');
    await selectDifferentModel(page, LLM_MODELS.TEXT_MODEL_1);
  } finally {
    await page.close();
  }
});

test(
  'lists only text models and marks exactly one default model',
  { tag: '@smoke' },
  async ({ page }) => {
    await page.goto('/models');

    await expect(page.getByTestId(`model-row-${LLM_MODELS.TEXT_MODEL_1}`)).toHaveCount(1);
    await expect(page.getByTestId(`model-row-${LLM_MODELS.TEXT_MODEL_2}`)).toHaveCount(1);
    await expect(page.getByTestId(`model-row-${LLM_MODELS.IMAGE_MODEL}`)).toHaveCount(0);
    await expect(page.getByTestId('model-row-Mock Speech')).toHaveCount(0);
    await expect(page.getByTestId('model-default-tag')).toHaveCount(1);
  },
);

test('selecting a model persists and updates the header', { tag: '@smoke' }, async ({ page }) => {
  await page.goto('/');
  const selectedInHeader = page.getByTestId('main-menu-item-text-model-selected');
  const headerModel = await selectedInHeader.innerText();

  await page.goto('/models');
  await expect(page.getByTestId(`model-radio-${headerModel}`)).toBeChecked();

  const modelUpdate = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/user/model') && response.request().method() === 'POST',
  );
  const modelRadio = page.getByTestId(`model-radio-${LLM_MODELS.TEXT_MODEL_2}`);
  await modelRadio.click();
  expect((await modelUpdate).ok()).toBe(true);
  await expect(modelRadio).toBeChecked();

  await page.reload();
  await expect(modelRadio).toBeChecked();

  await page.goto('/');
  await expect(selectedInHeader).toHaveText(LLM_MODELS.TEXT_MODEL_2);
});

test(
  'shows the model picked in the header after navigating via the sidebar',
  { tag: '@smoke' },
  async ({ page }) => {
    await page.goto('/');
    await selectDifferentModel(page, LLM_MODELS.TEXT_MODEL_2);

    await page.getByTestId('sidebar-models').click();

    await expect(page).toHaveURL(/\/models$/);
    await expect(page.getByTestId(`model-radio-${LLM_MODELS.TEXT_MODEL_2}`)).toBeChecked();
  },
);

test('sorts the rows when clicking a column header', { tag: '@smoke' }, async ({ page }) => {
  await page.goto('/models');

  const names = page.getByTestId('model-name');
  await expect(names.first()).toBeVisible();
  const ascending = await names.allInnerTexts();
  expect(ascending).toEqual(
    [...ascending].sort((a, b) => a.localeCompare(b, 'de', { sensitivity: 'base' })),
  );

  await page.getByTestId('models-sort-name').click();

  expect(await names.allInnerTexts()).toEqual([...ascending].reverse());
});
