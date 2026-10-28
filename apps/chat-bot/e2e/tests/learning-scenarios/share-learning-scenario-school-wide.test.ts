import { expect, test } from '../../fixtures/test';
import { AUTH_FILES } from '../../utils/const';
import { configureLearningScenario, createLearningScenario } from '../../utils/learning-scenario';
import { waitForAutosave } from '../../utils/utils';
import { nanoid } from 'nanoid';

const learningScenarioTeacher = 'Scenario by teacher - ' + nanoid(8);
const learningScenarioTeacher2 = 'Scenario by teacher2 - ' + nanoid(8);
const learningScenarioTeacher3 = 'Scenario by teacher3 - ' + nanoid(8);

test.describe('share learning scenario school-wide', () => {
  test.beforeAll(async ({ browser }) => {
    // Create learning scenario as teacher (shared to school1)
    let page = await browser.newPage({ storageState: AUTH_FILES.teacher });
    await createLearningScenario(page);
    await configureLearningScenario(page, { name: learningScenarioTeacher });
    await page.getByTestId('school-sharing-checkbox').click();
    await waitForAutosave(page);
    await page.close();

    // Create learning scenario as teacher2 (shared to school1 & school2)
    page = await browser.newPage({ storageState: AUTH_FILES.teacher2 });
    await createLearningScenario(page);
    await configureLearningScenario(page, { name: learningScenarioTeacher2 });
    await page.getByTestId('school-sharing-checkbox').click();
    await waitForAutosave(page);
    await page.close();

    // Create learning scenario as teacher3 (shared to school2 & school3)
    page = await browser.newPage({ storageState: AUTH_FILES.teacher3 });
    await createLearningScenario(page);
    await configureLearningScenario(page, { name: learningScenarioTeacher3 });
    await page.getByTestId('school-sharing-checkbox').click();
    await waitForAutosave(page);
    await page.close();
  });

  test.describe('teacher perspective', () => {
    test.use({ storageState: AUTH_FILES.teacher });

    test('teacher sees learning scenario shared by teacher2 (same school)', async ({ page }) => {
      await page.goto('/learning-scenarios?filter=all');
      await page.waitForURL('/learning-scenarios**');
      await expect(page.getByText(learningScenarioTeacher2).first()).toBeVisible();
    });

    test('teacher does not see learning scenario shared by teacher3 (different schools)', async ({
      page,
    }) => {
      await page.goto('/learning-scenarios?filter=all');
      await page.waitForURL('/learning-scenarios**');
      await expect(page.getByText(learningScenarioTeacher3).first()).not.toBeVisible();
    });
  });

  test.describe('teacher2 perspective', () => {
    test.use({ storageState: AUTH_FILES.teacher2 });

    test('teacher2 sees learning scenario shared by teacher (shared school)', async ({ page }) => {
      await page.goto('/learning-scenarios?filter=all');
      await page.waitForURL('/learning-scenarios**');
      await expect(page.getByText(learningScenarioTeacher).first()).toBeVisible();
    });

    test('teacher2 sees learning scenario shared by teacher3 (shared school)', async ({ page }) => {
      await page.goto('/learning-scenarios?filter=all');
      await page.waitForURL('/learning-scenarios**');
      await expect(page.getByText(learningScenarioTeacher3).first()).toBeVisible();
    });
  });

  test.describe('teacher3 perspective', () => {
    test.use({ storageState: AUTH_FILES.teacher3 });

    test('teacher3 sees learning scenario shared by teacher2 (shared school)', async ({ page }) => {
      await page.goto('/learning-scenarios?filter=all');
      await page.waitForURL('/learning-scenarios**');
      await expect(page.getByText(learningScenarioTeacher2).first()).toBeVisible();
    });

    test('teacher3 does not see learning scenario shared by teacher (different schools)', async ({
      page,
    }) => {
      await page.goto('/learning-scenarios?filter=all');
      await page.waitForURL('/learning-scenarios**');
      await expect(page.getByText(learningScenarioTeacher).first()).not.toBeVisible();
    });
  });
});
