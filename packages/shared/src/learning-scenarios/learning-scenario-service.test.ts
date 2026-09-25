import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createNewLearningScenarioFromTemplate,
  deleteLearningScenario,
  downloadFileFromLearningScenario,
  extendLearningScenarioShareExpiration,
  getActiveLearningScenarioShareData,
  getFilesForLearningScenario,
  getLearningScenariosByAccessLevel,
  getLearningScenariosByOverviewFilter,
  getLearningScenariosForUser,
  getLearningScenarioForEditView,
  getLearningScenarioForChatSession,
  getLearningScenarioForExistingConversation,
  getSharedLearningScenario,
  linkFileToLearningScenario,
  removeFileFromLearningScenario,
  shareLearningScenario,
  unshareLearningScenario,
  updateLearningScenario,
  updateLearningScenarioAccessLevel,
  updateLearningScenarioShareTokenPointsLimit,
  uploadAvatarPictureForLearningScenario,
} from './learning-scenario-service';
import {
  dbGetAllAccessibleLearningScenarios,
  dbGetAllLearningScenariosByUser,
  dbGetCommunityLearningScenarios,
  dbCreateLearningScenarioShare,
  dbExtendSharedLearningScenarioExpiration,
  dbGetGlobalLearningScenarios,
  dbGetLatestManageableLearningScenarioShare,
  dbGetLearningScenarioById,
  dbGetLearningScenarioByIdForConversation,
  dbGetLearningScenarioByIdOptionalShareData,
  dbGetLearningScenarioByIdWithShareData,
  dbGetLearningScenariosByAssociatedSchools,
  dbGetLearningScenariosByUser,
  dbStopLearningScenarioShare,
  dbUpdateLearningScenarioShareTokenPointsLimit,
} from '../db/functions/learning-scenario';
import { dbGetFileForLearningScenario, dbGetFilesForLearningScenario } from '../db/functions/files';
import { getAvatarPictureUrl } from '../files/fileService';
import { generateUUID } from '../utils/uuid';
import { LearningScenarioSelectModel, LearningScenarioWithShareDataModel } from '@shared/db/schema';
import { SHARE_EXTENSION_WINDOW_MS } from '../sharing/const';
import { ForbiddenError, InvalidArgumentError, NotFoundError } from '@shared/error';
import { UserModel } from '@shared/auth/user-model';
import { FederalStateModel } from '@shared/federal-states/types';
import { getReadOnlySignedUrl, uploadFileToS3 } from '../s3';
import { duplicateLearningScenario } from './learning-scenario-admin-service';
import { getMaxBudgetInCentByUser, getUsedBudgetInCentByUser } from '../users/user-budget-service';
import { dbGetLearningScenarioChatUsageInCentByLearningScenarioId } from '@shared/db/functions/token-points';

vi.mock('../db/functions/learning-scenario', () => ({
  dbGetAllAccessibleLearningScenarios: vi.fn(),
  dbGetAllLearningScenariosByUser: vi.fn(),
  dbGetCommunityLearningScenarios: vi.fn(),
  dbCreateLearningScenarioShare: vi.fn(),
  dbExtendSharedLearningScenarioExpiration: vi.fn(),
  dbGetGlobalLearningScenarios: vi.fn(),
  dbGetLatestManageableLearningScenarioShare: vi.fn(),
  dbGetLearningScenarioById: vi.fn(),
  dbGetLearningScenarioByIdForConversation: vi.fn(),
  dbGetLearningScenarioByIdOptionalShareData: vi.fn(),
  dbGetLearningScenarioByIdWithShareData: vi.fn(),
  dbGetLearningScenariosByAssociatedSchools: vi.fn(),
  dbGetLearningScenariosByUser: vi.fn(),
  dbStopLearningScenarioShare: vi.fn(),
  dbUpdateLearningScenarioShareTokenPointsLimit: vi.fn(),
}));
vi.mock('./learning-scenario-admin-service', () => ({
  duplicateLearningScenario: vi.fn(),
}));
vi.mock('../db/functions/files', () => ({
  dbGetFileForLearningScenario: vi.fn(),
  dbGetFilesForLearningScenario: vi.fn(),
}));
vi.mock('../files/fileService', () => ({
  getAvatarPictureUrl: vi.fn(),
  deleteAvatarPicture: vi.fn(),
  deleteMessageAttachments: vi.fn(),
}));
vi.mock('../s3', () => ({
  getReadOnlySignedUrl: vi.fn(),
  uploadFileToS3: vi.fn(),
  deleteFileFromS3: vi.fn(),
}));
const { mockDbReturning, mockDbSet, mockDbUpdate } = vi.hoisted(() => {
  const mockDbReturning = vi.fn();
  const mockDbUpdateWhere = vi.fn(() => ({ returning: mockDbReturning }));
  const mockDbSet = vi.fn(() => ({ where: mockDbUpdateWhere }));
  const mockDbUpdate = vi.fn(() => ({ set: mockDbSet }));

  return {
    mockDbReturning,
    mockDbSet,
    mockDbUpdate,
  };
});
vi.mock('@shared/db', () => ({ db: { update: mockDbUpdate } }));
vi.mock('../users/user-budget-service', () => ({
  getMaxBudgetInCentByUser: vi.fn(),
  getUsedBudgetInCentByUser: vi.fn(),
}));
vi.mock('@shared/db/functions/token-points', () => ({
  dbGetLearningScenarioChatUsageInCentByLearningScenarioId: vi.fn(),
}));

