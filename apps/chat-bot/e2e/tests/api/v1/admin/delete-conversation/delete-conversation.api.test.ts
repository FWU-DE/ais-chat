import test, { expect } from '@playwright/test';
import { db } from '@shared/db';
import {
  characterTable,
  federalStateTable,
  fileTable,
  llmModelTable,
  sharedCharacter,
  userTable,
} from '@shared/db/schema';
import { generateInviteCode } from '@shared/sharing/generate-invite-code';
import { addDays } from '@shared/utils/date';
import { generateUUID } from '@shared/utils/uuid';
import { eq } from 'drizzle-orm';
import type { Page } from 'playwright-core';

import { authorizationHeader } from '../../../../../utils/authorizationHeader';
import { sendMessage, uploadFile } from '../../../../../utils/chat';
import { E2E_FEDERAL_STATE } from '../../../../../utils/const';
import { login } from '../../../../../utils/login';

const deleteConversationRoute = '/api/v1/admin/delete-conversation';

test.describe('with chat_storage_time=0', () => {
  let original: number | undefined = undefined;

  test.beforeEach(async ({ page }) => {
    await createGenericChatWithFileAttachment(page);
    original = (
      await db
        .select({ chatStorageTime: federalStateTable.chatStorageTime })
        .from(federalStateTable)
        .where(eq(federalStateTable.id, E2E_FEDERAL_STATE))
    )[0]?.chatStorageTime;

    await db
      .update(federalStateTable)
      .set({ chatStorageTime: 0 })
      .where(eq(federalStateTable.id, E2E_FEDERAL_STATE));
  });

  test.afterEach(async () => {
    await db
      .update(federalStateTable)
      .set({ chatStorageTime: original ?? 90 })
      .where(eq(federalStateTable.id, E2E_FEDERAL_STATE));
  });

  test('should delete old conversations', async ({ request }) => {
    // Delete
    const response = await request.delete(deleteConversationRoute, {
      headers: authorizationHeader,
    });

    expect(response.ok()).toBeTruthy();
    const json = await response.json();
    expect(json.countDeletedConversations).toBeGreaterThanOrEqual(1);
  });
});

test(
  'should return 403 if authorization header is missing',
  { tag: '@smoke' },
  async ({ request }) => {
    const response = await request.delete(deleteConversationRoute);
    expect(response.status()).toBe(403);
  },
);

test('should not delete an uploaded file belonging to an active shared chat', async ({
  request,
}) => {
  const [user] = await db
    .insert(userTable)
    .values({ schoolIds: [], userRole: 'teacher' })
    .returning();
  if (!user) throw new Error('Failed to create user');

  const [model] = await db.select().from(llmModelTable).limit(1);
  if (!model) throw new Error('Failed to find model');

  const [character] = await db
    .insert(characterTable)
    .values({
      name: 'E2E shared character',
      userId: user.id,
      description: '',
      modelId: model.id,
    })
    .returning();
  if (!character) throw new Error('Failed to create character');

  const inviteCode = generateInviteCode();
  await db.insert(sharedCharacter).values({
    characterId: character.id,
    userId: user.id,
    tokenPointsLimit: 1000,
    maxUsageTimeLimit: 1000,
    inviteCode,
    expiredAt: addDays(new Date(), 1),
  });

  const fileId = generateUUID();
  await db.insert(fileTable).values({
    id: fileId,
    name: 'shared-chat-upload.txt',
    size: 0,
    type: 'plain/text',
    metadata: {
      sessionId: generateUUID(),
      inviteCode,
      entityType: 'character',
      entityId: character.id,
    },
  });

  try {
    const response = await request.delete(deleteConversationRoute, {
      headers: authorizationHeader,
    });
    expect(response.ok()).toBeTruthy();

    const remainingFile = await db.select().from(fileTable).where(eq(fileTable.id, fileId));
    expect(remainingFile).toHaveLength(1);
  } finally {
    await db.delete(fileTable).where(eq(fileTable.id, fileId));
    await db.delete(sharedCharacter).where(eq(sharedCharacter.characterId, character.id));
    await db.delete(characterTable).where(eq(characterTable.id, character.id));
    await db.delete(userTable).where(eq(userTable.id, user.id));
  }
});

async function createGenericChatWithFileAttachment(page: Page) {
  await login(page, 'teacher');
  await uploadFile(page, './e2e/fixtures/file-upload/Große Text Datei.txt');
  await sendMessage(page, 'Gib "OK" aus.');
}
