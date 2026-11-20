import { expect, Page } from '@playwright/test';

import { waitForAutosave } from './utils';

export async function createCharacter(page: Page) {
  await page.goto('/characters');
  await page.waitForURL('/characters');
  const createButton = page.getByTestId('character-create-button');
  await expect(createButton).toBeVisible();
  await createButton.click();
  await page.waitForURL('/characters/editor/**');
}

async function confirmDelete(page: Page) {
  const deleteConfirmButton = page.getByTestId('custom-chat-confirm-button').first();
  await expect(deleteConfirmButton).toBeVisible();
  await deleteConfirmButton.click();
}

export async function deleteCharacter(page: Page, name: string) {
  const card = page.getByTestId('entity-card').filter({ hasText: name }).first();
  await expect(card).toBeVisible({ timeout: 15000 });
  await card.getByTestId('entity-link').click();
  await page.waitForURL('/characters/editor/**');
  await deleteCharacterFromDetailPage(page);
}

export async function deleteCharacterFromDetailPage(page: Page) {
  const deleteButton = page.getByTestId('custom-chat-delete-button').first();
  await expect(deleteButton).toBeVisible();
  await deleteButton.click();
  await confirmDelete(page);
}

export async function configureCharacter(
  page: Page,
  data?: {
    name?: string;
    description?: string;
    initialMessage?: string;
    instructions?: string;
  },
) {
  await page.getByTestId('character-name-input').fill(data?.name ?? 'John Cena');
  await page.getByTestId('character-name-input').press('Tab');

  await page
    .getByTestId('character-description-input')
    .fill(
      data?.description ??
        'Er ist bekannt für seinen Spruch „You can`t see me“ und seine Wrestling-Karriere.',
    );
  await page.getByTestId('character-description-input').press('Tab');

  await page
    .getByTestId('character-initial-message-input')
    .fill(
      data?.initialMessage ??
        'Hallo, ich bin John Cena! Was möchtest du über Wrestling oder meine Karriere wissen?',
    );
  await page.getByTestId('character-initial-message-input').press('Tab');

  await page
    .getByTestId('character-instructions-input')
    .fill(data?.instructions ?? 'John Cena soll über seine Karriere und Erfolge sprechen.');
  await page.getByTestId('character-instructions-input').press('Tab');
  await waitForAutosave(page);
}
