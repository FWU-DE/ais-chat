import test, { expect } from '@playwright/test';
import { authorizationHeader } from '../../../../../utils/authorizationHeader';
import { db } from '@shared/db';
import {
  CharacterFileMapping,
  characterTable,
  chunkTable,
  AssistantFileMapping,
  assistantTable,
  conversationMessageTable,
  conversationTable,
  fileTable,
  LearningScenarioFileMapping,
  learningScenarioTable,
  llmModelTable,
  userTable,
} from '@shared/db/schema';
import { addDays } from '@shared/utils/date';
import { eq } from 'drizzle-orm';
import { generateUUID } from '@shared/utils/uuid';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

const cleanupRoute = '/api/v1/admin/cleanup';

test.describe('cleanup', () => {
  let userId = '';
  let modelId = '';

  // cleanup tests must not run in parallel as they all call the same cleanup endpoint
  test.describe.configure({ mode: 'default' });

  test.beforeEach(async () => {
    await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(userTable)
        .values({ schoolIds: [], userRole: 'student' })
        .returning();
      if (!user) {
        throw new Error('Failed to create user');
      }
      userId = user.id;

      const [model] = await tx.select().from(llmModelTable).limit(1);
      if (!model) {
        throw new Error('Failed to find model');
      }
      modelId = model.id;
    });
  });

  test.afterEach(async () => {
    await db.transaction(async (tx) => {
      await tx.delete(learningScenarioTable).where(eq(learningScenarioTable.userId, userId));
      await tx.delete(characterTable).where(eq(characterTable.userId, userId));
      await tx.delete(assistantTable).where(eq(assistantTable.userId, userId));
      await tx.delete(userTable).where(eq(userTable.id, userId));
    });
  });

  test('should delete learning scenarios', async ({ request }) => {
    const oldLearningScenario = await createLearningScenario({
      userId,
      modelId,
      createdAt: new Date(2025, 0, 1),
    });
    const newLearningScenario = await createLearningScenario({
      userId,
      modelId,
      createdAt: new Date(),
    });

    // Delete
    const response = await request.delete(cleanupRoute, { headers: authorizationHeader });

    expect(response.ok()).toBeTruthy();
    const json = await response.json();
    expect(json.deletedLearningScenarios).toBeGreaterThanOrEqual(1);

    const resultDeleted = await db
      .select()
      .from(learningScenarioTable)
      .where(eq(learningScenarioTable.id, oldLearningScenario.id));
    expect(resultDeleted).toHaveLength(0);

    const resultExisting = await db
      .select()
      .from(learningScenarioTable)
      .where(eq(learningScenarioTable.id, newLearningScenario.id));
    expect(resultExisting).toHaveLength(1);
  });

  test('should delete characters', async ({ request }) => {
    const oldCharacter = await createCharacter({
      userId,
      modelId,
      createdAt: new Date(2025, 0, 1),
    });
    const newCharacter = await createCharacter({
      userId,
      modelId,
      createdAt: new Date(),
    });

    // Delete
    const response = await request.delete(cleanupRoute, { headers: authorizationHeader });

    expect(response.ok()).toBeTruthy();
    const json = await response.json();
    expect(json.deletedCharacters).toBeGreaterThanOrEqual(1);

    const resultDeleted = await db
      .select()
      .from(characterTable)
      .where(eq(characterTable.id, oldCharacter.id));
    expect(resultDeleted).toHaveLength(0);

    const conversationDeleted = await db
      .select()
      .from(conversationTable)
      .where(eq(conversationTable.characterId, oldCharacter.id));
    expect(conversationDeleted).toHaveLength(0);

    const resultExisting = await db
      .select()
      .from(characterTable)
      .where(eq(characterTable.id, newCharacter.id));
    expect(resultExisting).toHaveLength(1);
  });

  test('should delete assistants', async ({ request }) => {
    const oldAssistant = await createAssistant({
      userId,
      createdAt: new Date(2025, 0, 1),
    });
    const newAssistant = await createAssistant({
      userId,
      createdAt: new Date(),
    });

    // Delete
    const response = await request.delete(cleanupRoute, { headers: authorizationHeader });

    expect(response.ok()).toBeTruthy();
    const json = await response.json();
    expect(json.deletedAssistants).toBeGreaterThanOrEqual(1);

    const resultDeleted = await db
      .select()
      .from(assistantTable)
      .where(eq(assistantTable.id, oldAssistant.id));
    expect(resultDeleted).toHaveLength(0);

    const conversationDeleted = await db
      .select()
      .from(conversationTable)
      .where(eq(conversationTable.assistantId, oldAssistant.id));
    expect(conversationDeleted).toHaveLength(0);

    const resultExisting = await db
      .select()
      .from(assistantTable)
      .where(eq(assistantTable.id, newAssistant.id));
    expect(resultExisting).toHaveLength(1);
  });

  test('should delete web chunks older than 30 days', async ({ request }) => {
    const oldChunk = await createWebChunk(addDays(new Date(), -31));
    const newChunk = await createWebChunk(new Date());

    // Delete
    const response = await request.delete(cleanupRoute, { headers: authorizationHeader });

    expect(response.ok()).toBeTruthy();
    const json = await response.json();
    expect(json.deletedWebChunks).toBeGreaterThanOrEqual(1);

    const resultDeleted = await db.select().from(chunkTable).where(eq(chunkTable.id, oldChunk.id));
    expect(resultDeleted).toHaveLength(0);

    const resultExisting = await db.select().from(chunkTable).where(eq(chunkTable.id, newChunk.id));
    expect(resultExisting).toHaveLength(1);
  });
});

