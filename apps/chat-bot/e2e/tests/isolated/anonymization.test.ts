import { expect, test } from '@playwright/test';
import { db } from '@shared/db';
import type { FederalStateFeatureToggles } from '@shared/db/schema';
import { chunkTable, federalStateTable, fileTable } from '@shared/db/schema';
import { desc, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

import { configureCharacter, createCharacter, deleteCharacter } from '../../utils/character';
import { sendMessage, uploadFile } from '../../utils/chat';
import { E2E_FEDERAL_STATE } from '../../utils/const';
import { login } from '../../utils/login';

const featureToggleDefaults = {
  isStudentAccessEnabled: true,
  isCharacterEnabled: true,
  isCustomGptEnabled: true,
  isSharedChatEnabled: true,
  isShareTemplateWithSchoolEnabled: true,
  isImageGenerationEnabled: true,
};

async function setAnonymization(featureToggles: Partial<FederalStateFeatureToggles> = {}) {
  await db
    .update(federalStateTable)
    .set({ featureToggles: { ...featureToggleDefaults, ...featureToggles } })
    .where(eq(federalStateTable.id, E2E_FEDERAL_STATE));
}

test('user message with PII is anonymized when the toggle is enabled', async ({ page }) => {
  await setAnonymization({ isAnonymizationEnabled: true });

  try {
    await login(page, 'teacher');

    // Hint below the chat input is shown when anonymization is active
    await expect(page.getByText('Anonymisierung aktiv')).toBeVisible();

    await sendMessage(
      page,
      'Antworte nur mit OK. Kontakt: maria.muster@schule-beispiel.de oder +49 89 1234567.',
    );

    // Anonymization happens server-side at ingress; the client renders its local copy
    // until the persisted conversation is loaded again
    await page.reload();

    const userMessage = page.getByLabel('user message 1');
    await expect(userMessage).toContainText('[E-MAIL]');
    await expect(userMessage).toContainText('[TELEFONNUMMER]');
    await expect(userMessage).not.toContainText('maria.muster@schule-beispiel.de');
  } finally {
    await setAnonymization();
  }
});

test('person names and locations are anonymized via the Presidio service', async ({ page }) => {
  test.skip(
    !process.env.ANONYMIZATION_SERVICE_URL,
    'requires a running Presidio analyzer (ANONYMIZATION_SERVICE_URL)',
  );

  await setAnonymization({ isAnonymizationEnabled: true });

  try {
    await login(page, 'teacher');
    await sendMessage(page, 'Antworte nur mit OK. Anna Schmidt wohnt in München.');

    await page.reload();

    const userMessage = page.getByLabel('user message 1');
    await expect(userMessage).toContainText('[PERSON]');
    await expect(userMessage).toContainText('[ORT]');
    await expect(userMessage).not.toContainText('Anna Schmidt');
  } finally {
    await setAnonymization();
  }
});

test('pseudonym mode replaces person names with pseudonyms instead of placeholders', async ({
  page,
}) => {
  test.skip(
    !process.env.ANONYMIZATION_SERVICE_URL,
    'requires a running Presidio analyzer (ANONYMIZATION_SERVICE_URL)',
  );

  await setAnonymization({ isAnonymizationEnabled: true, anonymizationMode: 'pseudonym' });

  try {
    await login(page, 'teacher');
    await sendMessage(page, 'Antworte nur mit OK. Anna Schmidt wohnt in München.');

    await page.reload();

    const userMessage = page.getByLabel('user message 1');
    // Locations keep the placeholder; person names get a pseudonym, not a placeholder
    await expect(userMessage).toContainText('[ORT]');
    await expect(userMessage).not.toContainText('[PERSON]');
    await expect(userMessage).not.toContainText('Anna Schmidt');
  } finally {
    await setAnonymization();
  }
});

test('uploaded document text is anonymized before chunking', async ({ page }) => {
  await setAnonymization({ isAnonymizationEnabled: true });

  try {
    await login(page, 'teacher');
    await uploadFile(page, './e2e/fixtures/file-upload/pii-note.txt');

    const [file] = await db
      .select()
      .from(fileTable)
      .where(eq(fileTable.name, 'pii-note.txt'))
      .orderBy(desc(fileTable.createdAt))
      .limit(1);
    expect(file).toBeDefined();

    const chunks = await db.select().from(chunkTable).where(eq(chunkTable.fileId, file!.id));
    const combinedContent = chunks.map((chunk) => chunk.content).join(' ');
    expect(combinedContent).toContain('[E-MAIL]');
    expect(combinedContent).not.toContain('maria.muster@schule-beispiel.de');
  } finally {
    await setAnonymization();
  }
});

test('student messages in a shared character chat are anonymized', async ({ page }) => {
  const characterName = 'Anonymisierungstest ' + nanoid(8);

  await setAnonymization({ isAnonymizationEnabled: true });

  try {
    // Teacher creates and shares a character
    await login(page, 'teacher');
    await createCharacter(page);
    await configureCharacter(page, {
      name: characterName,
      description: 'Testet die Anonymisierung im geteilten Dialog.',
      instructions: 'Antworte kurz.',
      // Leave empty so no static initial message is shown; the mock LLM's echo of the
      // (anonymized) user message becomes "assistant message 1" instead of "message 2".
      initialMessage: '',
    });

    await page.getByTestId('token-points-select').click();
    await page.getByTestId('token-points-option-50').click();
    await page.getByTestId('usage-time-select').click();
    await page.getByTestId('usage-time-option-45').click();
    await page.getByTestId('start-share-button').click();

    await page.waitForURL('/characters/editor/**/share');
    const code = await page.getByTestId('join-code').textContent();

    // Student joins anonymously via invite code
    await page.goto('/logout');
    await page.waitForURL('/login');
    await page.locator('#login-invite-code').fill(code ?? '');
    await page.getByRole('button', { name: 'Zum Dialog' }).click();
    await page.waitForURL('/ua/characters/**/dialog?inviteCode=*');

    await sendMessage(page, 'Meine E-Mail ist maria.muster@schule-beispiel.de');

    // The shared history is kept client-side, so the sent user message still shows the
    // original text. The mock LLM echoes what the server actually sent to the model,
    // which proves the message was anonymized at ingress.
    const assistantMessage = page.getByLabel('assistant message 1');
    await expect(assistantMessage).toContainText('[E-MAIL]');
    await expect(assistantMessage).not.toContainText('maria.muster@schule-beispiel.de');
  } finally {
    await setAnonymization();

    // Cleanup: teacher deletes the shared character
    await login(page, 'teacher');
    await page.goto('/characters');
    await deleteCharacter(page, characterName);
  }
});

test('user message keeps PII when the toggle is disabled', async ({ page }) => {
  await setAnonymization({ isAnonymizationEnabled: false });

  await login(page, 'teacher');

  await expect(page.getByText('Anonymisierung aktiv')).not.toBeVisible();

  await sendMessage(page, 'Antworte nur mit OK. Kontakt: maria.muster@schule-beispiel.de.');

  await page.reload();

  await expect(page.getByLabel('user message 1')).toContainText('maria.muster@schule-beispiel.de');
});
