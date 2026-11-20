import test, { expect } from '@playwright/test';
import { db } from '@shared/db';
import {
  dbGetAllCharactersByUser,
  dbGetCharacterByIdWithManageableShare,
  dbGetCharactersByIdsOptionalShareData,
} from '@shared/db/functions/character';
import {
  dbGetAllLearningScenariosByUser,
  dbGetLearningScenarioByIdWithManageableShare,
  dbGetLearningScenariosByIdsOptionalShareData,
} from '@shared/db/functions/learning-scenario';
import { dbGetAllLlmModels } from '@shared/db/functions/llm-model';
import {
  characterTable,
  learningScenarioTable,
  sharedCharacter,
  sharedLearningScenarioTable,
  userTable,
} from '@shared/db/schema';
import { generateInviteCode } from '@shared/sharing/generate-invite-code';
import { eq } from 'drizzle-orm';

const MINUTE_MS = 60_000;

// Offsets are far from the 2-hour grace window boundary, so slow runs cannot flip the state.
const shareCases = [
  { name: 'running', expiredInMinutes: 60, stopped: false, manageable: true, active: true },
  {
    name: 'expired within the grace window',
    expiredInMinutes: -30,
    stopped: false,
    manageable: true,
    active: false,
  },
  {
    name: 'expired beyond the grace window',
    expiredInMinutes: -3 * 60,
    stopped: false,
    manageable: false,
    active: false,
  },
  {
    name: 'stopped while running',
    expiredInMinutes: 60,
    stopped: true,
    manageable: false,
    active: false,
  },
  {
    name: 'stopped within the grace window',
    expiredInMinutes: -30,
    stopped: true,
    manageable: false,
    active: false,
  },
];

type ShareCase = (typeof shareCases)[number];

function shareValues(userId: string, { expiredInMinutes, stopped }: ShareCase) {
  const now = Date.now();
  return {
    userId,
    tokenPointsLimit: 10,
    maxUsageTimeLimit: 30,
    inviteCode: generateInviteCode(),
    startedAt: new Date(now - 6 * 60 * MINUTE_MS),
    expiredAt: new Date(now + expiredInMinutes * MINUTE_MS),
    manuallyStoppedAt: stopped ? new Date(now - 5 * 60 * MINUTE_MS) : null,
  };
}

test.describe('share scope queries', { tag: '@smoke' }, () => {
  let userId = '';
  let modelId = '';

  test.beforeAll(async () => {
    const [user] = await db
      .insert(userTable)
      .values({ schoolIds: [], userRole: 'teacher' })
      .returning();
    if (!user) throw new Error('Failed to create user');
    userId = user.id;

    const [model] = await dbGetAllLlmModels();
    if (!model) throw new Error('Failed to find model');
    modelId = model.id;
  });

  test.afterAll(async () => {
    await db.delete(sharedCharacter).where(eq(sharedCharacter.userId, userId));
    await db
      .delete(sharedLearningScenarioTable)
      .where(eq(sharedLearningScenarioTable.userId, userId));
    await db.delete(characterTable).where(eq(characterTable.userId, userId));
    await db.delete(learningScenarioTable).where(eq(learningScenarioTable.userId, userId));
    await db.delete(userTable).where(eq(userTable.id, userId));
  });

  test.describe('character', () => {
    async function createSharedCharacter(shareCase: ShareCase) {
      const [character] = await db
        .insert(characterTable)
        .values({ name: `E2E share scope ${shareCase.name}`, userId, modelId, description: '' })
        .returning();
      if (!character) throw new Error('Failed to create character');
      await db
        .insert(sharedCharacter)
        .values({ characterId: character.id, ...shareValues(userId, shareCase) });
      return character.id;
    }

    for (const shareCase of shareCases) {
      test.describe(`share ${shareCase.name}`, () => {
        let characterId = '';

        test.beforeAll(async () => {
          characterId = await createSharedCharacter(shareCase);
        });

        test(`detail view ${shareCase.manageable ? 'includes' : 'excludes'} the share`, async () => {
          const [character] = await dbGetCharactersByIdsOptionalShareData({
            characterIds: [characterId],
            user: { id: userId },
          });

          expect(character?.id).toBe(characterId);
          expect(character?.expiredAt !== null).toBe(shareCase.manageable);
        });

        test(`share page ${shareCase.manageable ? 'finds' : 'does not find'} the share`, async () => {
          const character = await dbGetCharacterByIdWithManageableShare({
            characterId,
            user: { id: userId },
          });

          expect(character !== undefined).toBe(shareCase.manageable);
        });

        test(`overview ${shareCase.active ? 'includes' : 'excludes'} the share`, async () => {
          const characters = await dbGetAllCharactersByUser({ user: { id: userId } });
          const character = characters.find(({ id }) => id === characterId);

          expect(character).toBeDefined();
          expect(character?.expiredAt !== null).toBe(shareCase.active);
        });
      });
    }
  });

  test.describe('learning scenario', () => {
    async function createSharedLearningScenario(shareCase: ShareCase) {
      const [learningScenario] = await db
        .insert(learningScenarioTable)
        .values({ name: `E2E share scope ${shareCase.name}`, userId, modelId })
        .returning();
      if (!learningScenario) throw new Error('Failed to create learning scenario');
      await db.insert(sharedLearningScenarioTable).values({
        learningScenarioId: learningScenario.id,
        ...shareValues(userId, shareCase),
      });
      return learningScenario.id;
    }

    for (const shareCase of shareCases) {
      test.describe(`share ${shareCase.name}`, () => {
        let learningScenarioId = '';

        test.beforeAll(async () => {
          learningScenarioId = await createSharedLearningScenario(shareCase);
        });

        test(`detail view ${shareCase.manageable ? 'includes' : 'excludes'} the share`, async () => {
          const [learningScenario] = await dbGetLearningScenariosByIdsOptionalShareData({
            learningScenarioIds: [learningScenarioId],
            user: { id: userId },
          });

          expect(learningScenario?.id).toBe(learningScenarioId);
          expect(learningScenario?.expiredAt !== null).toBe(shareCase.manageable);
        });

        test(`share page ${shareCase.manageable ? 'finds' : 'does not find'} the share`, async () => {
          const learningScenario = await dbGetLearningScenarioByIdWithManageableShare({
            learningScenarioId,
            user: { id: userId },
          });

          expect(learningScenario !== undefined).toBe(shareCase.manageable);
        });

        test(`overview ${shareCase.active ? 'includes' : 'excludes'} the share`, async () => {
          const learningScenarios = await dbGetAllLearningScenariosByUser({
            user: { id: userId },
          });
          const learningScenario = learningScenarios.find(({ id }) => id === learningScenarioId);

          expect(learningScenario).toBeDefined();
          expect(learningScenario?.expiredAt !== null).toBe(shareCase.active);
        });
      });
    }
  });
});