test(
  'should return 403 if authorization header is missing',
  { tag: '@smoke' },
  async ({ request }) => {
    const response = await request.delete(cleanupRoute);
    expect(response.status()).toBe(403);
  },
);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const learningScenarioInsertSchema = createInsertSchema(learningScenarioTable).omit({
  webSearchScope: true,
});
async function createLearningScenario(
  data?: Partial<z.infer<typeof learningScenarioInsertSchema>>,
) {
  const [learningScenario] = await db
    .insert(learningScenarioTable)
    .values({
      name: '',
      userId: generateUUID(),
      modelId: generateUUID(),
      ...data,
    })
    .returning();
  if (!learningScenario) {
    throw new Error('failed to create learning scenario');
  }

  const fileId = await createFile();
  await db
    .insert(LearningScenarioFileMapping)
    .values({ learningScenarioId: learningScenario.id, fileId });

  return learningScenario;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const characterInsertSchema = createInsertSchema(characterTable).omit({
  webSearchScope: true,
});
async function createCharacter(data?: Partial<z.infer<typeof characterInsertSchema>>) {
  const userId = data?.userId ?? generateUUID();
  const [character] = await db
    .insert(characterTable)
    .values({
      name: '',
      userId,
      description: '',
      modelId: generateUUID(),
      ...data,
    })
    .returning();
  if (!character) {
    throw new Error('failed to create character');
  }

  const fileId = await createFile();
  await db.insert(CharacterFileMapping).values({ characterId: character.id, fileId });

  await createConversationWithMessage({ userId, characterId: character.id });

  return character;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const assistantInsertSchema = createInsertSchema(assistantTable).omit({
  webSearchScope: true,
  webSearchIncludedDomains: true,
});
async function createAssistant(data?: Partial<z.infer<typeof assistantInsertSchema>>) {
  const userId = data?.userId ?? generateUUID();
  const [assistant] = await db
    .insert(assistantTable)
    .values({
      name: '',
      systemPrompt: '',
      userId,
      ...data,
    })
    .returning();
  if (!assistant) {
    throw new Error('failed to create assistant');
  }

  const fileId = await createFile();
  await db.insert(AssistantFileMapping).values({ assistantId: assistant.id, fileId });

  await createConversationWithMessage({ userId, assistantId: assistant.id });

  return assistant;
}

async function createConversationWithMessage({
  userId,
  characterId,
  assistantId,
}: {
  userId: string;
  characterId?: string;
  assistantId?: string;
}) {
  const [conversation] = await db
    .insert(conversationTable)
    .values({ userId, characterId, assistantId })
    .returning();
  if (!conversation) {
    throw new Error('failed to create conversation');
  }

  await db.insert(conversationMessageTable).values({
    content: 'test message',
    conversationId: conversation.id,
    modelName: 'test-model',
    userId,
    role: 'user',
    orderNumber: 0,
  });
}

async function createFile() {
  const fileId = generateUUID();
  await db.insert(fileTable).values({ id: fileId, name: '', size: 0, type: 'plain/text' });
  return fileId;
}

async function createWebChunk(createdAt: Date) {
  const [chunk] = await db
    .insert(chunkTable)
    .values({
      content: '',
      embedding: Array(1024).fill(0),
      orderIndex: 0,
      sourceType: 'webpage',
      sourceUrl: `https://example.com/${generateUUID()}`,
      createdAt: createdAt,
    })
    .returning();
  if (!chunk) {
    throw new Error('failed to create web chunk');
  }
  return chunk;
}
