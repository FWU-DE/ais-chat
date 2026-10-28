import { expect, test } from '../../fixtures/test';
import { AUTH_FILES } from '../../utils/const';
import { configureAssistant } from '../../utils/assistant';
import { nanoid } from 'nanoid';
import { confirmDuplicate } from '../../utils/utils';

test.use({ storageState: AUTH_FILES.teacher });

test('create assistant from template', async ({ page }) => {
  await page.goto('/assistants?filter=all');

  const card = page
    .getByTestId('entity-card')
    .filter({ hasText: 'Schulorganisationsassistent' })
    .first();
  await expect(card).toBeVisible({ timeout: 15000 });
  await card.getByTestId('entity-link').click();
  await page.waitForURL('/assistants/**');

  const copyButton = page.getByTestId('custom-chat-duplicate-button').first();
  await expect(copyButton).toBeVisible({ timeout: 15000 });
  await expect(copyButton).toBeEnabled();
  await copyButton.click();
  await confirmDuplicate(page);
  await page.waitForURL('/assistants/editor/**');

  const assistantName = 'Assistent Individuell ' + nanoid(8);
  await configureAssistant(page, {
    name: assistantName,
    description: 'Individueller Planer für organisatorische Aufgaben an meiner Schule',
    instructions: 'Speziell angepasst für die Bedürfnisse meiner Schule und Klassenstufen.',
  });
  await page.getByTestId('assistant-edit-back-button').click();
  await page.waitForURL('/assistants**');
  await expect(page.locator('body')).toContainText(assistantName);
});
