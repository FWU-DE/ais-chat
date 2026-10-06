import test, { expect } from '@playwright/test';
import { db } from '@shared/db';
import {
  CharacterWithShareDataModel,
  conversationUsageTracking,
  LearningScenarioWithShareDataModel,
  llmModelTable,
  sharedCharacterChatUsageTrackingTable,
  sharedLearningScenarioUsageTracking,
  userTable,
} from '@shared/db/schema';
import {
  dbGetSharedCharacterChatUsageInCentByCharacterId,
  dbGetLearningScenarioChatUsageInCentByLearningScenarioId,
} from '@shared/db/functions/token-points';
import {
  mockCharacter,
  mockConversationUsage,
  mockLearningScenario,
  mockLlmModel,
  mockSharedCharacterChatUsage,
  mockSharedSchoolConversationUsage,
  mockUserAndContext,
} from '../../../../utils/mock';
import { generateRandomString } from '../../../../utils/random';
import { getUsedBudgetInCentByUser } from '@shared/users/user-budget-service';
import {
  sharedCharacterChatHasReachedTokenPointsLimit,
  sharedLearningScenarioChatHasReachedTokenPointsLimit,
} from '@shared/users/usage';

test.describe('costs', () => {
  test('should calculate total price from all three usage tracking tables', async () => {
    const user = mockUserAndContext();

    const model = mockLlmModel();
    await db.insert(llmModelTable).values(model);

    for (let i = 0; i < 2; i++) {
      const conversationUsage = {
        ...mockConversationUsage(),
        userId: user.id,
        modelId: model.id,
        costsInCent: 150,
      };

      const sharedSchoolConversationUsage = {
        ...mockSharedSchoolConversationUsage(),
        userId: user.id,
        modelId: model.id,
        costsInCent: 200,
      };

      const sharedCharacterChatUsage = {
        ...mockSharedCharacterChatUsage(),
        userId: user.id,
        modelId: model.id,
        costsInCent: 300,
      };

      await db.insert(conversationUsageTracking).values(conversationUsage);
      await db.insert(sharedLearningScenarioUsageTracking).values(sharedSchoolConversationUsage);
      await db.insert(sharedCharacterChatUsageTrackingTable).values(sharedCharacterChatUsage);
    }

    const usedBudget = await getUsedBudgetInCentByUser({ user });

    // Expected total costs: (150 + 200 + 300)*2 = 1300 cents
    expect(usedBudget).toBe(1300);
  });

  test('should return 0 if no usage data exists for user', async () => {
    const user = mockUserAndContext();

    const usedBudget = await getUsedBudgetInCentByUser({ user });

    expect(usedBudget).toBe(0);
  });

  test('shared chat - should correctly compute token points limit', async () => {
    const maxUsageTimeLimit = 45;
    const teacherPriceLimit = 1000; // 1000 cents
    const tokenPointsLimit = 10; // 10% = 100 cents

    let user = mockUserAndContext();
    user = {
      ...user,
      federalState: { ...user.federalState, teacherPriceLimit: teacherPriceLimit },
    };
    const [insertedUser] = await db
      .insert(userTable)
      .values({
        lastUsedModel: user.lastUsedModel,
        versionAcceptedConditions: user.versionAcceptedConditions,
        schoolIds: user.schoolIds,
        federalStateId: user.federalStateId,
        userRole: 'teacher',
      })
      .returning({ id: userTable.id });
    if (!insertedUser) throw new Error('Failed to insert test user');
    user = { ...user, id: insertedUser.id, userRole: 'teacher' };

    const model = mockLlmModel();
    await db.insert(llmModelTable).values(model);

    // create shared learning scenario
    const startedAt = new Date();
    const sharedLearningScenario: LearningScenarioWithShareDataModel = {
      ...mockLearningScenario(),
      tokenPointsLimit: tokenPointsLimit,
      maxUsageTimeLimit: maxUsageTimeLimit,
      userId: user.id,
      modelId: model.id,
      inviteCode: generateRandomString(8),
      startedAt,
      expiredAt: new Date(startedAt.getTime() + maxUsageTimeLimit * 60 * 1000),
      manuallyStoppedAt: null,
      startedBy: user.id,
    };

    // Insert data into shared school conversation usage tracking (30*3 = 90 cents)
    for (let i = 0; i < 3; i++) {
      const sharedSchoolConversationUsage = {
        ...mockSharedSchoolConversationUsage(),
        userId: user.id,
        modelId: model.id,
        learningScenarioId: sharedLearningScenario.id,
        costsInCent: 30,
      };

      await db.insert(sharedLearningScenarioUsageTracking).values(sharedSchoolConversationUsage);
    }

    const sharedChatUsageInCent = await dbGetLearningScenarioChatUsageInCentByLearningScenarioId({
      learningScenarioId: sharedLearningScenario.id,
      userId: user.id,
      expiredAt: sharedLearningScenario.expiredAt!,
      startedAt: sharedLearningScenario.startedAt!,
    });

    expect(sharedChatUsageInCent).toBe(90);

    let hasReachedLimit = await sharedLearningScenarioChatHasReachedTokenPointsLimit({
      user: user,
      learningScenario: sharedLearningScenario,
    });

    // Used 90 cents of 100 cents -> under the limit
    expect(hasReachedLimit).toBe(false);

    // Add another 30 cents - now 120 cents used
    const sharedSchoolConversationUsage = {
      ...mockSharedSchoolConversationUsage(),
      userId: user.id,
      modelId: model.id,
      learningScenarioId: sharedLearningScenario.id,
      costsInCent: 30,
    };
    await db.insert(sharedLearningScenarioUsageTracking).values(sharedSchoolConversationUsage);

    hasReachedLimit = await sharedLearningScenarioChatHasReachedTokenPointsLimit({
      user: user,
      learningScenario: sharedLearningScenario,
    });

    // Used 120 cents of 100 cents -> over the limit
    expect(hasReachedLimit).toBe(true);
  });

  test('shared character chat - should correctly compute token points limit', async () => {
    const maxUsageTimeLimit = 45;
    const teacherPriceLimit = 1000; // 1000 cents
    const tokenPointsLimit = 10; // 10% = 100 cents

    let user = mockUserAndContext();
    user = {
      ...user,
      federalState: { ...user.federalState, teacherPriceLimit: teacherPriceLimit },
    };
    const [insertedUser] = await db
      .insert(userTable)
      .values({
        lastUsedModel: user.lastUsedModel,
        versionAcceptedConditions: user.versionAcceptedConditions,
        schoolIds: user.schoolIds,
        federalStateId: user.federalStateId,
        userRole: 'teacher',
      })
      .returning({ id: userTable.id });
    if (!insertedUser) throw new Error('Failed to insert test user');
    user = { ...user, id: insertedUser.id, userRole: 'teacher' };

    const model = mockLlmModel();
    await db.insert(llmModelTable).values(model);

    const startedAt = new Date();
    const character: CharacterWithShareDataModel = {
      ...mockCharacter(),
      userId: user.id,
      modelId: model.id,
      isSchoolShared: false,
      isCommunityShared: false,
      isGlobal: false,
      startedAt,
      expiredAt: new Date(startedAt.getTime() + maxUsageTimeLimit * 60 * 1000),
      manuallyStoppedAt: null,
      tokenPointsLimit: tokenPointsLimit,
      maxUsageTimeLimit: maxUsageTimeLimit,
      inviteCode: generateRandomString(8),
      startedBy: user.id,
    };

    // Insert data into shared character conversation usage tracking (30*3 = 90 cents)
    for (let i = 0; i < 3; i++) {
      const sharedCharacterChatUsage = {
        ...mockSharedCharacterChatUsage(),
        userId: user.id,
        modelId: model.id,
        costsInCent: 30,
        characterId: character.id,
      };

      await db.insert(sharedCharacterChatUsageTrackingTable).values(sharedCharacterChatUsage);
    }

    const sharedChatUsageInCent = await dbGetSharedCharacterChatUsageInCentByCharacterId({
      characterId: character.id,
      userId: user.id,
      expiredAt: character.expiredAt,
      startedAt: character.startedAt!,
    });

    expect(sharedChatUsageInCent).toBe(90);

    let hasReachedLimit = await sharedCharacterChatHasReachedTokenPointsLimit({
      user: user,
      character: character!,
    });

    // Used 90 cents of 100 cents -> under the limit
    expect(hasReachedLimit).toBe(false);

    // Add another 30 cents - now 120 cents used
    const sharedCharacterChatUsage = {
      ...mockSharedCharacterChatUsage(),
      userId: user.id,
      modelId: model.id,
      costsInCent: 30,
      characterId: character.id,
    };
    await db.insert(sharedCharacterChatUsageTrackingTable).values(sharedCharacterChatUsage);

    hasReachedLimit = await sharedCharacterChatHasReachedTokenPointsLimit({
      user: user,
      character: character,
    });

    // Used 120 cents of 100 cents -> over the limit
    expect(hasReachedLimit).toBe(true);
  });
});
