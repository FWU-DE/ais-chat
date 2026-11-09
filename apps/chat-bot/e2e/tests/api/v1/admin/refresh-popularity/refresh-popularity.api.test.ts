import test, { expect } from '@playwright/test';
import { db } from '@shared/db';
import { USAGE_WINDOW_DAYS } from '@shared/db/functions/popularity';
import {
  assistantTable,
  characterTable,
  conversationTable,
  conversationUsageTracking,
  learningScenarioTable,
  llmModelTable,
  sharedCharacterChatUsageTrackingTable,
  sharedLearningScenarioUsageTracking,
  userTable,
} from '@shared/db/schema';
import { addDays } from '@shared/utils/date';
import { generateUUID } from '@shared/utils/uuid';
import { eq, inArray } from 'drizzle-orm';

import { authorizationHeader } from '../../../../../utils/authorizationHeader';

const refreshRoute = '/api/v1/admin/refresh-popularity';

type PopularityTable = typeof assistantTable | typeof characterTable | typeof learningScenarioTable;

test(
  'should return 403 if authorization header is missing',
  { tag: '@smoke' },
  async ({ request }) => {
    const response = await request.post(refreshRoute);
    expect(response.status()).toBe(403);
  },
);

test.describe('refresh popularity', () => {
  // all tests refresh the same tables, so they must not run in parallel
  test.describe.configure({ mode: 'default' });

  let userId = '';
  let modelId = '';
  let assistantId = '';
  let characterId = '';
  let learningScenarioId = '';
  const deletedEntityId = generateUUID();

  test.beforeEach(async () => {
    const [user] = await db
      .insert(userTable)
      .values({ schoolIds: [], userRole: 'teacher' })
      .returning();
    const [model] = await db.select().from(llmModelTable).limit(1);
    if (!user || !model) {
      throw new Error('Failed to create user or find model');
    }
    userId = user.id;
    modelId = model.id;

    const [assistant] = await db
      .insert(assistantTable)
      .values({ name: 'popularity assistant', systemPrompt: '', userId })
      .returning();
    const [character] = await db
      .insert(characterTable)
      .values({ name: 'popularity character', description: '', userId, modelId })
      .returning();
    const [learningScenario] = await db
      .insert(learningScenarioTable)
      .values({ name: 'popularity learning scenario', userId, modelId })
      .returning();
    if (!assistant || !character || !learningScenario) {
      throw new Error('Failed to create entities');
    }
    assistantId = assistant.id;
    characterId = character.id;
    learningScenarioId = learningScenario.id;
  });

  test.afterEach(async () => {
    const entityIds = [assistantId, characterId, learningScenarioId, deletedEntityId];
    await db
      .delete(sharedCharacterChatUsageTrackingTable)
      .where(inArray(sharedCharacterChatUsageTrackingTable.characterId, entityIds));
    await db
      .delete(sharedLearningScenarioUsageTracking)
      .where(inArray(sharedLearningScenarioUsageTracking.learningScenarioId, entityIds));
    await db.delete(conversationUsageTracking).where(eq(conversationUsageTracking.userId, userId));
    await db.delete(conversationTable).where(eq(conversationTable.userId, userId));
    await db.delete(learningScenarioTable).where(eq(learningScenarioTable.userId, userId));
    await db.delete(characterTable).where(eq(characterTable.userId, userId));
    await db.delete(assistantTable).where(eq(assistantTable.userId, userId));
    await db.delete(userTable).where(eq(userTable.id, userId));
  });

  test('should sum usage within the usage window per entity', async ({ request }) => {
    const recent = new Date();
    const old = addDays(new Date(), -(USAGE_WINDOW_DAYS + 1));

    // assistant: 2 rows, one of them in a soft-deleted conversation, plus 1 row outside the window
    const assistantConversation = await createConversation({ assistantId });
    const deletedAssistantConversation = await createConversation({
      assistantId,
      deletedAt: new Date(),
    });
    await addConversationUsage(assistantConversation, 1, recent);
    await addConversationUsage(deletedAssistantConversation, 1, recent);
    await addConversationUsage(assistantConversation, 1, old);

    // character: teacher and shared chat usage add up
    const characterConversation = await createConversation({ characterId });
    await addConversationUsage(characterConversation, 2, recent);
    await addSharedCharacterUsage(characterId, 3, recent);
    await addSharedCharacterUsage(characterId, 1, old);

    // learning scenario: teacher and shared chat usage add up
    const learningScenarioConversation = await createConversation({ learningScenarioId });
    await addConversationUsage(learningScenarioConversation, 1, recent);
    await addSharedLearningScenarioUsage(learningScenarioId, 2, recent);

    const response = await request.post(refreshRoute, { headers: authorizationHeader });

    expect(response.ok()).toBeTruthy();
    const json = await response.json();
    expect(json.assistantsUpdated).toBeGreaterThanOrEqual(1);
    expect(json.charactersUpdated).toBeGreaterThanOrEqual(1);
    expect(json.learningScenariosUpdated).toBeGreaterThanOrEqual(1);
    expect(json.durationMs).toBeGreaterThanOrEqual(0);

    expect(await getPopularity(assistantTable, assistantId)).toBe(2);
    expect(await getPopularity(characterTable, characterId)).toBe(5);
    expect(await getPopularity(learningScenarioTable, learningScenarioId)).toBe(3);
  });

  test('should keep 0 for entities without usage in the window', async ({ request }) => {
    const conversation = await createConversation({ assistantId });
    await addConversationUsage(conversation, 1, addDays(new Date(), -(USAGE_WINDOW_DAYS + 1)));

    const response = await request.post(refreshRoute, { headers: authorizationHeader });

    expect(response.ok()).toBeTruthy();
    expect(await getPopularity(assistantTable, assistantId)).toBe(0);
  });

  test('should reset a stale value to 0', async ({ request }) => {
    await db
      .update(assistantTable)
      .set({ popularity: 99 })
      .where(eq(assistantTable.id, assistantId));

    const response = await request.post(refreshRoute, { headers: authorizationHeader });

    expect(response.ok()).toBeTruthy();
    expect(await getPopularity(assistantTable, assistantId)).toBe(0);
  });

  test('should not change updated_at', async ({ request }) => {
    const updatedAt = new Date('2026-01-01T10:00:00.000Z');
    await db.update(assistantTable).set({ updatedAt }).where(eq(assistantTable.id, assistantId));
    await db.update(characterTable).set({ updatedAt }).where(eq(characterTable.id, characterId));
    await db
      .update(learningScenarioTable)
      .set({ updatedAt })
      .where(eq(learningScenarioTable.id, learningScenarioId));
    await addConversationUsage(await createConversation({ assistantId }), 1, new Date());
    await addSharedCharacterUsage(characterId, 1, new Date());
    await addSharedLearningScenarioUsage(learningScenarioId, 1, new Date());

    const response = await request.post(refreshRoute, { headers: authorizationHeader });

    expect(response.ok()).toBeTruthy();
    expect(await getPopularity(assistantTable, assistantId)).toBe(1);
    expect(await getPopularity(characterTable, characterId)).toBe(1);
    expect(await getPopularity(learningScenarioTable, learningScenarioId)).toBe(1);
    expect(await getUpdatedAt(assistantTable, assistantId)).toEqual(updatedAt);
    expect(await getUpdatedAt(characterTable, characterId)).toEqual(updatedAt);
    expect(await getUpdatedAt(learningScenarioTable, learningScenarioId)).toEqual(updatedAt);
  });

  test('should ignore usage of deleted entities', async ({ request }) => {
    // shared chat usage is kept after the entity is deleted
    await addSharedCharacterUsage(deletedEntityId, 2, new Date());
    await addSharedLearningScenarioUsage(deletedEntityId, 2, new Date());

    // soft-deleted entities are retained but not updated
    await db
      .update(assistantTable)
      .set({ isDeleted: true })
      .where(eq(assistantTable.id, assistantId));
    await addConversationUsage(await createConversation({ assistantId }), 2, new Date());

    const response = await request.post(refreshRoute, { headers: authorizationHeader });

    expect(response.ok()).toBeTruthy();
    expect(await getPopularity(characterTable, deletedEntityId)).toBeUndefined();
    expect(await getPopularity(learningScenarioTable, deletedEntityId)).toBeUndefined();
    expect(await getPopularity(assistantTable, assistantId)).toBe(0);
  });

  async function createConversation(data: {
    assistantId?: string;
    characterId?: string;
    learningScenarioId?: string;
    deletedAt?: Date;
  }) {
    const [conversation] = await db
      .insert(conversationTable)
      .values({ userId, ...data })
      .returning();
    if (!conversation) {
      throw new Error('Failed to create conversation');
    }
    return conversation.id;
  }

  async function addConversationUsage(conversationId: string, count: number, createdAt: Date) {
    await db.insert(conversationUsageTracking).values(
      Array.from({ length: count }, () => ({
        modelId,
        conversationId,
        userId,
        completionTokens: 1,
        promptTokens: 1,
        createdAt,
      })),
    );
  }

  async function addSharedCharacterUsage(id: string, count: number, createdAt: Date) {
    await db.insert(sharedCharacterChatUsageTrackingTable).values(
      Array.from({ length: count }, () => ({
        modelId,
        characterId: id,
        userId,
        completionTokens: 1,
        promptTokens: 1,
        createdAt,
      })),
    );
  }

  async function addSharedLearningScenarioUsage(id: string, count: number, createdAt: Date) {
    await db.insert(sharedLearningScenarioUsageTracking).values(
      Array.from({ length: count }, () => ({
        modelId,
        learningScenarioId: id,
        userId,
        completionTokens: 1,
        promptTokens: 1,
        createdAt,
      })),
    );
  }

  async function getPopularity(table: PopularityTable, id: string) {
    const [row] = await db
      .select({ popularity: table.popularity })
      .from(table)
      .where(eq(table.id, id));
    return row?.popularity;
  }

  async function getUpdatedAt(table: PopularityTable, id: string) {
    const [row] = await db
      .select({ updatedAt: table.updatedAt })
      .from(table)
      .where(eq(table.id, id));
    return row?.updatedAt;
  }
});
