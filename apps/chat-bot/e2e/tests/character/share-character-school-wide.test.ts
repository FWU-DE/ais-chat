import { expect, test } from '../../fixtures/test';
import { AUTH_FILES } from '../../utils/const';
import { configureCharacter, createCharacter } from '../../utils/character';
import { waitForAutosave } from '../../utils/utils';
import { nanoid } from 'nanoid';

const characterTeacher = 'Character by teacher - ' + nanoid(8);
const characterTeacher2 = 'Character by teacher2 - ' + nanoid(8);
const characterTeacher3 = 'Character by teacher3 - ' + nanoid(8);

test.describe('share character school-wide', () => {
  test.beforeAll(async ({ browser }) => {
    // Create character as teacher (shared to school1)
    let page = await browser.newPage({ storageState: AUTH_FILES.teacher });
    await createCharacter(page);
    await configureCharacter(page, { name: characterTeacher });
    await page.getByTestId('school-sharing-checkbox').click();
    await waitForAutosave(page);
    await page.close();

    // Create character as teacher2 (shared to school1 & school2)
    page = await browser.newPage({ storageState: AUTH_FILES.teacher2 });
    await createCharacter(page);
    await configureCharacter(page, { name: characterTeacher2 });
    await page.getByTestId('school-sharing-checkbox').click();
    await waitForAutosave(page);
    await page.close();

    // Create character as teacher3 (shared to school2 & school3)
    page = await browser.newPage({ storageState: AUTH_FILES.teacher3 });
    await createCharacter(page);
    await configureCharacter(page, { name: characterTeacher3 });
    await page.getByTestId('school-sharing-checkbox').click();
    await waitForAutosave(page);
    await page.close();
  });

  test.describe('teacher perspective', () => {
    test.use({ storageState: AUTH_FILES.teacher });

    test('teacher sees character shared by teacher2 (same school)', async ({ page }) => {
      await page.goto('/characters?filter=all');
      await page.waitForURL('/characters**');
      await expect(page.getByText(characterTeacher2).first()).toBeVisible();
    });

    test('teacher does not see character shared by teacher3 (different schools)', async ({
      page,
    }) => {
      await page.goto('/characters?filter=all');
      await page.waitForURL('/characters**');
      await expect(page.getByText(characterTeacher3).first()).not.toBeVisible();
    });
  });

  test.describe('teacher2 perspective', () => {
    test.use({ storageState: AUTH_FILES.teacher2 });

    test('teacher2 sees character shared by teacher (shared school)', async ({ page }) => {
      await page.goto('/characters?filter=all');
      await page.waitForURL('/characters**');
      await expect(page.getByText(characterTeacher).first()).toBeVisible();
    });

    test('teacher2 sees character shared by teacher3 (shared school)', async ({ page }) => {
      await page.goto('/characters?filter=all');
      await page.waitForURL('/characters**');
      await expect(page.getByText(characterTeacher3).first()).toBeVisible();
    });
  });

  test.describe('teacher3 perspective', () => {
    test.use({ storageState: AUTH_FILES.teacher3 });

    test('teacher3 sees character shared by teacher2 (shared school)', async ({ page }) => {
      await page.goto('/characters?filter=all');
      await page.waitForURL('/characters**');
      await expect(page.getByText(characterTeacher2).first()).toBeVisible();
    });

    test('teacher3 does not see character shared by teacher (different schools)', async ({
      page,
    }) => {
      await page.goto('/characters?filter=all');
      await page.waitForURL('/characters**');
      await expect(page.getByText(characterTeacher).first()).not.toBeVisible();
    });
  });
});