const mockUser = (userRole: 'student' | 'teacher' = 'teacher'): UserModel => ({
  id: generateUUID(),
  lastUsedModel: null,
  versionAcceptedConditions: null,
  createdAt: new Date(),
  userRole,
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

function buildFunctionList(
  {
    learningScenarioId,
    user,
    federalState,
  }: {
    learningScenarioId?: string;
    user?: UserModel;
    federalState?: FederalStateModel;
  },
  ...modes: ('read' | 'write' | 'unshare' | 'read-by-invite-code')[]
) {
  const fileId = generateUUID();
  learningScenarioId ??= generateUUID();
  user ??= mockUser();
  federalState ??= mockFederalState();

  const writeAccess = [
    {
      functionName: deleteLearningScenario.name,
      testFunction: () =>
        deleteLearningScenario({
          learningScenarioId,
          user,
        }),
    },
    {
      functionName: linkFileToLearningScenario.name,
      testFunction: () =>
        linkFileToLearningScenario({
          fileId,
          learningScenarioId,
          user,
        }),
    },
    {
      functionName: updateLearningScenarioAccessLevel.name,
      testFunction: () =>
        updateLearningScenarioAccessLevel({
          accessLevel: 'private',
          learningScenarioId,
          user,
        }),
    },
    {
      functionName: uploadAvatarPictureForLearningScenario.name,
      testFunction: () =>
        uploadAvatarPictureForLearningScenario({
          learningScenarioId,
          croppedImageBlob: new Blob(),
          user,
        }),
    },
    {
      functionName: updateLearningScenario.name,
      testFunction: () =>
        updateLearningScenario({
          data: {} as LearningScenarioSelectModel,
          learningScenarioId,
          user,
        }),
    },
    {
      functionName: removeFileFromLearningScenario.name,
      testFunction: () =>
        removeFileFromLearningScenario({
          fileId,
          learningScenarioId,
          user,
        }),
    },
  ];
  const readAccess = [
    {
      functionName: getLearningScenarioForEditView.name,
      testFunction: () =>
        getLearningScenarioForEditView({
          learningScenarioId,
          user,
          federalState,
        }),
    },
    {
      functionName: createNewLearningScenarioFromTemplate.name,
      testFunction: () =>
        createNewLearningScenarioFromTemplate({
          originalLearningScenarioId: learningScenarioId,
          user,
        }),
    },
    {
      functionName: shareLearningScenario.name,
      testFunction: () =>
        shareLearningScenario({
          data: { tokenPointsPercentageLimit: 50, usageTimeLimit: 60 },
          learningScenarioId,
          user,
        }),
    },
    {
      functionName: downloadFileFromLearningScenario.name,
      testFunction: () =>
        downloadFileFromLearningScenario({
          learningScenarioId,
          fileId,
          user,
        }),
    },
  ];
  const readByInviteCode = [
    {
      functionName: getSharedLearningScenario.name,
      testFunction: () =>
        getSharedLearningScenario({
          learningScenarioId,
          user,
        }),
    },
  ];
  const unshare = [
    {
      functionName: unshareLearningScenario.name,
      testFunction: () =>
        unshareLearningScenario({
          learningScenarioId,
          user,
        }),
    },
  ];

  return [
    ...(modes.includes('read') ? readAccess : []),
    ...(modes.includes('read-by-invite-code') ? readByInviteCode : []),
    ...(modes.includes('write') ? writeAccess : []),
    ...(modes.includes('unshare') ? unshare : []),
  ].sort((a, b) => a.functionName.localeCompare(b.functionName));
}

describe('learning-scenario-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set default mock return values for budget functions
    vi.mocked(getMaxBudgetInCentByUser).mockResolvedValue(500);
    vi.mocked(getUsedBudgetInCentByUser).mockResolvedValue(0);
  });

  describe('NotFoundError scenarios', () => {
    const learningScenarioId = generateUUID();
    const user = mockUser();

    it.each(
      buildFunctionList({ learningScenarioId, user }, 'read', 'write', 'read-by-invite-code'),
    )(
      'should throw NotFoundError when learning scenario does not exist - $functionName',
      async ({ testFunction }) => {
        vi.mocked(dbGetLearningScenarioById).mockResolvedValue(null as never);

        await expect(testFunction()).rejects.toThrow(NotFoundError);
      },
    );
  });

  describe('ForbiddenError scenarios', () => {
    const userId = generateUUID();
    const learningScenarioId = generateUUID();
    let mockLearningScenario: Partial<LearningScenarioSelectModel>;

    beforeEach(() => {
      mockLearningScenario = {
        userId,
        id: learningScenarioId,
        name: 'Test Scenario',
        accessLevel: 'private',
        hasLinkAccess: false,
        suspended: false,
        ownerSchoolIds: [],
      };
      vi.mocked(dbGetLearningScenarioById).mockResolvedValue(mockLearningScenario as never);
      vi.mocked(dbGetLearningScenarioByIdOptionalShareData).mockResolvedValue(
        mockLearningScenario as never,
      );
      vi.mocked(dbGetLearningScenarioByIdWithShareData).mockResolvedValue(
        mockLearningScenario as never,
      );
      vi.mocked(dbGetLearningScenarioById).mockResolvedValue(mockLearningScenario as never);
    });

    describe('accessLevel=private and user not owner', () => {
      const differentUser = mockUser();

      beforeEach(() => {
        mockLearningScenario.accessLevel = 'private';
      });

      it.each(buildFunctionList({ learningScenarioId, user: differentUser }, 'read', 'write'))(
        'should throw ForbiddenError when user is not the owner - $functionName',
        async ({ testFunction }) => {
          await expect(testFunction()).rejects.toThrow(ForbiddenError);
        },
      );
    });

    describe('accessLevel=school and user not in same school', () => {
      const differentUser = { ...mockUser(), schoolIds: ['viewer-school-id'] };

      beforeEach(() => {
        mockLearningScenario.accessLevel = 'school';
        mockLearningScenario.ownerSchoolIds = ['owner-school-id'];
      });

      it.each(buildFunctionList({ learningScenarioId, user: differentUser }, 'read', 'write'))(
        'should throw ForbiddenError when school shared but user is not in the same school - $functionName',
        async ({ testFunction }) => {
          await expect(testFunction()).rejects.toThrow(ForbiddenError);
        },
      );
    });

    it('should throw when copying a suspended learning scenario template', async () => {
      const user = mockUser('teacher');
      vi.mocked(dbGetLearningScenarioById).mockResolvedValue({
        ...mockLearningScenario,
        userId: user.id,
        suspended: true,
      } as never);

      await expect(
        createNewLearningScenarioFromTemplate({
          originalLearningScenarioId: learningScenarioId,
          user,
        }),
      ).rejects.toThrow(ForbiddenError);

      expect(duplicateLearningScenario).not.toHaveBeenCalled();
    });
  });

  describe('ForbiddenError scenarios - role restrictions', () => {
    const student = mockUser('student');

    it.each(buildFunctionList({ user: student }, 'read', 'write', 'unshare'))(
      'should throw ForbiddenError when user is not a teacher - $functionName',
      async ({ testFunction }) => {
        await expect(testFunction()).rejects.toThrow(ForbiddenError);
      },
    );
  });

  describe('ForbiddenError scenarios - invalid arguments', () => {
    const user = mockUser();
    const learningScenarioId = generateUUID();
    const mockLearningScenario: Partial<LearningScenarioSelectModel> = {
      userId: user.id,
      id: learningScenarioId,
      name: 'Test Scenario',
      accessLevel: 'private',
    };

    beforeEach(() => {
      vi.mocked(dbGetLearningScenarioById).mockResolvedValue(mockLearningScenario as never);
    });

    it('should throw ForbiddenError when setting access level to global - updateLearningScenarioAccessLevel', async () => {
      await expect(
        updateLearningScenarioAccessLevel({
          learningScenarioId,
          user,
          accessLevel: 'global',
        }),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe('sharing updates preserve updatedAt', () => {
    it('preserves updatedAt when only accessLevel changes', async () => {
      const user = mockUser('teacher');
      const learningScenarioId = generateUUID();
      const updatedAt = new Date('2026-06-01T10:00:00.000Z');
      const learningScenario = {
        id: learningScenarioId,
        userId: user.id,
        accessLevel: 'private',
        hasLinkAccess: false,
        updatedAt,
      } as Partial<LearningScenarioSelectModel>;

      vi.mocked(dbGetLearningScenarioById).mockResolvedValue(learningScenario as never);
      mockDbReturning.mockResolvedValue([
        { ...learningScenario, accessLevel: 'school' } as LearningScenarioSelectModel,
      ]);

      await updateLearningScenarioAccessLevel({ learningScenarioId, user, accessLevel: 'school' });

      expect(mockDbSet).toHaveBeenCalledWith({ accessLevel: 'school', updatedAt });
    });

    it('preserves updatedAt when only hasLinkAccess changes', async () => {
      const user = mockUser('teacher');
      const learningScenarioId = generateUUID();
      const updatedAt = new Date('2026-06-01T10:00:00.000Z');
      const learningScenario = {
        id: learningScenarioId,
        userId: user.id,
        hasLinkAccess: false,
        updatedAt,
      } as Partial<LearningScenarioSelectModel>;

      vi.mocked(dbGetLearningScenarioById).mockResolvedValue(learningScenario as never);
      mockDbReturning.mockResolvedValue([
        { ...learningScenario, hasLinkAccess: true } as LearningScenarioSelectModel,
      ]);

      await updateLearningScenario({
        learningScenarioId,
        user,
        data: { id: learningScenarioId, hasLinkAccess: true } as LearningScenarioSelectModel,
      });

      expect(mockDbSet).toHaveBeenCalledWith({
        id: learningScenarioId,
        hasLinkAccess: true,
        updatedAt,
      });
    });
  });

  describe('InvalidArgumentError scenarios - invalid parameter format', () => {
    it.each(
      buildFunctionList(
        { learningScenarioId: 'invalid-uuid' },
        'read',
        'write',
        'read-by-invite-code',
        'unshare',
      ),
    )(
      'should throw InvalidArgumentError when learningScenarioId is not a valid UUID - $functionName',
      async ({ testFunction }) => {
        await expect(testFunction()).rejects.toThrow(InvalidArgumentError);
      },
    );
  });

  describe('Link sharing bypass scenarios', () => {
    const learningScenarioId = generateUUID();
    const ownerUserId = generateUUID();
    const differentUser = mockUser();

    describe('should allow access when hasLinkAccess is true - bypassing normal restrictions', () => {
      it.each([
        {
          accessLevel: 'private' as const,
          description: 'private learning scenario with link sharing enabled',
        },
        {
          accessLevel: 'school' as const,
          description: 'school learning scenario with link sharing enabled (different school)',
        },
      ])('getLearningScenario - $description', async ({ accessLevel }) => {
        const mockLearningScenario = {
          id: learningScenarioId,
          userId: ownerUserId,
          accessLevel,
          hasLinkAccess: true,
        };

        vi.mocked(dbGetLearningScenarioByIdOptionalShareData).mockResolvedValue(
          mockLearningScenario as never,
        );
        // Also mock dbGetLearningScenarioById because getFilesForLearningScenario -> getLearningScenarioInfo uses it
        vi.mocked(dbGetLearningScenarioById).mockResolvedValue(mockLearningScenario as never);
        vi.mocked(dbGetFilesForLearningScenario).mockResolvedValue([]);
        vi.mocked(getAvatarPictureUrl).mockResolvedValue(undefined);

        // User from different school trying to access - should succeed because hasLinkAccess is true
        const result = await getLearningScenarioForEditView({
          learningScenarioId,
          user: differentUser,
          federalState: mockFederalState(),
        });

        expect(result.learningScenario).toBe(mockLearningScenario);
      });

      it.each([
        {
          accessLevel: 'private' as const,
          description: 'private learning scenario with link sharing enabled',
        },
        {
          accessLevel: 'school' as const,
          description: 'school learning scenario with link sharing enabled (different school)',
        },
      ])('getFilesForLearningScenario - $description', async ({ accessLevel }) => {
        const mockLearningScenario: Partial<LearningScenarioSelectModel> = {
          userId: ownerUserId,
          accessLevel,
          hasLinkAccess: true,
        };

        vi.mocked(dbGetLearningScenarioById).mockResolvedValue(mockLearningScenario as never);
        vi.mocked(dbGetFilesForLearningScenario).mockResolvedValue([]);

        // Should not throw - access is allowed via link sharing
        await expect(
          getFilesForLearningScenario({
            learningScenarioId,
            user: differentUser,
          }),
        ).resolves.not.toThrow();
      });
    });

    describe('should still enforce restrictions when hasLinkAccess is false', () => {
      it('getLearningScenario - private learning scenario without link sharing', async () => {
        const mockLearningScenario = {
          id: learningScenarioId,
          userId: ownerUserId,
          accessLevel: 'private' as const,
          hasLinkAccess: false,
        };

        vi.mocked(dbGetLearningScenarioByIdOptionalShareData).mockResolvedValue(
          mockLearningScenario as never,
        );

        await expect(
          getLearningScenarioForEditView({
            learningScenarioId,
            user: differentUser,
            federalState: mockFederalState(),
          }),
        ).rejects.toThrow(ForbiddenError);
      });

      it('getFilesForLearningScenario - private learning scenario without link sharing', async () => {
        const mockLearningScenario: Partial<LearningScenarioSelectModel> = {
          userId: ownerUserId,
          accessLevel: 'private',
          hasLinkAccess: false,
        };

        vi.mocked(dbGetLearningScenarioById).mockResolvedValue(mockLearningScenario as never);

        await expect(
          getFilesForLearningScenario({
            learningScenarioId,
            user: differentUser,
          }),
        ).rejects.toThrow(ForbiddenError);
      });
    });
  });

  describe('getLearningScenarioForEditView shared chat usage budget', () => {
    it('returns 0 when startedAt or expiredAt is missing', async () => {
      const learningScenarioId = generateUUID();
      const user = mockUser('teacher');
      const learningScenario = {
        id: learningScenarioId,
        userId: user.id,
        accessLevel: 'private',
        hasLinkAccess: false,
      } as unknown as LearningScenarioSelectModel;

      vi.mocked(dbGetLearningScenarioByIdOptionalShareData).mockResolvedValue(
        learningScenario as never,
      );
      vi.mocked(dbGetLearningScenarioById).mockResolvedValue(learningScenario as never);
      vi.mocked(dbGetFilesForLearningScenario).mockResolvedValue([] as never);
      vi.mocked(getAvatarPictureUrl).mockResolvedValue(undefined);

      const result = await getLearningScenarioForEditView({
        learningScenarioId,
        user,
        federalState: mockFederalState(),
      });

      expect(result.budgetUsedBySharedChat).toBe(0);
      expect(dbGetLearningScenarioChatUsageInCentByLearningScenarioId).not.toHaveBeenCalled();
    });

    it('loads shared chat usage when startedAt and expiredAt are present', async () => {
      const learningScenarioId = generateUUID();
      const user = mockUser('teacher');
      const startedAt = new Date('2026-06-01T10:00:00.000Z');
      const expiredAt = new Date('2026-06-01T11:00:00.000Z');
      const learningScenario = {
        id: learningScenarioId,
        userId: user.id,
        accessLevel: 'private',
        hasLinkAccess: false,
        startedAt,
        expiredAt,
      } as unknown as LearningScenarioSelectModel;

      vi.mocked(dbGetLearningScenarioByIdOptionalShareData).mockResolvedValue(
        learningScenario as never,
      );
      vi.mocked(dbGetLearningScenarioById).mockResolvedValue(learningScenario as never);
      vi.mocked(dbGetFilesForLearningScenario).mockResolvedValue([] as never);
      vi.mocked(getAvatarPictureUrl).mockResolvedValue(undefined);
      vi.mocked(dbGetLearningScenarioChatUsageInCentByLearningScenarioId).mockResolvedValue(654);

      const result = await getLearningScenarioForEditView({
        learningScenarioId,
        user,
        federalState: mockFederalState(),
      });

      expect(dbGetLearningScenarioChatUsageInCentByLearningScenarioId).toHaveBeenCalledWith({
        learningScenarioId,
        userId: user.id,
        expiredAt,
        startedAt,
      });
      expect(result.budgetUsedBySharedChat).toBe(654);
    });
  });

  describe('getActiveLearningScenarioShareData', () => {
    it('returns empty share data when no active or grace-window share exists', async () => {
      const learningScenarioId = generateUUID();
      const user = mockUser('teacher');
      const learningScenario = {
        id: learningScenarioId,
        userId: user.id,
        accessLevel: 'private',
        hasLinkAccess: false,
      } as unknown as LearningScenarioSelectModel;

      vi.mocked(dbGetLearningScenarioById).mockResolvedValue(learningScenario as never);
      vi.mocked(dbGetLatestManageableLearningScenarioShare).mockResolvedValue(null as never);

      const result = await getActiveLearningScenarioShareData({
        learningScenarioId,
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
      expect(dbGetLearningScenarioChatUsageInCentByLearningScenarioId).not.toHaveBeenCalled();
    });

    it('loads usage when startedAt and expiredAt are available', async () => {
      const learningScenarioId = generateUUID();
      const user = mockUser('teacher');
      const startedAt = new Date('2026-06-01T10:00:00.000Z');
      const expiredAt = new Date('2026-06-01T11:00:00.000Z');
      const learningScenario = {
        id: learningScenarioId,
        userId: user.id,
        accessLevel: 'private',
        hasLinkAccess: false,
      } as unknown as LearningScenarioSelectModel;
      const share = {
        id: generateUUID(),
        learningScenarioId,
        userId: user.id,
        startedAt,
        expiredAt,
        manuallyStoppedAt: null,
        tokenPointsLimit: 75,
      };

      vi.mocked(dbGetLearningScenarioById).mockResolvedValue(learningScenario as never);
      vi.mocked(dbGetLatestManageableLearningScenarioShare).mockResolvedValue(share as never);
      vi.mocked(dbGetLearningScenarioChatUsageInCentByLearningScenarioId).mockResolvedValue(432);

      const result = await getActiveLearningScenarioShareData({
        learningScenarioId,
        user,
        federalState: mockFederalState(),
      });

      expect(dbGetLearningScenarioChatUsageInCentByLearningScenarioId).toHaveBeenCalledWith({
        learningScenarioId,
        userId: user.id,
        startedAt,
        expiredAt,
      });
      expect(result).toEqual({
        expiredAt,
        manuallyStoppedAt: null,
        tokenPointsLimit: 75,
        budgetUsedBySharedChat: 432,
        tokenLimitExceeded: true,
      });
    });

    it('throws NotFoundError when learning scenario does not exist', async () => {
      const learningScenarioId = generateUUID();
      const user = mockUser('teacher');

      vi.mocked(dbGetLearningScenarioById).mockResolvedValue(undefined as never);

      await expect(
        getActiveLearningScenarioShareData({
          learningScenarioId,
          user,
          federalState: mockFederalState(),
        }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('getLearningScenarioForChatSession', () => {
    const learningScenarioId = generateUUID();

    it('returns the learning scenario when user has read access', async () => {
      const user = mockUser('teacher');
      const learningScenario = {
        id: learningScenarioId,
        userId: user.id,
        accessLevel: 'private',
        hasLinkAccess: false,
      } as unknown as LearningScenarioSelectModel;

      vi.mocked(dbGetLearningScenarioById).mockResolvedValue(learningScenario as never);

      const result = await getLearningScenarioForChatSession({
        learningScenarioId,
        user,
      });

      expect(result).toBe(learningScenario);
    });

    it('throws NotFoundError when learning scenario does not exist', async () => {
      const user = mockUser('teacher');
      vi.mocked(dbGetLearningScenarioById).mockResolvedValue(null as never);

      await expect(
        getLearningScenarioForChatSession({
          learningScenarioId,
          user,
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it('throws ForbiddenError for private learning scenarios when user is not owner', async () => {
      const user = mockUser('teacher');
      const learningScenario = {
        id: learningScenarioId,
        userId: generateUUID(),
        accessLevel: 'private',
        hasLinkAccess: false,
      } as unknown as LearningScenarioSelectModel;

      vi.mocked(dbGetLearningScenarioById).mockResolvedValue(learningScenario as never);

      await expect(
        getLearningScenarioForChatSession({
          learningScenarioId,
          user,
        }),
      ).rejects.toThrow(ForbiddenError);
    });

    it('allows access when hasLinkAccess is true', async () => {
      const user = mockUser('teacher');
      const learningScenario = {
        id: learningScenarioId,
        userId: generateUUID(),
        accessLevel: 'private',
        hasLinkAccess: true,
      } as unknown as LearningScenarioSelectModel;

      vi.mocked(dbGetLearningScenarioById).mockResolvedValue(learningScenario as never);

      await expect(
        getLearningScenarioForChatSession({
          learningScenarioId,
          user,
        }),
      ).resolves.toBe(learningScenario);
    });
  });

  describe('getLearningScenarioForExistingConversation', () => {
    const learningScenarioId = generateUUID();
    const conversationId = generateUUID();

    it('returns the learning scenario when it is linked to the given conversation', async () => {
      const user = mockUser('teacher');
      const learningScenario = {
        id: learningScenarioId,
        userId: user.id,
        accessLevel: 'private',
        hasLinkAccess: false,
      } as unknown as LearningScenarioSelectModel;
      vi.mocked(dbGetLearningScenarioByIdForConversation).mockResolvedValue(
        learningScenario as never,
      );

      const result = await getLearningScenarioForExistingConversation({
        learningScenarioId,
        conversationId,
        user,
      });

      expect(result).toBe(learningScenario);
      expect(dbGetLearningScenarioByIdForConversation).toHaveBeenCalledWith({
        learningScenarioId,
        conversationId,
        userId: user.id,
      });
    });

    it('throws NotFoundError when the learning scenario is not linked to the conversation', async () => {
      vi.mocked(dbGetLearningScenarioByIdForConversation).mockResolvedValue(undefined);

      await expect(
        getLearningScenarioForExistingConversation({
          learningScenarioId,
          conversationId,
          user: mockUser('teacher'),
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it('throws ForbiddenError when the user is not authorized to read the learning scenario', async () => {
      const learningScenario = {
        id: learningScenarioId,
        userId: generateUUID(),
        accessLevel: 'private',
        hasLinkAccess: false,
      } as unknown as LearningScenarioSelectModel;
      vi.mocked(dbGetLearningScenarioByIdForConversation).mockResolvedValue(
        learningScenario as never,
      );

      await expect(
        getLearningScenarioForExistingConversation({
          learningScenarioId,
          conversationId,
          user: mockUser('teacher'),
        }),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe('Success scenarios', () => {
    const userId = generateUUID();
    const sharedSchoolId = generateUUID();
    const learningScenarioId = generateUUID();
    let mockLearningScenario: Partial<LearningScenarioSelectModel>;

    beforeEach(() => {
      mockLearningScenario = {
        accessLevel: 'private',
        hasLinkAccess: false,
        id: learningScenarioId,
        name: 'Test Scenario',
        modelId: generateUUID(),
        userId,
      };
      vi.mocked(dbGetLearningScenarioById).mockResolvedValue(mockLearningScenario as never);
      vi.mocked(dbGetLearningScenarioByIdOptionalShareData).mockResolvedValue(
        mockLearningScenario as never,
      );
      vi.mocked(dbGetLearningScenarioByIdWithShareData).mockResolvedValue(
        mockLearningScenario as never,
      );
      vi.mocked(dbCreateLearningScenarioShare).mockResolvedValue(mockLearningScenario as never);
      vi.mocked(dbGetLatestManageableLearningScenarioShare).mockResolvedValue(null as never);
      vi.mocked(dbGetFileForLearningScenario).mockResolvedValue({} as never);
      vi.mocked(getReadOnlySignedUrl).mockResolvedValue('');
    });

    describe('user is owner', () => {
      it.each(
        buildFunctionList({ learningScenarioId, user: { ...mockUser(), id: userId } }, 'read'),
      )('should not throw when user is the owner - $functionName', async ({ testFunction }) => {
        await expect(testFunction()).resolves.not.toThrow();
      });
    });

    describe('link is shared', () => {
      const differentUser = mockUser();

      beforeEach(() => {
        mockLearningScenario.hasLinkAccess = true;
      });

      it.each(buildFunctionList({ learningScenarioId, user: differentUser }, 'read'))(
        'should not throw when link is shared - $functionName',
        async ({ testFunction }) => {
          await expect(testFunction()).resolves.not.toThrow();
        },
      );
    });

    describe('shared with school', () => {
      const differentUser = { ...mockUser(), schoolIds: [sharedSchoolId] };

      beforeEach(() => {
        mockLearningScenario.accessLevel = 'school';
        mockLearningScenario.ownerSchoolIds = [sharedSchoolId];
      });

      it.each(buildFunctionList({ learningScenarioId, user: differentUser }, 'read'))(
        'should not throw when shared with school - $functionName',
        async ({ testFunction }) => {
          await expect(testFunction()).resolves.not.toThrow();
        },
      );
    });

    describe('shared globally', () => {
      const differentUser = mockUser();

      beforeEach(() => {
        mockLearningScenario.accessLevel = 'global';
      });

      it.each(buildFunctionList({ learningScenarioId, user: differentUser }, 'read'))(
        'should not throw when shared globally - $functionName',
        async ({ testFunction }) => {
          await expect(testFunction()).resolves.not.toThrow();
        },
      );
    });
  });

  describe('uploadAvatarPictureForLearningScenario', () => {
    const learningScenarioId = generateUUID();
    const user = mockUser();

    beforeEach(() => {
      const mockLearningScenario: Partial<LearningScenarioSelectModel> = {
        id: learningScenarioId,
        userId: user.id,
        accessLevel: 'private',
        pictureId: null,
      };
      vi.mocked(dbGetLearningScenarioById).mockResolvedValue(mockLearningScenario as never);
      vi.mocked(uploadFileToS3).mockResolvedValue(undefined as never);
      mockDbReturning.mockResolvedValue([
        {
          id: learningScenarioId,
          userId: user.id,
          pictureId: `shared-chats/${learningScenarioId}/avatar_abc123`,
        },
      ]);
      vi.mocked(getAvatarPictureUrl).mockResolvedValue('https://signed-url');
    });

    it('should upload avatar, update db and return picturePath and signedUrl', async () => {
      const result = await uploadAvatarPictureForLearningScenario({
        learningScenarioId,
        user,
        croppedImageBlob: new Blob(['data'], { type: 'image/png' }),
      });

      expect(uploadFileToS3).toHaveBeenCalled();
      expect(mockDbUpdate).toHaveBeenCalled();
      expect(result).toEqual({
        picturePath: `shared-chats/${learningScenarioId}/avatar_3a6eb0790f39`,
        signedUrl: 'https://signed-url',
      });
    });
  });

  describe('unshareLearningScenario - NotFoundError when no active share', () => {
    const learningScenarioId = generateUUID();
    const user = mockUser('teacher');
    beforeEach(() => {
      vi.mocked(dbGetLatestManageableLearningScenarioShare).mockResolvedValue(null as never);
    });

    it('throws NotFoundError when the teacher has no active share to stop', async () => {
      await expect(unshareLearningScenario({ learningScenarioId, user })).rejects.toThrow(
        NotFoundError,
      );
    });
  });

  describe('extendLearningScenarioShareExpiration', () => {
    const userId = generateUUID();
    const learningScenarioId = generateUUID();
    const user = { ...mockUser('teacher'), id: userId };
    const mockLearningScenario: Partial<LearningScenarioSelectModel> = {
      id: learningScenarioId,
      userId,
      accessLevel: 'private',
      hasLinkAccess: false,
      name: 'Test Scenario',
    };
    const updatedShare = {
      id: generateUUID(),
      learningScenarioId,
      userId,
      expiredAt: new Date('2026-07-01T12:30:00.000Z'),
    };
    const currentShare = {
      id: generateUUID(),
      learningScenarioId,
      userId,
      tokenPointsLimit: 50,
      maxUsageTimeLimit: 60,
      expiredAt: new Date(Date.now() + 60 * 60_000),
    };

    beforeEach(() => {
      vi.mocked(dbGetLearningScenarioById).mockResolvedValue(mockLearningScenario as never);
      vi.mocked(dbGetLatestManageableLearningScenarioShare).mockResolvedValue(
        currentShare as never,
      );
      vi.mocked(dbExtendSharedLearningScenarioExpiration).mockResolvedValue(updatedShare as never);
    });

    it('returns the updated share when the expiration is extended', async () => {
      const result = await extendLearningScenarioShareExpiration({
        learningScenarioId,
        additionalTimeInMinutes: 30,
        user,
      });

      expect(dbExtendSharedLearningScenarioExpiration).toHaveBeenCalledWith({
        learningScenarioId,
        user,
        additionalTimeInMinutes: 30,
      });
      expect(result).toBe(updatedShare);
    });

    it.each([0, 43201])(
      'throws InvalidArgumentError for an out-of-range additional time value (%s)',
      async (additionalTimeInMinutes) => {
        await expect(
          extendLearningScenarioShareExpiration({
            learningScenarioId,
            additionalTimeInMinutes,
            user,
          }),
        ).rejects.toThrow(InvalidArgumentError);

        expect(dbExtendSharedLearningScenarioExpiration).not.toHaveBeenCalled();
      },
    );

    it('throws InvalidArgumentError when the total usage time would exceed 130 days', async () => {
      vi.mocked(dbGetLatestManageableLearningScenarioShare).mockResolvedValue({
        ...currentShare,
        expiredAt: new Date(Date.now() + 187000 * 60_000),
      } as never);
      vi.mocked(dbGetLearningScenarioById).mockResolvedValue({
        ...mockLearningScenario,
        maxUsageTimeLimit: 187000,
      } as never);

      await expect(
        extendLearningScenarioShareExpiration({
          learningScenarioId,
          additionalTimeInMinutes: 300,
          user,
        }),
      ).rejects.toThrow('total usage time limit must not exceed 130 days');

      expect(dbExtendSharedLearningScenarioExpiration).not.toHaveBeenCalled();
    });

    it('throws InvalidArgumentError when there is no active share to extend', async () => {
      vi.mocked(dbExtendSharedLearningScenarioExpiration).mockResolvedValue(null as never);

      await expect(
        extendLearningScenarioShareExpiration({
          learningScenarioId,
          additionalTimeInMinutes: 30,
          user,
        }),
      ).rejects.toThrow(InvalidArgumentError);
    });
  });

  describe('updateLearningScenarioShareTokenPointsLimit', () => {
    const userId = generateUUID();
    const learningScenarioId = generateUUID();
    const user = { ...mockUser('teacher'), id: userId };
    const mockLearningScenario: Partial<LearningScenarioSelectModel> = {
      id: learningScenarioId,
      userId,
      accessLevel: 'private',
      hasLinkAccess: false,
      name: 'Test Scenario',
    };
    const currentShare = {
      id: generateUUID(),
      learningScenarioId,
      userId,
      tokenPointsLimit: 50,
      maxUsageTimeLimit: 187000,
    };
    const updatedShare = {
      ...currentShare,
      tokenPointsLimit: 75,
    };

    beforeEach(() => {
      vi.mocked(dbGetLearningScenarioById).mockResolvedValue(mockLearningScenario as never);
      vi.mocked(dbGetLatestManageableLearningScenarioShare).mockResolvedValue(
        currentShare as never,
      );
      vi.mocked(dbUpdateLearningScenarioShareTokenPointsLimit).mockResolvedValue(
        updatedShare as never,
      );
    });

    it('returns the updated share when the token points limit increases', async () => {
      const result = await updateLearningScenarioShareTokenPointsLimit({
        learningScenarioId,
        tokenPointsPercentageLimit: 75,
        user,
      });

      expect(dbUpdateLearningScenarioShareTokenPointsLimit).toHaveBeenCalledWith({
        learningScenarioId,
        user,
        tokenPointsLimit: 75,
      });
      expect(result).toBe(updatedShare);
    });

    it.each([0, 101])(
      'throws InvalidArgumentError for an out-of-range token limit (%s)',
      async (tokenPointsPercentageLimit) => {
        await expect(
          updateLearningScenarioShareTokenPointsLimit({
            learningScenarioId,
            tokenPointsPercentageLimit,
            user,
          }),
        ).rejects.toThrow(InvalidArgumentError);

        expect(dbUpdateLearningScenarioShareTokenPointsLimit).not.toHaveBeenCalled();
      },
    );

    it('throws InvalidArgumentError when there is no current share', async () => {
      vi.mocked(dbGetLatestManageableLearningScenarioShare).mockResolvedValue(null as never);

      await expect(
        updateLearningScenarioShareTokenPointsLimit({
          learningScenarioId,
          tokenPointsPercentageLimit: 75,
          user,
        }),
      ).rejects.toThrow(InvalidArgumentError);

      expect(dbUpdateLearningScenarioShareTokenPointsLimit).not.toHaveBeenCalled();
    });

    it.each([50, 49])(
      'throws InvalidArgumentError when the new token limit is not higher than the current limit (%s)',
      async (tokenPointsPercentageLimit) => {
        await expect(
          updateLearningScenarioShareTokenPointsLimit({
            learningScenarioId,
            tokenPointsPercentageLimit,
            user,
          }),
        ).rejects.toThrow(InvalidArgumentError);

        expect(dbUpdateLearningScenarioShareTokenPointsLimit).not.toHaveBeenCalled();
      },
    );

    it('throws InvalidArgumentError when the share update returns no result', async () => {
      vi.mocked(dbUpdateLearningScenarioShareTokenPointsLimit).mockResolvedValue(null as never);

      await expect(
        updateLearningScenarioShareTokenPointsLimit({
          learningScenarioId,
          tokenPointsPercentageLimit: 75,
          user,
        }),
      ).rejects.toThrow(InvalidArgumentError);
    });
  });

  describe('shareLearningScenario - success', () => {
    const userId = generateUUID();
    const learningScenarioId = generateUUID();
    const user = { ...mockUser(), id: userId };
    const mockLearningScenario: Partial<LearningScenarioSelectModel> = {
      id: learningScenarioId,
      userId,
      accessLevel: 'private',
      hasLinkAccess: false,
      name: 'Test Scenario',
    };
    const newShare = {
      id: generateUUID(),
      learningScenarioId,
      userId,
      tokenPointsLimit: 50,
      maxUsageTimeLimit: 60,
      inviteCode: 'ABCD1234',
      startedAt: new Date(),
      manuallyStoppedAt: null,
    };

    beforeEach(() => {
      vi.mocked(dbGetLearningScenarioById).mockResolvedValue(mockLearningScenario as never);
      vi.mocked(dbGetLearningScenarioByIdOptionalShareData).mockResolvedValue(
        mockLearningScenario as never,
      );
      vi.mocked(dbCreateLearningScenarioShare).mockResolvedValue(newShare as never);
      vi.mocked(dbGetLatestManageableLearningScenarioShare).mockResolvedValue(null as never);
    });

    it('throws an error when there is already an active share', async () => {
      vi.mocked(dbGetLatestManageableLearningScenarioShare).mockResolvedValue(newShare as never);

      await expect(
        shareLearningScenario({
          learningScenarioId,
          data: { tokenPointsPercentageLimit: 50, usageTimeLimit: 60 },
          user,
        }),
      ).rejects.toThrow(InvalidArgumentError);
    });
  });

  describe('shareLearningScenario / unshareLearningScenario - success', () => {
    const userId = generateUUID();
    const learningScenarioId = generateUUID();
    const user = { ...mockUser('teacher'), id: userId };
    const mockLearningScenario: Partial<LearningScenarioSelectModel> = {
      id: learningScenarioId,
      userId,
      accessLevel: 'private',
      hasLinkAccess: false,
      name: 'Test Scenario',
    };

    beforeEach(() => {
      vi.mocked(dbGetLearningScenarioById).mockResolvedValue(mockLearningScenario as never);
    });

    it('creates a new share via dbCreateLearningScenarioShare when no manageable share exists', async () => {
      const newShare = { id: generateUUID(), learningScenarioId, userId };
      vi.mocked(dbGetLatestManageableLearningScenarioShare).mockResolvedValue(null as never);
      vi.mocked(dbCreateLearningScenarioShare).mockResolvedValue(newShare as never);

      const result = await shareLearningScenario({
        learningScenarioId,
        data: { tokenPointsPercentageLimit: 50, usageTimeLimit: 60 },
        user,
      });

      expect(dbCreateLearningScenarioShare).toHaveBeenCalledWith(
        expect.objectContaining({
          user,
          learningScenarioId,
          tokenPointsLimit: 50,
          maxUsageTimeLimit: 60,
        }),
      );
      expect(result).toBe(newShare);
    });

    it('stops the latest manageable share via dbStopLearningScenarioShare', async () => {
      const share = { id: generateUUID(), learningScenarioId, userId };
      const stoppedShare = { ...share, manuallyStoppedAt: new Date() };
      vi.mocked(dbGetLatestManageableLearningScenarioShare).mockResolvedValue(share as never);
      vi.mocked(dbStopLearningScenarioShare).mockResolvedValue(stoppedShare as never);

      const result = await unshareLearningScenario({ learningScenarioId, user });

      expect(dbStopLearningScenarioShare).toHaveBeenCalledWith({ shareId: share.id });
      expect(result).toBe(stoppedShare);
    });
  });

  describe('learning scenario discovery filters', () => {
    const user = mockUser('teacher');
    const scenarios = [
      {
        id: generateUUID(),
        name: 'Scenario 1',
        userId: user.id,
        accessLevel: 'private',
        hasLinkAccess: false,
        suspended: false,
        ownerSchoolIds: user.schoolIds,
      } as LearningScenarioSelectModel,
    ];

    it('filters out unnamed scenarios and enriches with picture URLs', async () => {
      const namedScenario = {
        id: generateUUID(),
        name: 'Visible scenario',
        pictureId: 'shared-chats/a/picture.png',
      } as LearningScenarioSelectModel;
      const unnamedScenario = {
        id: generateUUID(),
        name: '',
        pictureId: 'shared-chats/b/picture.png',
      } as LearningScenarioSelectModel;

      vi.mocked(dbGetLearningScenariosByUser).mockResolvedValue([
        namedScenario,
        unnamedScenario,
      ] as never);
      vi.mocked(getAvatarPictureUrl).mockResolvedValue('https://signed-url');

      const result = await getLearningScenariosForUser({ user });

      expect(dbGetLearningScenariosByUser).toHaveBeenCalledWith({ user });
      expect(result).toEqual([
        {
          ...namedScenario,
          maybeSignedPictureUrl: 'https://signed-url',
        },
      ]);
    });

    it.each([
      {
        accessLevel: 'community' as const,
        expectedMock: dbGetCommunityLearningScenarios,
      },
      {
        accessLevel: 'global' as const,
        expectedMock: dbGetGlobalLearningScenarios,
      },
      {
        accessLevel: 'school' as const,
        expectedMock: dbGetLearningScenariosByAssociatedSchools,
      },
      {
        accessLevel: 'private' as const,
        expectedMock: dbGetLearningScenariosByUser,
      },
    ])(
      'routes accessLevel=$accessLevel to the correct db function',
      async ({ accessLevel, expectedMock }) => {
        vi.mocked(expectedMock).mockResolvedValue(scenarios as never);

        const result = await getLearningScenariosByAccessLevel({ accessLevel, user });

        expect(result).toEqual(scenarios);
        expect(expectedMock).toHaveBeenCalledWith({ user });
      },
    );

    it('returns an empty list for unsupported access levels', async () => {
      const result = await getLearningScenariosByAccessLevel({
        accessLevel: 'invalid' as never,
        user,
      });

      expect(result).toEqual([]);
    });

    it('routes filter=all to dbGetAllAccessibleLearningScenarios', async () => {
      vi.mocked(dbGetAllAccessibleLearningScenarios).mockResolvedValue(scenarios as never);

      const result = await getLearningScenariosByOverviewFilter({ filter: 'all', user });

      expect(result).toEqual(scenarios);
      expect(dbGetAllAccessibleLearningScenarios).toHaveBeenCalledWith({ user });
    });

    it('filters suspended learning scenarios for non-owners', async () => {
      const visibleScenario = {
        id: generateUUID(),
        name: 'Visible scenario',
        userId: generateUUID(),
        accessLevel: 'global',
        hasLinkAccess: false,
        suspended: false,
        ownerSchoolIds: [],
      } as unknown as LearningScenarioSelectModel;
      const suspendedScenario = {
        ...visibleScenario,
        id: generateUUID(),
        suspended: true,
      } as LearningScenarioSelectModel;

      vi.mocked(dbGetGlobalLearningScenarios).mockResolvedValue([
        visibleScenario,
        suspendedScenario,
      ] as never);

      const result = await getLearningScenariosByOverviewFilter({ filter: 'official', user });

      expect(result).toEqual([visibleScenario]);
    });

    it('keeps suspended learning scenarios visible for owners', async () => {
      const ownSuspendedScenario = {
        id: generateUUID(),
        name: 'Own suspended scenario',
        userId: user.id,
        accessLevel: 'private',
        hasLinkAccess: false,
        suspended: true,
        ownerSchoolIds: user.schoolIds,
      } as LearningScenarioSelectModel;

      vi.mocked(dbGetAllLearningScenariosByUser).mockResolvedValue([ownSuspendedScenario] as never);

      const result = await getLearningScenariosByOverviewFilter({ filter: 'mine', user });

      expect(result).toEqual([ownSuspendedScenario]);
    });

    it.each([
      { filter: 'mine' as const, expectedMock: dbGetAllLearningScenariosByUser },
      { filter: 'official' as const, expectedMock: dbGetGlobalLearningScenarios },
    ])('routes filter=$filter to the correct db function', async ({ filter, expectedMock }) => {
      vi.mocked(expectedMock).mockResolvedValue(scenarios as never);

      const result = await getLearningScenariosByOverviewFilter({ filter, user });

      expect(result).toEqual(scenarios);
      expect(expectedMock).toHaveBeenCalledWith({ user });
    });

    it('routes filter=community to dbGetCommunityLearningScenarios', async () => {
      vi.mocked(dbGetCommunityLearningScenarios).mockResolvedValue(scenarios as never);

      const result = await getLearningScenariosByOverviewFilter({ filter: 'community', user });

      expect(result).toEqual(scenarios);
      expect(dbGetCommunityLearningScenarios).toHaveBeenCalledWith({ user });
    });

    it('routes filter=school to the school and community db functions', async () => {
      const schoolScenario = {
        id: generateUUID(),
        name: 'School scenario',
        userId: generateUUID(),
        accessLevel: 'school',
        hasLinkAccess: false,
        suspended: false,
        ownerSchoolIds: user.schoolIds,
      } as unknown as LearningScenarioSelectModel;
      const communityScenario = {
        id: generateUUID(),
        name: 'Community scenario',
        userId: generateUUID(),
        accessLevel: 'community',
        hasLinkAccess: false,
        suspended: false,
        ownerSchoolIds: user.schoolIds,
      } as unknown as LearningScenarioSelectModel;
      const otherSchoolCommunityScenario = {
        id: generateUUID(),
        name: 'Other school community scenario',
        userId: generateUUID(),
        accessLevel: 'community',
        hasLinkAccess: false,
        suspended: false,
        ownerSchoolIds: [],
      } as unknown as LearningScenarioSelectModel;

      vi.mocked(dbGetLearningScenariosByAssociatedSchools).mockResolvedValue([
        schoolScenario,
      ] as never);
      vi.mocked(dbGetCommunityLearningScenarios).mockResolvedValue([
        communityScenario,
        otherSchoolCommunityScenario,
      ] as never);

      const result = await getLearningScenariosByOverviewFilter({ filter: 'school', user });

      expect(result).toEqual([schoolScenario, communityScenario]);
      expect(dbGetLearningScenariosByAssociatedSchools).toHaveBeenCalledWith({ user });
      expect(dbGetCommunityLearningScenarios).toHaveBeenCalledWith({ user });
    });

    it('returns an empty list for unsupported overview filters', async () => {
      const result = await getLearningScenariosByOverviewFilter({
        filter: 'invalid' as never,
        user,
      });

      expect(result).toEqual([]);
    });
  });

  describe('getSharedLearningScenario', () => {
    const NOW = new Date('2026-07-20T12:00:00.000Z');

    function mockLearningScenarioWithShareData(
      overrides: Record<string, unknown> = {},
    ): LearningScenarioWithShareDataModel {
      return {
        id: generateUUID(),
        author: '',
        name: 'Test Learning Scenario',
        description: '',
        modelId: generateUUID(),
        userId: generateUUID(),
        filterGroup: {
          school_types: [],
          grade_ranges: [],
          subjects: [],
          categories: [],
          federal_states: [],
          languages: [],
        },
        studentExercise: '',
        additionalInstructions: null,
        restrictions: null,
        attachedLinks: [],
        pictureId: null,
        createdAt: NOW,
        updatedAt: NOW,
        suspended: false,
        isDeleted: false,
        accessLevel: 'private' as const,
        originalLearningScenarioId: null,
        hasLinkAccess: false,
        isWebSearchEnabled: false,
        ownerSchoolIds: [],
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

    it('returns the learning scenario when the share is active', async () => {
      const learningScenarioId = generateUUID();
      const userId = generateUUID();
      const learningScenario = mockLearningScenarioWithShareData({
        id: learningScenarioId,
        userId,
        expiredAt: new Date(NOW.getTime() + 60 * 60 * 1000),
      });
      vi.mocked(dbGetLearningScenarioByIdWithShareData).mockResolvedValue(
        learningScenario as never,
      );

      const result = await getSharedLearningScenario({
        learningScenarioId,
        user: { id: userId },
      });

      expect(result).toBe(learningScenario);
    });

    it('returns the learning scenario when the share has expired but is within the grace window', async () => {
      const learningScenarioId = generateUUID();
      const userId = generateUUID();
      const learningScenario = mockLearningScenarioWithShareData({
        id: learningScenarioId,
        userId,
        expiredAt: new Date(NOW.getTime() - 60 * 60 * 1000), // expired 1 hour ago, within grace window
      });
      vi.mocked(dbGetLearningScenarioByIdWithShareData).mockResolvedValue(
        learningScenario as never,
      );

      const result = await getSharedLearningScenario({
        learningScenarioId,
        user: { id: userId },
      });

      expect(result).toBe(learningScenario);
    });

    it('throws NotFoundError when the share has expired beyond the grace window', async () => {
      const learningScenarioId = generateUUID();
      const userId = generateUUID();
      const learningScenario = mockLearningScenarioWithShareData({
        id: learningScenarioId,
        userId,
        expiredAt: new Date(NOW.getTime() - SHARE_EXTENSION_WINDOW_MS - 1000), // expired 2 hours and 1 second ago
      });
      vi.mocked(dbGetLearningScenarioByIdWithShareData).mockResolvedValue(
        learningScenario as never,
      );

      await expect(
        getSharedLearningScenario({ learningScenarioId, user: { id: userId } }),
      ).rejects.toThrow(NotFoundError);
    });

    it('throws NotFoundError when the share was manually stopped', async () => {
      const learningScenarioId = generateUUID();
      const userId = generateUUID();
      const learningScenario = mockLearningScenarioWithShareData({
        id: learningScenarioId,
        userId,
        expiredAt: new Date(NOW.getTime() + 60 * 60 * 1000), // still active time-wise
        manuallyStoppedAt: new Date(NOW.getTime() - 30 * 60 * 1000), // but manually stopped 30 min ago
      });
      vi.mocked(dbGetLearningScenarioByIdWithShareData).mockResolvedValue(
        learningScenario as never,
      );

      await expect(
        getSharedLearningScenario({ learningScenarioId, user: { id: userId } }),
      ).rejects.toThrow(NotFoundError);
    });
  });
});
