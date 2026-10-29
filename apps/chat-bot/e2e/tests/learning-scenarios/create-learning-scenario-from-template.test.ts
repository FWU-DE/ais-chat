import { expect, test } from '../../fixtures/test';
import { AUTH_FILES } from '../../utils/const';
import { confirmDuplicate, waitForAutosave } from '../../utils/utils';
import { nanoid } from 'nanoid';
import { configureLearningScenario } from '../../utils/learning-scenario';

test.use({ storageState: AUTH_FILES.teacher });

test('create learning scenario from template', async ({ page }) => {
  await page.goto('/learning-scenarios?filter=all');

  const card = page.getByTestId('entity-card').filter({ hasText: 'Lern was über KI' }).first();
  await expect(card).toBeVisible();
  await card.getByTestId('entity-link').click();
  // Non-owned scenarios now route to read-only view instead of editor
  await page.waitForURL('/learning-scenarios/**');

  const duplicateButton = page.getByTestId('custom-chat-duplicate-button').first();
  await expect(duplicateButton).toBeVisible();
  await expect(duplicateButton).toBeEnabled();
  await duplicateButton.click();
  await confirmDuplicate(page);
  // After duplicating, should be redirected to the editor of the new scenario
  await page.waitForURL('/learning-scenarios/editor/**');

  const name = 'Kopiertes Lernszenario ' + nanoid(8);

  // Fill in other required fields (the new form auto-saves)
  await configureLearningScenario(page, {
    name,
    description: 'Beschreibung',
    additionalInstructions: 'Instruktionen',
    studentExercise: 'Arbeitsauftrag',
  });

  // Wait for autosave to complete
  await waitForAutosave(page);

  // Navigate back to learning scenarios list to verify creation
  await page.goto('/learning-scenarios');
  await expect(page.locator('body')).toContainText(name);
});
