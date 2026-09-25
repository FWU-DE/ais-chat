import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createNewCharacter,
  deleteCharacter,
  deleteFileMappingAndEntity,
  downloadFileFromCharacter,
  extendCharacterShareExpiration,
  fetchFileMappings,
  getActiveCharacterShareData,
  getCharacterByAccessLevel,
  getCharacterForChatSession,
  getCharacterForEditView,
  getCharacterForExistingConversation,
  getCharactersByOverviewFilter,
  getSharedCharacter,
  linkFileToCharacter,
  shareCharacter,
  unshareCharacter,
  updateCharacter,
  updateCharacterAccessLevel,
  updateCharacterShareTokenPointsLimit,
  uploadAvatarPictureForCharacter,
} from './character-service';
import {
  dbCreateCharacterShare,
  dbExtendSharedCharacterConversationExpiration,
  dbGetAllAccessibleCharacters,
  dbGetAllCharactersByUser,
  dbGetCharacterById,
  dbGetCharacterByIdForConversation,
  dbGetCharacterByIdOptionalShareData,
  dbGetCharacterByIdWithShareData,
  dbGetCharactersByAssociatedSchools,
  dbGetCommunityCharacters,
  dbGetCharactersByUser,
  dbGetGlobalCharacters,
  dbGetLatestManageableCharacterShare,
  dbStopCharacterShare,
  dbUpdateCharacterShareTokenPointsLimit,
} from '../db/functions/character';
import { dbGetRelatedCharacterFiles } from '../db/functions/files';
import { getReadOnlySignedUrl, uploadFileToS3 } from '../s3';
import { getAvatarPictureUrl } from '../files/fileService';
import { generateUUID } from '../utils/uuid';
import { getMaxBudgetInCentByUser, getUsedBudgetInCentByUser } from '../users/user-budget-service';
import { CharacterSelectModel, CharacterWithShareDataModel } from '@shared/db/schema';
import { SHARE_EXTENSION_WINDOW_MS } from '../sharing/const';
import { FederalStateModel } from '@shared/federal-states/types';
import { ForbiddenError, InvalidArgumentError, NotFoundError } from '@shared/error';
import { dbGetSharedCharacterChatUsageInCentByCharacterId } from '@shared/db/functions/token-points';
import { copyCharacter, copyRelatedTemplateFiles } from '../templates/template-service';

vi.mock('../db/functions/character', () => ({
  dbGetAllAccessibleCharacters: vi.fn(),
  dbGetAllCharactersByUser: vi.fn(),
  dbGetCharacterById: vi.fn(),
  dbGetCharacterByIdAndUserId: vi.fn(),
  dbGetCharacterByIdForConversation: vi.fn(),
  dbGetCharacterByIdOptionalShareData: vi.fn(),
  dbGetCharacterByIdWithShareData: vi.fn(),
  dbDeleteCharacterByIdAndUser: vi.fn(),
  dbGetCharactersByAssociatedSchools: vi.fn(),
  dbGetCommunityCharacters: vi.fn(),
  dbGetCharactersByUser: vi.fn(),
  dbGetGlobalCharacters: vi.fn(),
  dbGetLatestManageableCharacterShare: vi.fn(),
  dbCreateCharacterShare: vi.fn(),
  dbStopCharacterShare: vi.fn(),
  dbExtendSharedCharacterConversationExpiration: vi.fn(),
  dbUpdateCharacterShareTokenPointsLimit: vi.fn(),
}));
vi.mock('../db/functions/files', () => ({
  dbGetRelatedCharacterFiles: vi.fn(),
}));
vi.mock('../s3', () => ({
  getReadOnlySignedUrl: vi.fn(),
  uploadFileToS3: vi.fn(),
  deleteFileFromS3: vi.fn(),
}));
vi.mock('../users/user-budget-service', () => ({
  getMaxBudgetInCentByUser: vi.fn(),
  getUsedBudgetInCentByUser: vi.fn(),
}));
vi.mock('../files/fileService', () => ({
  getAvatarPictureUrl: vi.fn(),
  deleteAvatarPicture: vi.fn(),
  deleteMessageAttachments: vi.fn(),
}));
vi.mock('../templates/template-service', () => ({
  copyCharacter: vi.fn(),
  copyRelatedTemplateFiles: vi.fn(),
}));
vi.mock('@shared/db/functions/token-points', () => ({
  dbGetSharedCharacterChatUsageInCentByCharacterId: vi.fn(),
}));
const { mockDbReturning, mockDbSet, mockDbUpdate } = vi.hoisted(() => {
  const mockDbReturning = vi.fn();
  const mockDbWhere = vi.fn(() => ({ returning: mockDbReturning }));
  const mockDbSet = vi.fn(() => ({ where: mockDbWhere }));
  const mockDbUpdate = vi.fn(() => ({ set: mockDbSet }));

  return {
    mockDbReturning,
    mockDbSet,
    mockDbUpdate,
  };
});
vi.mock('@shared/db', () => ({ db: { update: mockDbUpdate } }));

const mockUser = (userRole: 'student' | 'teacher' = 'teacher') => ({
  id: generateUUID(),
  userRole,
  lastUsedModel: null,
  versionAcceptedConditions: null,
  createdAt: new Date(),
  federalStateId: generateUUID(),
  schoolIds: [generateUUID()],
});

const mockFederalState = (): FederalStateModel =>
  ({
    id: generateUUID(),
    teacherPriceLimit: 500,
    studentPriceLimit: 100,
    createdAt: new Date(),
    mandatoryCertificationTeacher: null,
  }) as FederalStateModel;

