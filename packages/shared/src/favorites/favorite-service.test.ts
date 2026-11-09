import { dbGetAssistantById } from '@shared/db/functions/assistants';
import { dbGetCharacterById } from '@shared/db/functions/character';
import { dbGetLearningScenarioById } from '@shared/db/functions/learning-scenario';
import {
  dbAddUserFavorite,
  dbGetUserFavoriteEntityIds,
  dbIsUserFavorite,
  dbRemoveUserFavorite,
} from '@shared/db/functions/user-favorites';
import { ForbiddenError, InvalidArgumentError, NotFoundError } from '@shared/error';
import { generateUUID } from '@shared/utils/uuid';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getFavoriteEntityIds, isFavorite, setFavorite } from './favorite-service';

vi.mock('@shared/db/functions/assistants', () => ({ dbGetAssistantById: vi.fn() }));
vi.mock('@shared/db/functions/character', () => ({ dbGetCharacterById: vi.fn() }));
vi.mock('@shared/db/functions/learning-scenario', () => ({
  dbGetLearningScenarioById: vi.fn(),
}));
vi.mock('@shared/db/functions/user-favorites', () => ({
  dbAddUserFavorite: vi.fn(),
  dbRemoveUserFavorite: vi.fn(),
  dbGetUserFavoriteEntityIds: vi.fn(),
  dbIsUserFavorite: vi.fn(),
}));

const user = { id: generateUUID(), schoolIds: [] as string[] };

function buildEntity(overrides: Record<string, unknown> = {}) {
  return {
    id: generateUUID(),
    userId: generateUUID(),
    isSchoolShared: false,
    isCommunityShared: false,
    isGlobal: false,
    hasLinkAccess: false,
    suspended: false,
    ...overrides,
  };
}

describe('favorite-service', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('setFavorite', () => {
    it.each([
      ['assistant', dbGetAssistantById],
      ['character', dbGetCharacterById],
      ['learningScenario', dbGetLearningScenarioById],
    ] as const)('adds a favorite for a readable %s', async (entityType, loader) => {
      const entity = buildEntity({ isCommunityShared: true });
      vi.mocked(loader as typeof dbGetAssistantById).mockResolvedValue(entity as never);

      await setFavorite({ entityType, entityId: entity.id, isFavorite: true, user });

      expect(dbAddUserFavorite).toHaveBeenCalledWith({
        userId: user.id,
        entityRef: { entityType, entityId: entity.id },
      });
    });

    it('allows favoriting an entity shared by link', async () => {
      const entity = buildEntity({ hasLinkAccess: true });
      vi.mocked(dbGetAssistantById).mockResolvedValue(entity as never);

      await setFavorite({
        entityType: 'assistant',
        entityId: entity.id,
        isFavorite: true,
        user,
      });

      expect(dbAddUserFavorite).toHaveBeenCalledOnce();
    });

    it('allows favoriting an own private entity', async () => {
      const entity = buildEntity({ userId: user.id });
      vi.mocked(dbGetCharacterById).mockResolvedValue(entity as never);

      await setFavorite({
        entityType: 'character',
        entityId: entity.id,
        isFavorite: true,
        user,
      });

      expect(dbAddUserFavorite).toHaveBeenCalledOnce();
    });

    it('rejects favoriting an entity without read access', async () => {
      const entity = buildEntity();
      vi.mocked(dbGetAssistantById).mockResolvedValue(entity as never);

      await expect(
        setFavorite({ entityType: 'assistant', entityId: entity.id, isFavorite: true, user }),
      ).rejects.toThrow(ForbiddenError);
      expect(dbAddUserFavorite).not.toHaveBeenCalled();
    });

    it('rejects favoriting a suspended entity', async () => {
      const entity = buildEntity({ userId: user.id, suspended: true });
      vi.mocked(dbGetAssistantById).mockResolvedValue(entity as never);

      await expect(
        setFavorite({ entityType: 'assistant', entityId: entity.id, isFavorite: true, user }),
      ).rejects.toThrow(ForbiddenError);
      expect(dbAddUserFavorite).not.toHaveBeenCalled();
    });

    it('rejects favoriting an entity that does not exist', async () => {
      vi.mocked(dbGetLearningScenarioById).mockResolvedValue(undefined as never);

      await expect(
        setFavorite({
          entityType: 'learningScenario',
          entityId: generateUUID(),
          isFavorite: true,
          user,
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it('removes a favorite without checking access', async () => {
      const entityId = generateUUID();

      await setFavorite({ entityType: 'assistant', entityId, isFavorite: false, user });

      expect(dbRemoveUserFavorite).toHaveBeenCalledWith({
        userId: user.id,
        entityRef: { entityType: 'assistant', entityId },
      });
      expect(dbGetAssistantById).not.toHaveBeenCalled();
    });

    it('rejects an invalid entity id', async () => {
      await expect(
        setFavorite({ entityType: 'assistant', entityId: 'not-a-uuid', isFavorite: true, user }),
      ).rejects.toThrow(InvalidArgumentError);
    });

    it('rejects an unsupported entity type', async () => {
      await expect(
        setFavorite({
          entityType: 'foo' as never,
          entityId: generateUUID(),
          isFavorite: true,
          user,
        }),
      ).rejects.toThrow(InvalidArgumentError);
    });
  });

  describe('isFavorite', () => {
    it('returns whether the entity is a favorite of the user', async () => {
      const entityId = generateUUID();
      vi.mocked(dbIsUserFavorite).mockResolvedValue(true);

      const result = await isFavorite({ entityType: 'character', entityId, user });

      expect(result).toBe(true);
      expect(dbIsUserFavorite).toHaveBeenCalledWith({
        userId: user.id,
        entityRef: { entityType: 'character', entityId },
      });
    });

    it('rejects an invalid entity id', async () => {
      await expect(
        isFavorite({ entityType: 'assistant', entityId: 'not-a-uuid', user }),
      ).rejects.toThrow(InvalidArgumentError);
    });

    it('rejects an unsupported entity type', async () => {
      await expect(
        isFavorite({ entityType: 'foo' as never, entityId: generateUUID(), user }),
      ).rejects.toThrow(InvalidArgumentError);
    });
  });

  describe('getFavoriteEntityIds', () => {
    it('returns the favorite ids of the user for the entity type', async () => {
      const ids = [generateUUID(), generateUUID()];
      vi.mocked(dbGetUserFavoriteEntityIds).mockResolvedValue(ids);

      const result = await getFavoriteEntityIds({ entityType: 'character', user });

      expect(result).toEqual(ids);
      expect(dbGetUserFavoriteEntityIds).toHaveBeenCalledWith({
        userId: user.id,
        entityType: 'character',
      });
    });

    it('rejects an unsupported entity type', async () => {
      await expect(getFavoriteEntityIds({ entityType: 'foo' as never, user })).rejects.toThrow(
        InvalidArgumentError,
      );
    });
  });
});
