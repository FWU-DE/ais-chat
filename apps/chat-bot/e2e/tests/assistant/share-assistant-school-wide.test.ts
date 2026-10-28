import { expect, test } from '../../fixtures/test';
import { AUTH_FILES } from '../../utils/const';
import { configureAssistant, createAssistant } from '../../utils/assistant';
import { waitForAutosave } from '../../utils/utils';
import { nanoid } from 'nanoid';

const assistantTeacher = 'Assistant by teacher - ' + nanoid(8);
const assistantTeacher2 = 'Assistant by teacher2 - ' + nanoid(8);
const assistantTeacher3 = 'Assistant by teacher3 - ' + nanoid(8);

test.describe('share assistant school-wide', () => {
  test.beforeAll(async ({ browser }) => {
    // Create assistant as teacher (shared to school1)
    let page = await browser.newPage({ storageState: AUTH_FILES.teacher });
    await createAssistant(page);
    await configureAssistant(page, { name: assistantTeacher });
    await page.getByTestId('school-sharing-checkbox').click();
    await waitForAutosave(page);
    await page.close();

    // Create assistant as teacher2 (shared to school1 & school2)
    page = await browser.newPage({ storageState: AUTH_FILES.teacher2 });
    await createAssistant(page);
    await configureAssistant(page, { name: assistantTeacher2 });
    await configureAssistant(page, {
      name: assistantTeacher2,
      description: 'Created by teacher2',
      instructions: 'Teacher2 assistant',
    });
    await page.getByTestId('school-sharing-checkbox').click();
    await waitForAutosave(page);
    await page.close();

    // Create assistant as teacher3 (shared to school2 & school3)
    page = await browser.newPage({ storageState: AUTH_FILES.teacher3 });
    await createAssistant(page);
    await configureAssistant(page, { name: assistantTeacher3 });
    await configureAssistant(page, {
      name: assistantTeacher3,
      description: 'Created by teacher3',
      instructions: 'Teacher3 assistant',
    });
    await page.getByTestId('school-sharing-checkbox').click();
    await waitForAutosave(page);
    await page.close();
  });

  test.describe('teacher perspective', () => {
    test.use({ storageState: AUTH_FILES.teacher });

    test('teacher sees assistant shared by teacher2 (same school)', async ({ page }) => {
      await page.goto('/assistants?filter=all');
      await page.waitForURL('/assistants**');
      await expect(page.getByText(assistantTeacher2).first()).toBeVisible();
    });

    test('teacher does not see assistant shared by teacher3 (different schools)', async ({
      page,
    }) => {
      await page.goto('/assistants?filter=all');
      await page.waitForURL('/assistants**');
      await expect(page.getByText(assistantTeacher3).first()).not.toBeVisible();
    });
  });

  test.describe('teacher2 perspective', () => {
    test.use({ storageState: AUTH_FILES.teacher2 });

    test('teacher2 sees assistant shared by teacher (shared school)', async ({ page }) => {
      await page.goto('/assistants?filter=all');
      await page.waitForURL('/assistants**');
      await expect(page.getByText(assistantTeacher).first()).toBeVisible();
    });

    test('teacher2 sees assistant shared by teacher3 (shared school)', async ({ page }) => {
      await page.goto('/assistants?filter=all');
      await page.waitForURL('/assistants**');
      await expect(page.getByText(assistantTeacher3).first()).toBeVisible();
    });
  });

  test.describe('teacher3 perspective', () => {
    test.use({ storageState: AUTH_FILES.teacher3 });

    test('teacher3 sees assistant shared by teacher2 (shared school)', async ({ page }) => {
      await page.goto('/assistants?filter=all');
      await page.waitForURL('/assistants**');
      await expect(page.getByText(assistantTeacher2).first()).toBeVisible();
    });

    test('teacher3 does not see assistant shared by teacher (different schools)', async ({
      page,
    }) => {
      await page.goto('/assistants?filter=all');
      await page.waitForURL('/assistants**');
      await expect(page.getByText(assistantTeacher).first()).not.toBeVisible();
    });
  });
});