describe('character-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set default mock return values for budget functions
    vi.mocked(getMaxBudgetInCentByUser).mockResolvedValue(500);
    vi.mocked(getUsedBudgetInCentByUser).mockResolvedValue(0);
  });

  describe('NotFoundError scenarios', () => {
    it.each([
      {
        functionName: 'getSharedCharacter',
        testFunction: () =>
          getSharedCharacter({
            characterId: generateUUID(),
            userId: 'user-id',
          }),
      },
      {
        functionName: 'downloadFileFromCharacter',
        testFunction: () =>
          downloadFileFromCharacter({
            characterId: generateUUID(),
            fileId: generateUUID(),
            user: mockUser(),
          }),
      },
    ])(
      'should throw NotFoundError when character does not exist - $functionName',
      async ({ testFunction }) => {
        vi.mocked(dbGetCharacterByIdWithShareData).mockResolvedValue(null as never);

        await expect(testFunction()).rejects.toThrow(NotFoundError);
      },
    );

    it('should throw NotFoundError when character does not exist - uploadAvatarPictureForCharacter', async () => {
      vi.mocked(dbGetCharacterById).mockResolvedValue(null as never);

      await expect(
        uploadAvatarPictureForCharacter({
          characterId: generateUUID(),
          user: { id: 'user-id' },
          croppedImageBlob: new Blob(),
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw NotFoundError when character has no invite code - getSharedCharacter', async () => {
      const userId = generateUUID();
      const mockCharacter: Partial<CharacterSelectModel> = {
        userId: userId,
      };

      vi.mocked(dbGetCharacterByIdWithShareData).mockResolvedValue(mockCharacter as never);

      await expect(
        getSharedCharacter({
          characterId: generateUUID(),
          userId: 'user-id',
        }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('getCharacterForExistingConversation', () => {
    const characterId = generateUUID();
    const conversationId = generateUUID();

    it('returns the character when it is linked to the given conversation', async () => {
      const user = mockUser();
      const mockCharacter = {
        id: characterId,
        userId: user.id,
        accessLevel: 'private' as const,
        hasLinkAccess: false,
      };
      vi.mocked(dbGetCharacterByIdForConversation).mockResolvedValue(mockCharacter as never);

      const result = await getCharacterForExistingConversation({
        characterId,
        conversationId,
        user,
      });

      expect(result).toBe(mockCharacter);
      expect(dbGetCharacterByIdForConversation).toHaveBeenCalledWith({
        characterId,
        conversationId,
        userId: user.id,
      });
    });

    it('throws NotFoundError when the character is not linked to the conversation', async () => {
      vi.mocked(dbGetCharacterByIdForConversation).mockResolvedValue(undefined);

      await expect(
        getCharacterForExistingConversation({
          characterId,
          conversationId,
          user: mockUser(),
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it('throws ForbiddenError when the user is not authorized to read the character', async () => {
      const mockCharacter = {
        id: characterId,
        userId: generateUUID(),
        accessLevel: 'private' as const,
        hasLinkAccess: false,
      };
      vi.mocked(dbGetCharacterByIdForConversation).mockResolvedValue(mockCharacter as never);

      await expect(
        getCharacterForExistingConversation({
          characterId,
          conversationId,
          user: mockUser(),
        }),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe('ForbiddenError scenarios - user not owner', () => {
    const userId = generateUUID();
    const mockCharacter: Partial<CharacterSelectModel> = {
      userId: userId,
      accessLevel: 'private',
    };

    beforeEach(() => {
      vi.mocked(dbGetCharacterById).mockResolvedValue(mockCharacter as never);
    });

    it.each([
      {
        functionName: 'deleteFileMappingAndEntity',
        testFunction: () =>
          deleteFileMappingAndEntity({
            characterId: generateUUID(),
            fileId: generateUUID(),
            user: { id: 'different-user-id' },
          }),
      },
      {
        functionName: 'linkFileToCharacter',
        testFunction: () =>
          linkFileToCharacter({
            characterId: generateUUID(),
            user: { id: 'different-user-id' },
            fileId: generateUUID(),
          }),
      },
      {
        functionName: 'updateCharacter',
        testFunction: () =>
          updateCharacter({
            id: generateUUID(),
            user: { id: 'different-user-id' },
            name: 'new-name',
          }),
      },
      {
        functionName: 'deleteCharacter',
        testFunction: () =>
          deleteCharacter({
            characterId: generateUUID(),
            user: { id: 'different-user-id' },
          }),
      },
      {
        functionName: 'uploadAvatarPictureForCharacter',
        testFunction: () =>
          uploadAvatarPictureForCharacter({
            characterId: generateUUID(),
            user: { id: 'different-user-id' },
            croppedImageBlob: new Blob(),
          }),
      },
    ])(
      'should throw ForbiddenError when user is not the owner - $functionName',
      async ({ testFunction }) => {
        await expect(testFunction()).rejects.toThrow(ForbiddenError);
      },
    );
  });

  describe('ForbiddenError scenarios - access restrictions', () => {
    it('should throw ForbiddenError when setting access level to global - updateCharacterAccessLevel', async () => {
      const userId = generateUUID();
      const mockCharacter: Partial<CharacterSelectModel> = {
        userId: userId,
        accessLevel: 'private',
      };

      vi.mocked(dbGetCharacterById).mockResolvedValue(mockCharacter as never);

      await expect(
        updateCharacterAccessLevel({
          characterId: generateUUID(),
          user: { id: userId },
          accessLevel: 'global',
        }),
      ).rejects.toThrow(ForbiddenError);
    });

    it('should throw ForbiddenError when user is not owner - updateCharacterAccessLevel', async () => {
      const userId = generateUUID();
      const mockCharacter: Partial<CharacterSelectModel> = {
        userId: userId,
        accessLevel: 'private',
      };

      vi.mocked(dbGetCharacterById).mockResolvedValue(mockCharacter as never);

      await expect(
        updateCharacterAccessLevel({
          characterId: generateUUID(),
          user: { id: 'different-user-id' },
          accessLevel: 'school',
        }),
      ).rejects.toThrow(ForbiddenError);
    });

    it('should throw ForbiddenError when character is private and user is not owner - fetchFileMappings', async () => {
      const userId = generateUUID();
      const mockCharacter: Partial<CharacterSelectModel> = {
        userId: userId,
        accessLevel: 'private',
      };

      vi.mocked(dbGetCharacterById).mockResolvedValue(mockCharacter as never);

      await expect(
        fetchFileMappings({
          characterId: generateUUID(),
          user: mockUser(),
        }),
      ).rejects.toThrow(ForbiddenError);
    });

    it('should throw ForbiddenError when character access level is school and user is from different school - fetchFileMappings', async () => {
      const userId = generateUUID();
      const mockCharacter: Partial<CharacterSelectModel> = {
        userId: userId,
        accessLevel: 'school',
      };

      vi.mocked(dbGetCharacterById).mockResolvedValue(mockCharacter as never);

      await expect(
        fetchFileMappings({
          characterId: generateUUID(),
          user: mockUser(),
        }),
      ).rejects.toThrow(ForbiddenError);
    });
    it('should allow access when character access level is school and users share school - fetchFileMappings', async () => {
      const characterId = generateUUID();
      const ownerUserId = generateUUID();

      const mockCharacter: Partial<CharacterSelectModel> = {
        userId: ownerUserId,
        accessLevel: 'school',
        ownerSchoolIds: ['shared-school-id'],
      };

      vi.mocked(dbGetCharacterById).mockResolvedValue(mockCharacter as never);
      vi.mocked(dbGetRelatedCharacterFiles).mockResolvedValue([]);

      const viewerUser = { ...mockUser(), schoolIds: ['shared-school-id'] };
      await expect(
        fetchFileMappings({
          characterId,
          user: viewerUser,
        }),
      ).resolves.toEqual([]);
    });
  });

  describe('sharing updates preserve updatedAt', () => {
    it('preserves updatedAt when only accessLevel changes', async () => {
      const userId = generateUUID();
      const characterId = generateUUID();
      const updatedAt = new Date('2026-06-01T10:00:00.000Z');
      const character = {
        id: characterId,
        userId,
        accessLevel: 'private',
        hasLinkAccess: false,
        updatedAt,
      } as Partial<CharacterSelectModel>;

      vi.mocked(dbGetCharacterById).mockResolvedValue(character as never);
      mockDbReturning.mockResolvedValue([
        { ...character, accessLevel: 'school' } as CharacterSelectModel,
      ]);

      await updateCharacterAccessLevel({
        characterId,
        user: { id: userId },
        accessLevel: 'school',
      });

      expect(mockDbSet).toHaveBeenCalledWith({ accessLevel: 'school', updatedAt });
    });

    it('preserves updatedAt when only hasLinkAccess changes', async () => {
      const userId = generateUUID();
      const characterId = generateUUID();
      const updatedAt = new Date('2026-06-01T10:00:00.000Z');
      const character = {
        id: characterId,
        userId,
        hasLinkAccess: false,
        updatedAt,
      } as Partial<CharacterSelectModel>;

      vi.mocked(dbGetCharacterById).mockResolvedValue(character as never);
      mockDbReturning.mockResolvedValue([
        { ...character, hasLinkAccess: true } as CharacterSelectModel,
      ]);

      await updateCharacter({ id: characterId, user: { id: userId }, hasLinkAccess: true });

      expect(mockDbSet).toHaveBeenCalledWith({ id: characterId, hasLinkAccess: true, updatedAt });
    });
  });

  describe('ForbiddenError scenarios - role restrictions', () => {
    beforeEach(() => {
      const userId = generateUUID();
      const mockCharacter: Partial<CharacterSelectModel> = {
        userId: userId,
        accessLevel: 'private',
      };

      vi.mocked(dbGetCharacterById).mockResolvedValue(mockCharacter as never);
    });

    it.each([
      {
        functionName: 'shareCharacter',
        testFunction: () =>
          shareCharacter({
            characterId: generateUUID(),
            user: mockUser('student'),
            tokenPointsPercentageLimit: 10,
            usageTimeLimitMinutes: 60,
          }),
        reason: 'only teachers can share a character',
      },
      {
        functionName: 'unshareCharacter',
        testFunction: () =>
          unshareCharacter({
            characterId: generateUUID(),
            user: mockUser('student'),
          }),
        reason: 'only teachers can unshare a character',
      },
    ])('should throw ForbiddenError because $reason - $functionName', async ({ testFunction }) => {
      await expect(testFunction()).rejects.toThrow(ForbiddenError);
    });

    it('should throw ForbiddenError when character is private and teacher is not owner - shareCharacter', async () => {
      await expect(
        shareCharacter({
          characterId: generateUUID(),
          user: mockUser('teacher'),
          tokenPointsPercentageLimit: 10,
          usageTimeLimitMinutes: 60,
        }),
      ).rejects.toThrow(ForbiddenError);
    });

    it('should throw ForbiddenError when character access level is school and user is from different school - shareCharacter', async () => {
      const userId = generateUUID();
      const mockCharacter: Partial<CharacterSelectModel> = {
        userId: userId,
        accessLevel: 'school',
      };

      vi.mocked(dbGetCharacterById).mockResolvedValue(mockCharacter as never);

      await expect(
        shareCharacter({
          characterId: generateUUID(),
          user: mockUser('teacher'),
          tokenPointsPercentageLimit: 10,
          usageTimeLimitMinutes: 60,
        }),
      ).rejects.toThrow(ForbiddenError);
    });

    it('should throw NotFoundError when there is no active sharing to unshare - unshareCharacter', async () => {
      vi.mocked(dbGetLatestManageableCharacterShare).mockResolvedValue(null as never);

      await expect(
        unshareCharacter({
          characterId: generateUUID(),
          user: mockUser('teacher'),
        }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('shareCharacter - duplicate share', () => {
    const userId = generateUUID();
    const characterId = generateUUID();
    const user = { ...mockUser('teacher'), id: userId };
    const existingShare = {
      id: generateUUID(),
      characterId,
      userId,
      tokenPointsLimit: 50,
      maxUsageTimeLimit: 60,
      inviteCode: 'ABCD1234',
      startedAt: new Date(),
      manuallyStoppedAt: null,
    };

    beforeEach(() => {
      const mockCharacter: Partial<CharacterSelectModel> = {
        id: characterId,
        userId,
        accessLevel: 'private',
      };
      vi.mocked(dbGetCharacterById).mockResolvedValue(mockCharacter as never);
      vi.mocked(dbGetLatestManageableCharacterShare).mockResolvedValue(existingShare as never);
    });

    it('throws when there is already an active share', async () => {
      await expect(
        shareCharacter({
          characterId,
          user,
          tokenPointsPercentageLimit: 10,
          usageTimeLimitMinutes: 60,
        }),
      ).rejects.toThrow(InvalidArgumentError);
    });
  });

  describe('shareCharacter / unshareCharacter - success', () => {
    const userId = generateUUID();
    const characterId = generateUUID();
    const user = { ...mockUser('teacher'), id: userId };
    const mockCharacter: Partial<CharacterSelectModel> = {
      id: characterId,
      userId,
      accessLevel: 'private',
      hasLinkAccess: false,
    };

    beforeEach(() => {
      vi.mocked(dbGetCharacterById).mockResolvedValue(mockCharacter as never);
    });

    it('creates a new share via dbCreateCharacterShare when no manageable share exists', async () => {
      const newShare = { id: generateUUID(), characterId, userId };
      vi.mocked(dbGetLatestManageableCharacterShare).mockResolvedValue(null as never);
      vi.mocked(dbCreateCharacterShare).mockResolvedValue(newShare as never);

      const result = await shareCharacter({
        characterId,
        user,
        tokenPointsPercentageLimit: 10,
        usageTimeLimitMinutes: 60,
      });

      expect(dbCreateCharacterShare).toHaveBeenCalledWith(
        expect.objectContaining({
          user,
          characterId,
          tokenPointsLimit: 10,
          maxUsageTimeLimit: 60,
        }),
      );
      expect(result).toBe(newShare);
    });

    it('stops the latest manageable share via dbStopCharacterShare', async () => {
      const share = { id: generateUUID(), characterId, userId };
      const stoppedShare = { ...share, manuallyStoppedAt: new Date() };
      vi.mocked(dbGetLatestManageableCharacterShare).mockResolvedValue(share as never);
      vi.mocked(dbStopCharacterShare).mockResolvedValue(stoppedShare as never);

      const result = await unshareCharacter({ characterId, user });

      expect(dbStopCharacterShare).toHaveBeenCalledWith({ shareId: share.id });
      expect(result).toBe(stoppedShare);
    });
  });

  describe('extendCharacterShareExpiration', () => {
    const userId = generateUUID();
    const characterId = generateUUID();
    const user = { ...mockUser('teacher'), id: userId };
    const mockCharacter: Partial<CharacterSelectModel> = {
      id: characterId,
      userId,
      accessLevel: 'private',
      hasLinkAccess: false,
    };
    const updatedShare = {
      id: generateUUID(),
      characterId,
      userId,
      expiredAt: new Date('2026-07-01T12:30:00.000Z'),
    };
    const currentShare = {
      id: generateUUID(),
      characterId,
      userId,
      tokenPointsLimit: 50,
      maxUsageTimeLimit: 60,
      expiredAt: new Date(Date.now() + 60 * 60_000),
    };

    beforeEach(() => {
      vi.mocked(dbGetCharacterById).mockResolvedValue(mockCharacter as never);
      vi.mocked(dbGetLatestManageableCharacterShare).mockResolvedValue(currentShare as never);
      vi.mocked(dbExtendSharedCharacterConversationExpiration).mockResolvedValue(
        updatedShare as never,
      );
    });

    it('returns the updated share when the expiration is extended', async () => {
      const result = await extendCharacterShareExpiration({
        characterId,
        additionalTimeInMinutes: 30,
        user,
      });

      expect(dbExtendSharedCharacterConversationExpiration).toHaveBeenCalledWith({
        share: currentShare,
        additionalTimeInMinutes: 30,
      });
      expect(result).toBe(updatedShare);
    });

    it.each([0, 43201])(
      'throws InvalidArgumentError for an out-of-range additional time value (%s)',
      async (additionalTimeInMinutes) => {
        await expect(
          extendCharacterShareExpiration({
            characterId,
            additionalTimeInMinutes,
            user,
          }),
        ).rejects.toThrow(InvalidArgumentError);

        expect(dbExtendSharedCharacterConversationExpiration).not.toHaveBeenCalled();
      },
    );

    it('throws InvalidArgumentError when the total usage time would exceed 130 days', async () => {
      vi.mocked(dbGetLatestManageableCharacterShare).mockResolvedValue({
        ...currentShare,
        expiredAt: new Date(Date.now() + 187000 * 60_000),
      } as never);
      vi.mocked(dbGetCharacterById).mockResolvedValue({
        ...mockCharacter,
        maxUsageTimeLimit: 187000,
      } as never);

      await expect(
        extendCharacterShareExpiration({
          characterId,
          additionalTimeInMinutes: 300,
          user,
        }),
      ).rejects.toThrow('total usage time limit must not exceed 130 days');

      expect(dbExtendSharedCharacterConversationExpiration).not.toHaveBeenCalled();
    });

    it('throws InvalidArgumentError when there is no active share to extend', async () => {
      vi.mocked(dbExtendSharedCharacterConversationExpiration).mockResolvedValue(null as never);

      await expect(
        extendCharacterShareExpiration({
          characterId,
          additionalTimeInMinutes: 30,
          user,
        }),
      ).rejects.toThrow(InvalidArgumentError);
    });
  });

  describe('updateCharacterShareTokenPointsLimit', () => {
    const userId = generateUUID();
    const characterId = generateUUID();
    const user = { ...mockUser('teacher'), id: userId };
    const mockCharacter: Partial<CharacterSelectModel> = {
      id: characterId,
      userId,
      accessLevel: 'private',
      hasLinkAccess: false,
    };
    const currentShare = {
      id: generateUUID(),
      characterId,
      userId,
      tokenPointsLimit: 50,
      maxUsageTimeLimit: 187000,
    };
    const updatedShare = {
      ...currentShare,
      tokenPointsLimit: 75,
    };

    beforeEach(() => {
      vi.mocked(dbGetCharacterById).mockResolvedValue(mockCharacter as never);
      vi.mocked(dbGetLatestManageableCharacterShare).mockResolvedValue(currentShare as never);
      vi.mocked(dbUpdateCharacterShareTokenPointsLimit).mockResolvedValue(updatedShare as never);
    });

    it('returns the updated share when the token points limit increases', async () => {
      const result = await updateCharacterShareTokenPointsLimit({
        characterId,
        tokenPointsPercentageLimit: 75,
        user,
      });

      expect(dbUpdateCharacterShareTokenPointsLimit).toHaveBeenCalledWith({
        characterId,
        user,
        tokenPointsLimit: 75,
      });
      expect(result).toBe(updatedShare);
    });

    it.each([0, 101])(
      'throws InvalidArgumentError for an out-of-range token limit (%s)',
      async (tokenPointsPercentageLimit) => {
        await expect(
          updateCharacterShareTokenPointsLimit({
            characterId,
            tokenPointsPercentageLimit,
            user,
          }),
        ).rejects.toThrow(InvalidArgumentError);

        expect(dbUpdateCharacterShareTokenPointsLimit).not.toHaveBeenCalled();
      },
    );

    it('throws InvalidArgumentError when there is no current share', async () => {
      vi.mocked(dbGetLatestManageableCharacterShare).mockResolvedValue(null as never);

      await expect(
        updateCharacterShareTokenPointsLimit({
          characterId,
          tokenPointsPercentageLimit: 75,
          user,
        }),
      ).rejects.toThrow(InvalidArgumentError);

      expect(dbUpdateCharacterShareTokenPointsLimit).not.toHaveBeenCalled();
    });

    it.each([50, 49])(
      'throws InvalidArgumentError when the new token limit is not higher than the current limit (%s)',
      async (tokenPointsPercentageLimit) => {
        await expect(
          updateCharacterShareTokenPointsLimit({
            characterId,
            tokenPointsPercentageLimit,
            user,
          }),
        ).rejects.toThrow(InvalidArgumentError);

        expect(dbUpdateCharacterShareTokenPointsLimit).not.toHaveBeenCalled();
      },
    );

    it('throws InvalidArgumentError when the share update returns no result', async () => {
      vi.mocked(dbUpdateCharacterShareTokenPointsLimit).mockResolvedValue(null as never);

      await expect(
        updateCharacterShareTokenPointsLimit({
          characterId,
          tokenPointsPercentageLimit: 75,
          user,
        }),
      ).rejects.toThrow(InvalidArgumentError);
    });
  });

  describe('createNewCharacter', () => {
    const federalStateId = generateUUID();
    const templateId = generateUUID();
    const duplicateCharacterName = 'Copied Character';
    const templateCharacter = (overrides: Partial<CharacterSelectModel> = {}) => ({
      id: templateId,
      name: 'Template Character',
      userId: generateUUID(),
      accessLevel: 'global',
      hasLinkAccess: false,
      suspended: false,
      ownerSchoolIds: [],
      ...overrides,
    });

    beforeEach(() => {
      vi.mocked(copyRelatedTemplateFiles).mockResolvedValue(undefined as never);
      vi.mocked(dbGetCharacterById).mockResolvedValue(templateCharacter() as never);
    });

    it('should pass duplicateCharacterName to copyCharacter when creating from template', async () => {
      const user = mockUser('teacher');
      const insertedCharacter = {
        id: generateUUID(),
        pictureId: null,
      } as CharacterSelectModel;

      vi.mocked(dbGetCharacterById).mockResolvedValue(
        templateCharacter({ userId: user.id, accessLevel: 'private' }) as never,
      );

      vi.mocked(copyCharacter).mockResolvedValue(insertedCharacter as never);

      const result = await createNewCharacter({
        federalStateId,
        templateId,
        user,
        duplicateCharacterName,
      });

      expect(copyCharacter).toHaveBeenCalledWith(
        templateId,
        'private',
        expect.objectContaining({ id: expect.any(String) }),
        duplicateCharacterName,
      );
      expect(copyRelatedTemplateFiles).toHaveBeenCalledWith(
        'character',
        templateId,
        insertedCharacter.id,
      );
      expect(result).toBe(insertedCharacter);
    });

    it('should return the character from copyCharacter as-is, without copying its picture again', async () => {
      const user = mockUser('teacher');
      const insertedCharacter = {
        id: generateUUID(),
        pictureId: 'characters/already-scoped-id/avatar_abc123',
      } as CharacterSelectModel;

      vi.mocked(dbGetCharacterById).mockResolvedValue(
        templateCharacter({ userId: user.id, accessLevel: 'private' }) as never,
      );
      vi.mocked(copyCharacter).mockResolvedValue(insertedCharacter as never);

      const result = await createNewCharacter({ federalStateId, templateId, user });

      // copyCharacter already duplicates the picture; createNewCharacter must not attempt to
      // copy it again (which would be a no-op S3 self-copy at best, an error at worst).
      expect(result).toBe(insertedCharacter);
    });

    it('should throw ForbiddenError when template is suspended', async () => {
      const user = mockUser('teacher');
      vi.mocked(dbGetCharacterById).mockResolvedValue(
        templateCharacter({ userId: user.id, accessLevel: 'private', suspended: true }) as never,
      );

      await expect(
        createNewCharacter({
          federalStateId,
          templateId,
          user,
        }),
      ).rejects.toThrow(ForbiddenError);

      expect(copyCharacter).not.toHaveBeenCalled();
    });
  });

  describe('InvalidArgumentError scenarios - invalid parameter format', () => {
    it.each([
      {
        functionName: 'deleteFileMappingAndEntity',
        testFunction: () =>
          deleteFileMappingAndEntity({
            characterId: 'invalid-uuid',
            fileId: generateUUID(),
            user: { id: 'user-id' },
          }),
      },
      {
        functionName: 'fetchFileMappings',
        testFunction: () =>
          fetchFileMappings({
            characterId: 'invalid-uuid',
            user: mockUser(),
          }),
      },
      {
        functionName: 'linkFileToCharacter',
        testFunction: () =>
          linkFileToCharacter({
            characterId: 'invalid-uuid',
            user: { id: 'user-id' },
            fileId: generateUUID(),
          }),
      },
      {
        functionName: 'updateCharacter',
        testFunction: () =>
          updateCharacter({
            id: 'invalid-uuid',
            user: { id: 'user-id' },
            name: 'new-name',
          }),
      },
      {
        functionName: 'deleteCharacter',
        testFunction: () =>
          deleteCharacter({
            characterId: 'invalid-uuid',
            user: { id: 'user-id' },
          }),
      },
      {
        functionName: 'getSharedCharacter',
        testFunction: () =>
          getSharedCharacter({
            characterId: 'invalid-uuid',
            userId: 'user-id',
          }),
      },
      {
        functionName: 'uploadAvatarPictureForCharacter',
        testFunction: () =>
          uploadAvatarPictureForCharacter({
            characterId: 'invalid-uuid',
            user: { id: 'user-id' },
            croppedImageBlob: new Blob(),
          }),
      },
    ])(
      'should throw InvalidArgumentError when characterId is not a valid UUID - $functionName',
      async ({ testFunction }) => {
        await expect(testFunction()).rejects.toThrow(InvalidArgumentError);
      },
    );
  });

  describe('Link sharing bypass scenarios', () => {
    const characterId = generateUUID();
    const ownerUserId = generateUUID();

    describe('should allow access when hasLinkAccess is true - bypassing normal restrictions', () => {
      it.each([
        {
          accessLevel: 'private' as const,
          description: 'private character with link sharing enabled',
        },
        {
          accessLevel: 'school' as const,
          description: 'school character with link sharing enabled (different school)',
        },
      ])('getCharacterForChatSession - $description', async ({ accessLevel }) => {
        const mockCharacter = {
          id: characterId,
          userId: ownerUserId,
          accessLevel,
          hasLinkAccess: true,
        };

        vi.mocked(dbGetCharacterById).mockResolvedValue(mockCharacter as never);

        // User from different school trying to access - should succeed because hasLinkAccess is true
        const result = await getCharacterForChatSession({
          characterId,
          user: mockUser(),
        });

        expect(result).toBe(mockCharacter);
      });

      it.each([
        {
          accessLevel: 'private' as const,
          description: 'private character with link sharing enabled',
        },
        {
          accessLevel: 'school' as const,
          description: 'school character with link sharing enabled (different school)',
        },
      ])('getCharacterForEditView - $description', async ({ accessLevel }) => {
        const mockCharacter = {
          id: characterId,
          userId: ownerUserId,
          accessLevel,
          hasLinkAccess: true,
        };

        vi.mocked(dbGetCharacterByIdOptionalShareData).mockResolvedValue(mockCharacter as never);
        // Also mock dbGetCharacterById because fetchFileMappings -> getCharacterInfo uses it
        vi.mocked(dbGetCharacterById).mockResolvedValue(mockCharacter as never);
        vi.mocked(dbGetRelatedCharacterFiles).mockResolvedValue([]);
        vi.mocked(getReadOnlySignedUrl).mockResolvedValue('');

        // User from different school trying to access - should succeed because hasLinkAccess is true
        const result = await getCharacterForEditView({
          federalState: mockFederalState(),
          characterId,
          user: mockUser(),
        });

        expect(result.character).toBe(mockCharacter);
      });
      it('getCharacterForChatSession - school character without link sharing but shared school', async () => {
        const mockCharacter = {
          id: characterId,
          userId: ownerUserId,
          accessLevel: 'school' as const,
          hasLinkAccess: false,
          ownerSchoolIds: ['shared-school-id'],
        };

        vi.mocked(dbGetCharacterById).mockResolvedValue(mockCharacter as never);

        const result = await getCharacterForChatSession({
          characterId,
          user: { ...mockUser(), schoolIds: ['shared-school-id'] },
        });

        expect(result).toBe(mockCharacter);
      });
      it.each([
        {
          accessLevel: 'private' as const,
          description: 'private character with link sharing enabled',
        },
        {
          accessLevel: 'school' as const,
          description: 'school character with link sharing enabled (different school)',
        },
      ])('fetchFileMappings - $description', async ({ accessLevel }) => {
        const mockCharacter: Partial<CharacterSelectModel> = {
          userId: ownerUserId,
          accessLevel,
          hasLinkAccess: true,
        };

        vi.mocked(dbGetCharacterById).mockResolvedValue(mockCharacter as never);
        vi.mocked(dbGetRelatedCharacterFiles).mockResolvedValue([]);

        // Should not throw - access is allowed via link sharing
        await expect(
          fetchFileMappings({
            characterId,
            user: mockUser(),
          }),
        ).resolves.not.toThrow();
      });
    });

    describe('should still enforce restrictions when hasLinkAccess is false', () => {
      it('getCharacterForChatSession - private character without link sharing', async () => {
        const mockCharacter = {
          id: characterId,
          userId: ownerUserId,
          accessLevel: 'private' as const,
          hasLinkAccess: false,
        };

        vi.mocked(dbGetCharacterById).mockResolvedValue(mockCharacter as never);

        await expect(
          getCharacterForChatSession({
            characterId,
            user: mockUser(),
          }),
        ).rejects.toThrow(ForbiddenError);
      });

      it('getCharacterForEditView - private character without link sharing', async () => {
        const mockCharacter = {
          id: characterId,
          userId: ownerUserId,
          accessLevel: 'private' as const,
          hasLinkAccess: false,
        };

        vi.mocked(dbGetCharacterByIdOptionalShareData).mockResolvedValue(mockCharacter as never);

        await expect(
          getCharacterForEditView({
            federalState: mockFederalState(),
            characterId,
            user: mockUser(),
          }),
        ).rejects.toThrow(ForbiddenError);
      });

      it('fetchFileMappings - private character without link sharing', async () => {
        const mockCharacter: Partial<CharacterSelectModel> = {
          userId: ownerUserId,
          accessLevel: 'private',
          hasLinkAccess: false,
        };

        vi.mocked(dbGetCharacterById).mockResolvedValue(mockCharacter as never);

        await expect(
          fetchFileMappings({
            characterId,
            user: mockUser(),
          }),
        ).rejects.toThrow(ForbiddenError);
      });
    });
  });

  describe('getCharacterForEditView shared chat usage budget', () => {
    it('returns 0 when startedAt or expiredAt is missing', async () => {
      const characterId = generateUUID();
      const user = mockUser('teacher');
      const character = {
        id: characterId,
        userId: user.id,
        accessLevel: 'private',
        hasLinkAccess: false,
      } as unknown as CharacterSelectModel;

      vi.mocked(dbGetCharacterByIdOptionalShareData).mockResolvedValue(character as never);
      vi.mocked(dbGetCharacterById).mockResolvedValue(character as never);
      vi.mocked(dbGetRelatedCharacterFiles).mockResolvedValue([] as never);
      vi.mocked(getReadOnlySignedUrl).mockResolvedValue('');

      const result = await getCharacterForEditView({
        characterId,
        user,
        federalState: mockFederalState(),
      });

      expect(result.budgetUsedBySharedChat).toBe(0);
      expect(dbGetSharedCharacterChatUsageInCentByCharacterId).not.toHaveBeenCalled();
    });

    it('loads shared chat usage when startedAt and expiredAt are present', async () => {
      const characterId = generateUUID();
      const user = mockUser('teacher');
      const startedAt = new Date('2026-06-01T10:00:00.000Z');
      const expiredAt = new Date('2026-06-01T11:00:00.000Z');
      const character = {
        id: characterId,
        userId: user.id,
        accessLevel: 'private',
        hasLinkAccess: false,
        startedAt,
        expiredAt,
      } as unknown as CharacterSelectModel;

      vi.mocked(dbGetCharacterByIdOptionalShareData).mockResolvedValue(character as never);
      vi.mocked(dbGetCharacterById).mockResolvedValue(character as never);
      vi.mocked(dbGetRelatedCharacterFiles).mockResolvedValue([] as never);
      vi.mocked(getReadOnlySignedUrl).mockResolvedValue('');
      vi.mocked(dbGetSharedCharacterChatUsageInCentByCharacterId).mockResolvedValue(321);

      const result = await getCharacterForEditView({
        characterId,
        user,
        federalState: mockFederalState(),
      });

      expect(dbGetSharedCharacterChatUsageInCentByCharacterId).toHaveBeenCalledWith({
        characterId,
        userId: user.id,
        expiredAt,
        startedAt,
      });
      expect(result.budgetUsedBySharedChat).toBe(321);
    });
  });

  describe('getActiveCharacterShareData', () => {
    it('returns empty share data when no active or grace-window share exists', async () => {
      const characterId = generateUUID();
      const user = mockUser('teacher');
      const character = {
        id: characterId,
        userId: user.id,
        accessLevel: 'private',
        hasLinkAccess: false,
      } as unknown as CharacterSelectModel;

      vi.mocked(dbGetCharacterById).mockResolvedValue(character as never);
      vi.mocked(dbGetLatestManageableCharacterShare).mockResolvedValue(null as never);

      const result = await getActiveCharacterShareData({
        characterId,
        user,
        federalState: mockFederalState(),
      });

      expect(result).toEqual({
        expiredAt: null,
        manuallyStoppedAt: null,
        tokenPointsLimit: null,
        budgetUsedBySharedChat: 0,
        tokenLimitExceeded: false,
      });
      expect(dbGetSharedCharacterChatUsageInCentByCharacterId).not.toHaveBeenCalled();
    });

    it('loads usage when startedAt and expiredAt are available', async () => {
      const characterId = generateUUID();
      const user = mockUser('teacher');
      const startedAt = new Date('2026-06-01T10:00:00.000Z');
      const expiredAt = new Date('2026-06-01T11:00:00.000Z');
      const character = {
        id: characterId,
        userId: user.id,
        accessLevel: 'private',
        hasLinkAccess: false,
      } as unknown as CharacterSelectModel;
      const share = {
        id: generateUUID(),
        characterId,
        userId: user.id,
        startedAt,
        expiredAt,
        manuallyStoppedAt: null,
        tokenPointsLimit: 50,
      };

      vi.mocked(dbGetCharacterById).mockResolvedValue(character as never);
      vi.mocked(dbGetLatestManageableCharacterShare).mockResolvedValue(share as never);
      vi.mocked(dbGetSharedCharacterChatUsageInCentByCharacterId).mockResolvedValue(777);

      const result = await getActiveCharacterShareData({
        characterId,
        user,
        federalState: mockFederalState(),
      });

      expect(dbGetSharedCharacterChatUsageInCentByCharacterId).toHaveBeenCalledWith({
        characterId,
        userId: user.id,
        startedAt,
        expiredAt,
      });
      expect(result).toEqual({
        expiredAt,
        manuallyStoppedAt: null,
        tokenPointsLimit: 50,
        budgetUsedBySharedChat: 777,
        tokenLimitExceeded: true,
      });
    });

    it('throws NotFoundError when character does not exist', async () => {
      const characterId = generateUUID();
      const user = mockUser('teacher');

      vi.mocked(dbGetCharacterById).mockResolvedValue(undefined as never);

      await expect(
        getActiveCharacterShareData({ characterId, user, federalState: mockFederalState() }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('character discovery filters', () => {
    const user = mockUser('teacher');
    const characters = [
      {
        id: generateUUID(),
        userId: user.id,
        accessLevel: 'private',
        hasLinkAccess: false,
        suspended: false,
        ownerSchoolIds: user.schoolIds,
      } as CharacterSelectModel,
    ];
    it('filters suspended characters for non-owners', async () => {
      const visibleCharacter = {
        id: generateUUID(),
        userId: generateUUID(),
        accessLevel: 'global',
        hasLinkAccess: false,
        suspended: false,
        ownerSchoolIds: [],
      } as unknown as CharacterSelectModel;
      const suspendedCharacter = {
        ...visibleCharacter,
        id: generateUUID(),
        suspended: true,
      } as CharacterSelectModel;

      vi.mocked(dbGetGlobalCharacters).mockResolvedValue([
        visibleCharacter,
        suspendedCharacter,
      ] as never);

      const result = await getCharactersByOverviewFilter({ filter: 'official', user });

      expect(result).toEqual([visibleCharacter]);
    });

    it('keeps suspended characters visible for owners', async () => {
      const ownSuspendedCharacter = {
        id: generateUUID(),
        userId: user.id,
        accessLevel: 'private',
        hasLinkAccess: false,
        suspended: true,
        ownerSchoolIds: user.schoolIds,
      } as CharacterSelectModel;

      vi.mocked(dbGetAllCharactersByUser).mockResolvedValue([ownSuspendedCharacter] as never);

      const result = await getCharactersByOverviewFilter({ filter: 'mine', user });

      expect(result).toEqual([ownSuspendedCharacter]);
    });

    it.each([
      {
        accessLevel: 'community' as const,
        expectedMock: dbGetCommunityCharacters,
      },
      {
        accessLevel: 'global' as const,
        expectedMock: dbGetGlobalCharacters,
      },
      {
        accessLevel: 'school' as const,
        expectedMock: dbGetCharactersByAssociatedSchools,
      },
      {
        accessLevel: 'private' as const,
        expectedMock: dbGetCharactersByUser,
      },
    ])(
      'routes accessLevel=$accessLevel to the correct db function',
      async ({ accessLevel, expectedMock }) => {
        vi.mocked(expectedMock).mockResolvedValue(characters as never);

        const result = await getCharacterByAccessLevel({ accessLevel, user });

        expect(result).toEqual(characters);
        expect(expectedMock).toHaveBeenCalledWith({ user });
      },
    );

    it('returns an empty list for unsupported access levels', async () => {
      const result = await getCharacterByAccessLevel({
        accessLevel: 'invalid' as never,
        user,
      });

      expect(result).toEqual([]);
    });

    it('routes filter=all to dbGetAllAccessibleCharacters', async () => {
      vi.mocked(dbGetAllAccessibleCharacters).mockResolvedValue(characters as never);

      const result = await getCharactersByOverviewFilter({ filter: 'all', user });

      expect(result).toEqual(characters);
      expect(dbGetAllAccessibleCharacters).toHaveBeenCalledWith({ user });
    });

    it.each([
      { filter: 'mine' as const, expectedMock: dbGetAllCharactersByUser },
      { filter: 'official' as const, expectedMock: dbGetGlobalCharacters },
    ])('routes filter=$filter to the correct db function', async ({ filter, expectedMock }) => {
      vi.mocked(expectedMock).mockResolvedValue(characters as never);

      const result = await getCharactersByOverviewFilter({ filter, user });

      expect(result).toEqual(characters);
      expect(expectedMock).toHaveBeenCalledWith({ user });
    });

    it('routes filter=community to dbGetCommunityCharacters', async () => {
      vi.mocked(dbGetCommunityCharacters).mockResolvedValue(characters as never);

      const result = await getCharactersByOverviewFilter({ filter: 'community', user });

      expect(result).toEqual(characters);
      expect(dbGetCommunityCharacters).toHaveBeenCalledWith({ user });
    });

    it('routes filter=school to the school and community db functions', async () => {
      const schoolCharacter = {
        id: generateUUID(),
        userId: generateUUID(),
        accessLevel: 'school',
        hasLinkAccess: false,
        suspended: false,
        ownerSchoolIds: user.schoolIds,
      } as unknown as CharacterSelectModel;
      const communityCharacter = {
        id: generateUUID(),
        userId: generateUUID(),
        accessLevel: 'community',
        hasLinkAccess: false,
        suspended: false,
        ownerSchoolIds: user.schoolIds,
      } as unknown as CharacterSelectModel;
      const otherSchoolCommunityCharacter = {
        id: generateUUID(),
        userId: generateUUID(),
        accessLevel: 'community',
        hasLinkAccess: false,
        suspended: false,
        ownerSchoolIds: [],
      } as unknown as CharacterSelectModel;

      vi.mocked(dbGetCharactersByAssociatedSchools).mockResolvedValue([schoolCharacter] as never);
      vi.mocked(dbGetCommunityCharacters).mockResolvedValue([
        communityCharacter,
        otherSchoolCommunityCharacter,
      ] as never);

      const result = await getCharactersByOverviewFilter({ filter: 'school', user });

      expect(result).toEqual([schoolCharacter, communityCharacter]);
      expect(dbGetCharactersByAssociatedSchools).toHaveBeenCalledWith({ user });
      expect(dbGetCommunityCharacters).toHaveBeenCalledWith({ user });
    });

    it('returns an empty list for unsupported overview filters', async () => {
      const result = await getCharactersByOverviewFilter({
        filter: 'invalid' as never,
        user,
      });

      expect(result).toEqual([]);
    });
  });

  describe('uploadAvatarPictureForCharacter', () => {
    const characterId = generateUUID();
    const userId = generateUUID();

    beforeEach(() => {
      const mockCharacter: Partial<CharacterSelectModel> = {
        id: characterId,
        userId,
        accessLevel: 'private',
        pictureId: null,
      };
      vi.mocked(dbGetCharacterById).mockResolvedValue(mockCharacter as never);
      vi.mocked(uploadFileToS3).mockResolvedValue(undefined as never);
      mockDbReturning.mockResolvedValue([
        { id: characterId, userId, pictureId: `characters/${characterId}/avatar_abc123` },
      ]);
      vi.mocked(getAvatarPictureUrl).mockResolvedValue('https://signed-url');
    });

    it('should upload avatar, update db and return picturePath and signedUrl', async () => {
      const result = await uploadAvatarPictureForCharacter({
        characterId,
        user: { id: userId },
        croppedImageBlob: new Blob(['data'], { type: 'image/png' }),
      });

      expect(uploadFileToS3).toHaveBeenCalled();
      expect(result).toEqual({
        picturePath: `characters/${characterId}/avatar_3a6eb0790f39`,
        signedUrl: 'https://signed-url',
      });
    });
  });

  describe('getSharedCharacter', () => {
    const NOW = new Date('2026-07-20T12:00:00.000Z');

    function mockCharacterWithShareData(
      overrides: Record<string, unknown> = {},
    ): CharacterWithShareDataModel {
      return {
        id: generateUUID(),
        author: '',
        userId: generateUUID(),
        modelId: generateUUID(),
        name: 'Test Character',
        description: '',
        instructions: '',
        learningContext: '',
        competence: '',
        filterGroup: {
          school_types: [],
          grade_ranges: [],
          subjects: [],
          categories: [],
          federal_states: [],
          languages: [],
        },
        accessLevel: 'private' as const,
        hasLinkAccess: false,
        isWebSearchEnabled: false,
        createdAt: NOW,
        updatedAt: NOW,
        attachedLinks: [],
        suspended: false,
        isDeleted: false,
        ownerSchoolIds: [],
        specifications: null,
        restrictions: null,
        pictureId: null,
        initialMessage: null,
        originalCharacterId: null,
        tokenPointsLimit: 50,
        maxUsageTimeLimit: 60,
        inviteCode: 'TEST1234',
        startedAt: NOW,
        expiredAt: new Date(NOW.getTime() + 60 * 60 * 1000),
        manuallyStoppedAt: null,
        startedBy: generateUUID(),
        webSearchIncludedDomains: [],
        webSearchScope: 'all-web',
        ...overrides,
      };
    }

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns the character when the share is active', async () => {
      const characterId = generateUUID();
      const userId = generateUUID();
      const character = mockCharacterWithShareData({
        id: characterId,
        userId,
        expiredAt: new Date(NOW.getTime() + 60 * 60 * 1000),
      });
      vi.mocked(dbGetCharacterByIdWithShareData).mockResolvedValue(character as never);

      const result = await getSharedCharacter({ characterId, userId });

      expect(result).toBe(character);
    });

    it('returns the character when the share has expired but is within the grace window', async () => {
      const characterId = generateUUID();
      const userId = generateUUID();
      const character = mockCharacterWithShareData({
        id: characterId,
        userId,
        expiredAt: new Date(NOW.getTime() - 60 * 60 * 1000), // expired 1 hour ago, within 2-hour grace window
      });
      vi.mocked(dbGetCharacterByIdWithShareData).mockResolvedValue(character as never);

      const result = await getSharedCharacter({ characterId, userId });

      expect(result).toBe(character);
    });

    it('throws NotFoundError when the share has expired beyond the grace window', async () => {
      const characterId = generateUUID();
      const userId = generateUUID();
      const character = mockCharacterWithShareData({
        id: characterId,
        userId,
        expiredAt: new Date(NOW.getTime() - SHARE_EXTENSION_WINDOW_MS - 1000), // expired 2 hours and 1 second ago
      });
      vi.mocked(dbGetCharacterByIdWithShareData).mockResolvedValue(character as never);

      await expect(getSharedCharacter({ characterId, userId })).rejects.toThrow(NotFoundError);
    });

    it('throws NotFoundError when the share was manually stopped', async () => {
      const characterId = generateUUID();
      const userId = generateUUID();
      const character = mockCharacterWithShareData({
        id: characterId,
        userId,
        expiredAt: new Date(NOW.getTime() + 60 * 60 * 1000), // still active time-wise
        manuallyStoppedAt: new Date(NOW.getTime() - 30 * 60 * 1000), // but manually stopped 30 min ago
      });
      vi.mocked(dbGetCharacterByIdWithShareData).mockResolvedValue(character as never);

      await expect(getSharedCharacter({ characterId, userId })).rejects.toThrow(NotFoundError);
    });
  });
});
