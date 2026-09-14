import { beforeEach, describe, expect, it, MockedFunction, vi } from 'vitest';
import {
  createNewAssistant,
  deleteAssistant,
  deleteFileMappingAndEntity,
  getAssistantByAccessLevel,
  getConversationWithMessagesAndAssistant,
  getAssistantForNewChat,
  getAssistantForExistingConversation,
  getAssistantsByOverviewFilter,
  getFileMappings,
  linkFileToAssistant,
  updateAssistant,
  updateAssistantAccessLevel,
  getAssistantByUser,
  uploadAvatarPictureForAssistant,
  downloadFileFromAssistant,
} from './assistant-service';
import { ForbiddenError, NotFoundError, InvalidArgumentError } from '@shared/error';
import { generateUUID } from '@shared/utils/uuid';
import {
  dbGetAssistantsByUserId,
  dbGetAssistantById,
  dbGetAssistantByIdForConversation,
  dbGetCommunityGpts,
  dbGetGlobalGpts,
  dbGetGptsByAssociatedSchools,
  dbGetGptsByUser,
} from '@shared/db/functions/assistants';
import { dbGetRelatedAssistantFiles } from '@shared/db/functions/files';
import { AssistantSelectModel } from '@shared/db/schema';
import { UserModel } from '@shared/auth/user-model';
import {
  getConversation,
  getConversationMessages,
} from '@shared/conversation/conversation-service';
import { uploadFileToS3 } from '../s3';
import { getAvatarPictureUrl } from '../files/fileService';
import { copyAssistant, copyRelatedTemplateFiles } from '../templates/template-service';

vi.mock('../db/functions/assistants', () => ({
  dbGetAssistantsByUserId: vi.fn(),
  dbGetAssistantById: vi.fn(),
  dbGetAssistantByIdForConversation: vi.fn(),
  dbGetCommunityGpts: vi.fn(),
  dbGetGlobalGpts: vi.fn(),
  dbGetGptsByAssociatedSchools: vi.fn(),
  dbGetGptsByUser: vi.fn(),
}));
vi.mock('../db/functions/files', () => ({
  dbGetRelatedAssistantFiles: vi.fn(),
}));
vi.mock('../conversation/conversation-service', () => ({
  getConversation: vi.fn(),
  getConversationMessages: vi.fn(),
}));
vi.mock('../s3', () => ({
  uploadFileToS3: vi.fn(),
  deleteFileFromS3: vi.fn(),
  copyFileInS3: vi.fn(),
}));
vi.mock('../files/fileService', () => ({
  getAvatarPictureUrl: vi.fn(),
  deleteAvatarPicture: vi.fn(),
  deleteMessageAttachments: vi.fn(),
}));
vi.mock('../templates/template-service', () => ({
  copyAssistant: vi.fn(),
  copyRelatedTemplateFiles: vi.fn(),
}));
const { mockDbReturning, mockDbSet, mockDbUpdate } = vi.hoisted(() => {
  const mockDbReturning = vi.fn();
  const mockDbWhere = vi.fn(() => ({ returning: mockDbReturning }));
  const mockDbSet = vi.fn(() => ({ where: mockDbWhere }));
  const mockDbUpdate = vi.fn(() => ({ set: mockDbSet }));
  return { mockDbReturning, mockDbSet, mockDbUpdate };
});
vi.mock('@shared/db', () => ({ db: { update: mockDbUpdate } }));

const mockUser = (userRole: 'student' | 'teacher' = 'teacher'): UserModel => ({
  id: generateUUID(),
  lastUsedModel: null,
  versionAcceptedConditions: null,
  createdAt: new Date(),
  userRole,
  federalStateId: generateUUID(),
  schoolIds: [generateUUID()],
});

describe('assistant-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('NotFoundError scenarios', () => {
    const assistantId = generateUUID();
    const userId = generateUUID();
    const fileId = generateUUID();

    it.each([
      {
        functionName: 'getAssistantByUser',
        testFunction: () => getAssistantByUser({ assistantId, user: mockUser() }),
      },
      {
        functionName: 'getAssistantForNewChat',
        testFunction: () => getAssistantForNewChat({ assistantId, user: mockUser() }),
      },
      {
        functionName: 'linkFileToAssistant',
        testFunction: () => linkFileToAssistant({ assistantId, fileId, user: { id: userId } }),
      },
      {
        functionName: 'deleteFileMappingAndEntity',
        testFunction: () =>
          deleteFileMappingAndEntity({ assistantId, fileId, user: { id: userId } }),
      },
      {
        functionName: 'getFileMappings',
        testFunction: () => getFileMappings({ assistantId, user: mockUser() }),
      },
      {
        functionName: 'updateAssistantAccessLevel',
        testFunction: () =>
          updateAssistantAccessLevel({ assistantId, accessLevel: 'school', user: { id: userId } }),
      },
      {
        functionName: 'updateAssistant',
        testFunction: () =>
          updateAssistant({ assistantId, assistantProps: {}, user: { id: userId } }),
      },
      {
        functionName: 'deleteAssistant',
        testFunction: () => deleteAssistant({ assistantId, user: { id: userId, schoolIds: [] } }),
      },
      {
        functionName: 'uploadAvatarPictureForAssistant',
        testFunction: () =>
          uploadAvatarPictureForAssistant({
            assistantId,
            user: { id: 'different-user-id' },
            croppedImageBlob: new Blob(),
          }),
      },
      {
        functionName: 'downloadFileFromAssistant',
        testFunction: () =>
          downloadFileFromAssistant({
            assistantId,
            fileId,
            user: mockUser(),
          }),
      },
    ])(
      'should throw NotFoundError from dbGetAssistantById when assistant does not exist - $functionName',
      async ({ testFunction }) => {
        (dbGetAssistantById as MockedFunction<typeof dbGetAssistantById>).mockRejectedValue(
          new NotFoundError(),
        );

        await expect(testFunction()).rejects.toThrow(NotFoundError);
      },
    );

    it('should throw NotFoundError when conversation not found - getConversationWithMessagesAndAssistant', async () => {
      const userId = generateUUID();
      const assistantId = generateUUID();
      const conversationId = generateUUID();

      const mockAssistant: Partial<AssistantSelectModel> = { userId };

      (
        dbGetAssistantByIdForConversation as MockedFunction<
          typeof dbGetAssistantByIdForConversation
        >
      ).mockResolvedValue(mockAssistant as never);
      (getConversation as MockedFunction<typeof getConversation>).mockRejectedValue(
        new NotFoundError('Conversation not found'),
      );
      (getConversationMessages as MockedFunction<typeof getConversationMessages>).mockResolvedValue(
        null as never,
      );

      await expect(
        getConversationWithMessagesAndAssistant({
          conversationId,
          assistantId,
          userId,
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw NotFoundError when assistant not found - getConversationWithMessagesAndAssistant', async () => {
      const userId = generateUUID();
      const assistantId = generateUUID();
      const conversationId = generateUUID();

      (
        dbGetAssistantByIdForConversation as MockedFunction<
          typeof dbGetAssistantByIdForConversation
        >
      ).mockResolvedValue(undefined);
      (getConversation as MockedFunction<typeof getConversation>).mockResolvedValue(null as never);
      (getConversationMessages as MockedFunction<typeof getConversationMessages>).mockResolvedValue(
        null as never,
      );

      await expect(
        getConversationWithMessagesAndAssistant({
          conversationId,
          assistantId,
          userId,
        }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('ForbiddenError scenarios - user not owner', () => {
    const userId = generateUUID();
    const assistantId = generateUUID();
    const fileId = generateUUID();

    const mockAssistant: Partial<AssistantSelectModel> = {
      userId,
      accessLevel: 'private',
    };

    beforeEach(() => {
      (dbGetAssistantById as MockedFunction<typeof dbGetAssistantById>).mockResolvedValue(
        mockAssistant as never,
      );
    });

    it.each([
      {
        functionName: 'getAssistantByUser',
        testFunction: () =>
          getAssistantByUser({
            assistantId,
            user: mockUser(),
          }),
      },
      {
        functionName: 'linkFileToAssistant',
        testFunction: () =>
          linkFileToAssistant({
            assistantId,
            fileId,
            user: { id: 'different-user-id' },
          }),
      },
      {
        functionName: 'deleteFileMappingAndEntity',
        testFunction: () =>
          deleteFileMappingAndEntity({
            assistantId,
            fileId,
            user: { id: 'different-user-id' },
          }),
      },
      {
        functionName: 'updateAssistantAccessLevel',
        testFunction: () =>
          updateAssistantAccessLevel({
            assistantId,
            accessLevel: 'school',
            user: { id: 'different-user-id' },
          }),
      },
      {
        functionName: 'updateAssistant',
        testFunction: () =>
          updateAssistant({
            assistantId,
            user: { id: 'different-user-id' },
            assistantProps: {},
          }),
      },
      {
        functionName: 'deleteAssistant',
        testFunction: () =>
          deleteAssistant({
            assistantId,
            user: { id: 'different-user-id', schoolIds: [] },
          }),
      },
      {
        functionName: 'uploadAvatarPictureForAssistant',
        testFunction: () =>
          uploadAvatarPictureForAssistant({
            assistantId,
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
    const userId = generateUUID();
    const assistantId = generateUUID();

    it.each([
      {
        functionName: 'getAssistantByUser',
        testFunction: () =>
          getAssistantByUser({
            assistantId,
            user: mockUser(),
          }),
      },
      {
        functionName: 'getAssistantForNewChat',
        testFunction: () =>
          getAssistantForNewChat({
            assistantId,
            user: mockUser(),
          }),
      },
    ])(
      'should throw ForbiddenError when user is not owner of private assistant - $functionName',
      async ({ testFunction }) => {
        const mockAssistant: Partial<AssistantSelectModel> = {
          userId,
          accessLevel: 'private',
        };

        (dbGetAssistantById as MockedFunction<typeof dbGetAssistantById>).mockResolvedValue(
          mockAssistant as never,
        );

        await expect(testFunction()).rejects.toThrow(ForbiddenError);
      },
    );

    it.each([
      {
        functionName: 'getAssistantByUser',
        testFunction: () =>
          getAssistantByUser({
            assistantId,
            user: mockUser(),
          }),
      },
      {
        functionName: 'getAssistantForNewChat',
        testFunction: () =>
          getAssistantForNewChat({
            assistantId,
            user: mockUser(),
          }),
      },
    ])(
      'should throw ForbiddenError when user is not in same school - $functionName',
      async ({ testFunction }) => {
        const mockAssistant: Partial<AssistantSelectModel> = {
          userId,
          accessLevel: 'school',
        };

        (dbGetAssistantById as MockedFunction<typeof dbGetAssistantById>).mockResolvedValue(
          mockAssistant as never,
        );

        await expect(testFunction()).rejects.toThrow(ForbiddenError);
      },
    );

    it('should throw ForbiddenError when user is not owner of conversation - getConversationWithMessagesAndAssistant', async () => {
      const userId = generateUUID();
      const assistantId = generateUUID();
      const conversationId = generateUUID();

      (
        dbGetAssistantByIdForConversation as MockedFunction<
          typeof dbGetAssistantByIdForConversation
        >
      ).mockResolvedValue(null as never);
      (getConversation as MockedFunction<typeof getConversation>).mockRejectedValue(
        new ForbiddenError('Not authorized to access conversation'),
      );
      (getConversationMessages as MockedFunction<typeof getConversationMessages>).mockResolvedValue(
        null as never,
      );

      await expect(
        getConversationWithMessagesAndAssistant({
          conversationId,
          assistantId,
          userId,
        }),
      ).rejects.toThrow(ForbiddenError);
    });

    it('should throw ForbiddenError when user is not owner of private assistant - getFileMappings', async () => {
      const userId = generateUUID();
      const assistantId = generateUUID();
      const mockAssistant: Partial<AssistantSelectModel> = { accessLevel: 'private', userId };

      (dbGetAssistantById as MockedFunction<typeof dbGetAssistantById>).mockResolvedValue(
        mockAssistant as never,
      );

      await expect(
        getFileMappings({
          assistantId,
          user: mockUser(),
        }),
      ).rejects.toThrow(ForbiddenError);
    });

    it('should throw ForbiddenError when user has not same schoolId as assistant - getFileMappings', async () => {
      const userId = generateUUID();
      const assistantId = generateUUID();
      const mockAssistant: Partial<AssistantSelectModel> = {
        accessLevel: 'school',
        userId,
      };

      (dbGetAssistantById as MockedFunction<typeof dbGetAssistantById>).mockResolvedValue(
        mockAssistant as never,
      );

      await expect(
        getFileMappings({
          assistantId,
          user: mockUser(),
        }),
      ).rejects.toThrow(ForbiddenError);
    });

    it('should throw ForbiddenError when setting access level to global not possible - updateAssistantAccessLevel', async () => {
      const userId = generateUUID();
      const assistantId = generateUUID();
      const mockAssistant: Partial<AssistantSelectModel> = { userId };

      (dbGetAssistantById as MockedFunction<typeof dbGetAssistantById>).mockResolvedValue(
        mockAssistant as never,
      );

      await expect(
        updateAssistantAccessLevel({
          assistantId,
          accessLevel: 'global',
          user: { id: userId },
        }),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe('ForbiddenError scenarios - role restrictions', () => {
    it('should throw ForbiddenError when user is not a teacher - createNewAssistant', async () => {
      await expect(
        createNewAssistant({
          user: mockUser('student'),
        }),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe('sharing updates preserve updatedAt', () => {
    it('preserves updatedAt when only accessLevel changes', async () => {
      const userId = generateUUID();
      const assistantId = generateUUID();
      const updatedAt = new Date('2026-06-01T10:00:00.000Z');
      const assistant = {
        id: assistantId,
        userId,
        accessLevel: 'private',
        hasLinkAccess: false,
        updatedAt,
      } as Partial<AssistantSelectModel>;

      (dbGetAssistantById as MockedFunction<typeof dbGetAssistantById>).mockResolvedValue(
        assistant as never,
      );
      mockDbReturning.mockResolvedValue([
        { ...assistant, accessLevel: 'school' } as AssistantSelectModel,
      ]);

      await updateAssistantAccessLevel({
        assistantId,
        accessLevel: 'school',
        user: { id: userId },
      });

      expect(mockDbSet).toHaveBeenCalledWith({ accessLevel: 'school', updatedAt });
    });

    it('preserves updatedAt when only hasLinkAccess changes', async () => {
      const userId = generateUUID();
      const assistantId = generateUUID();
      const updatedAt = new Date('2026-06-01T10:00:00.000Z');
      const assistant = {
        id: assistantId,
        userId,
        hasLinkAccess: false,
        updatedAt,
      } as Partial<AssistantSelectModel>;

      (dbGetAssistantById as MockedFunction<typeof dbGetAssistantById>).mockResolvedValue(
        assistant as never,
      );
      mockDbReturning.mockResolvedValue([
        { ...assistant, hasLinkAccess: true } as AssistantSelectModel,
      ]);

      await updateAssistant({
        assistantId,
        user: { id: userId },
        assistantProps: { hasLinkAccess: true },
      });

      expect(mockDbSet).toHaveBeenCalledWith({ hasLinkAccess: true, updatedAt });
    });
  });

  describe('createNewAssistant', () => {
    const templateId = generateUUID();
    const duplicatedAssistantName = 'Copy of Biology Assistant';
    const templateAssistant = (overrides: Partial<AssistantSelectModel> = {}) => ({
      id: templateId,
      name: 'Template Assistant',
      userId: generateUUID(),
      accessLevel: 'global',
      hasLinkAccess: false,
      suspended: false,
      ownerSchoolIds: [],
      ...overrides,
    });

    beforeEach(() => {
      (
        copyRelatedTemplateFiles as MockedFunction<typeof copyRelatedTemplateFiles>
      ).mockResolvedValue(undefined as never);
      (dbGetAssistantById as MockedFunction<typeof dbGetAssistantById>).mockResolvedValue(
        templateAssistant() as never,
      );
    });

    it('should pass duplicateAssistantName to copyAssistant when creating from template', async () => {
      const user = mockUser('teacher');
      const insertedAssistant = {
        id: generateUUID(),
        pictureId: null,
      } as AssistantSelectModel;

      (dbGetAssistantById as MockedFunction<typeof dbGetAssistantById>).mockResolvedValue(
        templateAssistant({ userId: user.id, accessLevel: 'private' }) as never,
      );

      (copyAssistant as MockedFunction<typeof copyAssistant>).mockResolvedValue(
        insertedAssistant as never,
      );

      const result = await createNewAssistant({
        templateId,
        user,
        duplicateAssistantName: duplicatedAssistantName,
      });

      expect(copyAssistant).toHaveBeenCalledWith(
        templateId,
        'private',
        expect.objectContaining({ id: expect.any(String) }),
        duplicatedAssistantName,
      );
      expect(copyRelatedTemplateFiles).toHaveBeenCalledWith(
        'assistant',
        templateId,
        insertedAssistant.id,
      );
      expect(result).toBe(insertedAssistant);
    });

    it('should pass undefined duplicateAssistantName to copyAssistant when not provided', async () => {
      const user = mockUser('teacher');
      const insertedAssistant = {
        id: generateUUID(),
        pictureId: null,
      } as AssistantSelectModel;

      (dbGetAssistantById as MockedFunction<typeof dbGetAssistantById>).mockResolvedValue(
        templateAssistant({ userId: user.id, accessLevel: 'private' }) as never,
      );

      (copyAssistant as MockedFunction<typeof copyAssistant>).mockResolvedValue(
        insertedAssistant as never,
      );

      await createNewAssistant({
        templateId,
        user,
      });

      expect(copyAssistant).toHaveBeenCalledWith(
        templateId,
        'private',
        expect.objectContaining({ id: expect.any(String) }),
        undefined,
      );
    });

    it('should return the assistant from copyAssistant as-is, without copying its picture again', async () => {
      const user = mockUser('teacher');
      const insertedAssistant = {
        id: generateUUID(),
        pictureId: 'custom-gpts/already-scoped-id/avatar_abc123',
      } as AssistantSelectModel;

      (dbGetAssistantById as MockedFunction<typeof dbGetAssistantById>).mockResolvedValue(
        templateAssistant({ userId: user.id, accessLevel: 'private' }) as never,
      );
      (copyAssistant as MockedFunction<typeof copyAssistant>).mockResolvedValue(
        insertedAssistant as never,
      );

      const result = await createNewAssistant({ templateId, user });

      // copyAssistant already duplicates the picture; createNewAssistant must not attempt to
      // copy it again (which would be a no-op S3 self-copy at best, an error at worst).
      expect(result).toBe(insertedAssistant);
    });

    it('should throw ForbiddenError when template is suspended', async () => {
      const user = mockUser('teacher');
      (dbGetAssistantById as MockedFunction<typeof dbGetAssistantById>).mockResolvedValue(
        templateAssistant({ userId: user.id, accessLevel: 'private', suspended: true }) as never,
      );

      await expect(
        createNewAssistant({
          templateId,
          user,
        }),
      ).rejects.toThrow(ForbiddenError);

      expect(copyAssistant).not.toHaveBeenCalled();
    });
  });

  describe('InvalidArgumentError scenarios - invalid parameter format', () => {
    it.each([
      {
        functionName: 'getAssistantByUser',
        testFunction: () =>
          getAssistantByUser({
            assistantId: 'invalid-uuid',
            user: mockUser(),
          }),
      },
      {
        functionName: 'getAssistantForNewChat',
        testFunction: () =>
          getAssistantForNewChat({
            assistantId: 'invalid-uuid',
            user: mockUser(),
          }),
      },
      {
        functionName: 'getConversationWithMessagesAndAssistant',
        testFunction: () =>
          getConversationWithMessagesAndAssistant({
            assistantId: 'invalid-uuid',
            conversationId: generateUUID(),
            userId: 'user-id',
          }),
      },
      {
        functionName: 'getConversationWithMessagesAndAssistant (invalid conversationId)',
        testFunction: () =>
          getConversationWithMessagesAndAssistant({
            assistantId: generateUUID(),
            conversationId: 'invalid-uuid',
            userId: 'user-id',
          }),
      },
      {
        functionName: 'linkFileToAssistant',
        testFunction: () =>
          linkFileToAssistant({
            assistantId: 'invalid-uuid',
            fileId: generateUUID(),
            user: { id: 'user-id' },
          }),
      },
      {
        functionName: 'deleteFileMappingAndEntity',
        testFunction: () =>
          deleteFileMappingAndEntity({
            assistantId: 'invalid-uuid',
            fileId: generateUUID(),
            user: { id: 'user-id' },
          }),
      },
      {
        functionName: 'getFileMappings',
        testFunction: () =>
          getFileMappings({
            assistantId: 'invalid-uuid',
            user: mockUser(),
          }),
      },
      {
        functionName: 'updateAssistantAccessLevel',
        testFunction: () =>
          updateAssistantAccessLevel({
            assistantId: 'invalid-uuid',
            accessLevel: 'school',
            user: { id: 'user-id' },
          }),
      },
      {
        functionName: 'deleteAssistant',
        testFunction: () =>
          deleteAssistant({
            assistantId: 'invalid-uuid',
            user: { id: 'user-id', schoolIds: [] },
          }),
      },
    ])(
      'should throw InvalidArgumentError when parameter is not a valid UUID - $functionName',
      async ({ testFunction }) => {
        await expect(testFunction()).rejects.toThrow(InvalidArgumentError);
      },
    );
  });

  describe('getAssistantForNewChat', () => {
    const assistantId = generateUUID();
    const ownerUser = mockUser();
    const differentUser = mockUser();

    describe.each([
      { accessLevel: 'private' as const, user: ownerUser },
      { accessLevel: 'global' as const, user: differentUser },
    ])('accessLevel=$accessLevel', ({ accessLevel, user }) => {
      it(`should return assistant with accessLevel=${accessLevel} - getAssistantForNewChat`, async () => {
        const mockAssistant: Partial<AssistantSelectModel> = {
          userId: ownerUser.id,
          accessLevel,
        };

        (dbGetAssistantById as MockedFunction<typeof dbGetAssistantById>).mockResolvedValue(
          mockAssistant as never,
        );

        const assistant = await getAssistantForNewChat({
          assistantId,
          user,
        });

        expect(assistant).toBe(mockAssistant);
      });
    });
  });

  describe('getAssistantForExistingConversation', () => {
    const assistantId = generateUUID();
    const conversationId = generateUUID();

    it('returns the assistant when it is linked to the given conversation', async () => {
      const user = mockUser();
      const mockAssistant: Partial<AssistantSelectModel> = {
        userId: user.id,
        accessLevel: 'private',
      };
      (
        dbGetAssistantByIdForConversation as MockedFunction<
          typeof dbGetAssistantByIdForConversation
        >
      ).mockResolvedValue(mockAssistant as never);

      const result = await getAssistantForExistingConversation({
        assistantId,
        conversationId,
        user,
      });

      expect(result).toBe(mockAssistant);
      expect(dbGetAssistantByIdForConversation).toHaveBeenCalledWith({
        assistantId,
        conversationId,
        userId: user.id,
      });
    });

    it('throws NotFoundError when the assistant is not linked to the conversation', async () => {
      (
        dbGetAssistantByIdForConversation as MockedFunction<
          typeof dbGetAssistantByIdForConversation
        >
      ).mockResolvedValue(undefined);

      await expect(
        getAssistantForExistingConversation({
          assistantId,
          conversationId,
          user: mockUser(),
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it('throws ForbiddenError when the user is not authorized to read the assistant', async () => {
      const mockAssistant: Partial<AssistantSelectModel> = {
        userId: generateUUID(),
        accessLevel: 'private',
      };
      (
        dbGetAssistantByIdForConversation as MockedFunction<
          typeof dbGetAssistantByIdForConversation
        >
      ).mockResolvedValue(mockAssistant as never);

      await expect(
        getAssistantForExistingConversation({
          assistantId,
          conversationId,
          user: mockUser(),
        }),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe('getAssistantByUser', () => {
    const assistantId = generateUUID();
    const ownerUser = mockUser();
    const differentUser = mockUser();

    describe.each([
      { accessLevel: 'private' as const, user: ownerUser },
      { accessLevel: 'global' as const, user: differentUser },
    ])('accessLevel=$accessLevel', ({ accessLevel, user }) => {
      it(`should return assistant with accessLevel=${accessLevel} - getAssistantByUser`, async () => {
        const mockAssistant: Partial<AssistantSelectModel> = {
          userId: ownerUser.id,
          accessLevel,
        };

        (dbGetAssistantById as MockedFunction<typeof dbGetAssistantById>).mockResolvedValue(
          mockAssistant as never,
        );

        const { assistant } = await getAssistantByUser({
          assistantId,
          user,
        });

        expect(assistant).toBe(mockAssistant);
      });
    });
  });

  describe('Link sharing bypass scenarios', () => {
    const assistantId = generateUUID();
    const ownerUserId = generateUUID();

    describe('should allow access when hasLinkAccess is true - bypassing normal restrictions', () => {
      it.each([
        {
          accessLevel: 'private' as const,
          description: 'private assistant with link sharing enabled',
        },
        {
          accessLevel: 'school' as const,
          description: 'school assistant with link sharing enabled (different school)',
        },
      ])('getAssistantByUser - $description', async ({ accessLevel }) => {
        const mockAssistant: Partial<AssistantSelectModel> = {
          userId: ownerUserId,
          accessLevel,
          hasLinkAccess: true,
        };

        (dbGetAssistantById as MockedFunction<typeof dbGetAssistantById>).mockResolvedValue(
          mockAssistant as never,
        );

        // User from different school trying to access - should succeed because hasLinkAccess is true
        const result = await getAssistantByUser({
          assistantId,
          user: mockUser(),
        });

        expect(result.assistant).toBe(mockAssistant);
      });

      it.each([
        {
          accessLevel: 'private' as const,
          description: 'private assistant with link sharing enabled',
        },
        {
          accessLevel: 'school' as const,
          description: 'school assistant with link sharing enabled (different school)',
        },
      ])('getAssistantForNewChat - $description', async ({ accessLevel }) => {
        const mockAssistant: Partial<AssistantSelectModel> = {
          userId: ownerUserId,
          accessLevel,
          hasLinkAccess: true,
        };

        (dbGetAssistantById as MockedFunction<typeof dbGetAssistantById>).mockResolvedValue(
          mockAssistant as never,
        );

        // User from different school trying to access - should succeed because hasLinkAccess is true
        const result = await getAssistantForNewChat({
          assistantId,
          user: mockUser(),
        });

        expect(result).toBe(mockAssistant);
      });

      it.each([
        {
          accessLevel: 'private' as const,
          description: 'private assistant with link sharing enabled',
        },
        {
          accessLevel: 'school' as const,
          description: 'school assistant with link sharing enabled (different school)',
        },
      ])('getFileMappings - $description', async ({ accessLevel }) => {
        const mockAssistant: Partial<AssistantSelectModel> = {
          userId: ownerUserId,
          accessLevel,
          hasLinkAccess: true,
        };

        (dbGetAssistantById as MockedFunction<typeof dbGetAssistantById>).mockResolvedValue(
          mockAssistant as never,
        );
        (
          dbGetRelatedAssistantFiles as MockedFunction<typeof dbGetRelatedAssistantFiles>
        ).mockResolvedValue([]);

        // Should not throw - access is allowed via link sharing
        await expect(
          getFileMappings({
            assistantId,
            user: mockUser(),
          }),
        ).resolves.not.toThrow();
      });
    });

    describe('should still enforce restrictions when hasLinkAccess is false', () => {
      it('getAssistantByUser - private assistant without link sharing', async () => {
        const mockAssistant: Partial<AssistantSelectModel> = {
          userId: ownerUserId,
          accessLevel: 'private',
          hasLinkAccess: false,
        };

        (dbGetAssistantById as MockedFunction<typeof dbGetAssistantById>).mockResolvedValue(
          mockAssistant as never,
        );

        await expect(
          getAssistantByUser({
            assistantId,
            user: mockUser(),
          }),
        ).rejects.toThrow(ForbiddenError);
      });

      it('getAssistantForNewChat - private assistant without link sharing', async () => {
        const mockAssistant: Partial<AssistantSelectModel> = {
          userId: ownerUserId,
          accessLevel: 'private',
          hasLinkAccess: false,
        };

        (dbGetAssistantById as MockedFunction<typeof dbGetAssistantById>).mockResolvedValue(
          mockAssistant as never,
        );

        await expect(
          getAssistantForNewChat({
            assistantId,
            user: mockUser(),
          }),
        ).rejects.toThrow(ForbiddenError);
      });
    });
  });

  describe('assistant discovery filters', () => {
    const user = mockUser('teacher');
    const assistants = [
      {
        id: generateUUID(),
        userId: user.id,
        accessLevel: 'private',
        hasLinkAccess: false,
        suspended: false,
        ownerSchoolIds: user.schoolIds,
      } as AssistantSelectModel,
    ];

    it.each([
      {
        accessLevel: 'community' as const,
        expectedMock: dbGetCommunityGpts,
        expectedArgs: [],
      },
      {
        accessLevel: 'global' as const,
        expectedMock: dbGetGlobalGpts,
      },
      {
        accessLevel: 'school' as const,
        expectedMock: dbGetGptsByAssociatedSchools,
      },
      {
        accessLevel: 'private' as const,
        expectedMock: dbGetGptsByUser,
      },
    ])(
      'routes accessLevel=$accessLevel to the correct db function',
      async ({ accessLevel, expectedMock, expectedArgs = [{ user }] }) => {
        (expectedMock as MockedFunction<typeof expectedMock>).mockResolvedValue(
          assistants as never,
        );

        const result = await getAssistantByAccessLevel({ accessLevel, user });

        expect(result).toEqual(assistants);
        expect(expectedMock).toHaveBeenCalledWith(...expectedArgs);
      },
    );

    it('returns an empty list for unsupported access levels', async () => {
      const result = await getAssistantByAccessLevel({
        accessLevel: 'invalid' as never,
        user,
      });

      expect(result).toEqual([]);
    });

    it('returns combined lists for filter=all', async () => {
      const privateAssistant = {
        id: generateUUID(),
        userId: user.id,
        accessLevel: 'private',
        hasLinkAccess: false,
        suspended: false,
        ownerSchoolIds: user.schoolIds,
      } as AssistantSelectModel;
      const schoolAssistant = {
        id: generateUUID(),
        userId: generateUUID(),
        accessLevel: 'school',
        hasLinkAccess: false,
        suspended: false,
        ownerSchoolIds: user.schoolIds,
      } as AssistantSelectModel;
      const communityAssistant = {
        id: generateUUID(),
        userId: generateUUID(),
        accessLevel: 'community',
        hasLinkAccess: false,
        suspended: false,
        ownerSchoolIds: [],
      } as unknown as AssistantSelectModel;
      const officialAssistant = {
        id: generateUUID(),
        userId: generateUUID(),
        accessLevel: 'global',
        hasLinkAccess: false,
        suspended: false,
        ownerSchoolIds: [],
      } as unknown as AssistantSelectModel;

      (dbGetGptsByUser as MockedFunction<typeof dbGetGptsByUser>).mockResolvedValue([
        privateAssistant,
      ] as never);
      (
        dbGetGptsByAssociatedSchools as MockedFunction<typeof dbGetGptsByAssociatedSchools>
      ).mockResolvedValue([schoolAssistant] as never);
      (dbGetCommunityGpts as MockedFunction<typeof dbGetCommunityGpts>).mockResolvedValue([
        communityAssistant,
      ] as never);
      (dbGetGlobalGpts as MockedFunction<typeof dbGetGlobalGpts>).mockResolvedValue([
        officialAssistant,
      ] as never);

      const result = await getAssistantsByOverviewFilter({ filter: 'all', user });

      expect(result).toEqual([
        privateAssistant,
        schoolAssistant,
        communityAssistant,
        officialAssistant,
      ]);
    });

    it('filters suspended assistants for non-owners', async () => {
      const visibleAssistant = {
        id: generateUUID(),
        userId: generateUUID(),
        accessLevel: 'global',
        hasLinkAccess: false,
        suspended: false,
        ownerSchoolIds: [],
      } as unknown as AssistantSelectModel;
      const suspendedAssistant = {
        ...visibleAssistant,
        id: generateUUID(),
        suspended: true,
      } as AssistantSelectModel;

      (dbGetGlobalGpts as MockedFunction<typeof dbGetGlobalGpts>).mockResolvedValue([
        visibleAssistant,
        suspendedAssistant,
      ] as never);

      const result = await getAssistantsByOverviewFilter({ filter: 'official', user });

      expect(result).toEqual([visibleAssistant]);
    });

    it('keeps suspended assistants visible for owners', async () => {
      const ownSuspendedAssistant = {
        id: generateUUID(),
        userId: user.id,
        accessLevel: 'school',
        hasLinkAccess: false,
        suspended: true,
        ownerSchoolIds: user.schoolIds,
      } as AssistantSelectModel;

      (dbGetAssistantsByUserId as MockedFunction<typeof dbGetAssistantsByUserId>).mockResolvedValue(
        [ownSuspendedAssistant] as never,
      );

      const result = await getAssistantsByOverviewFilter({ filter: 'mine', user });

      expect(result).toEqual([ownSuspendedAssistant]);
    });

    it('keeps user-owned assistants in mine regardless of sharing level', async () => {
      const privateAssistant = {
        id: generateUUID(),
        userId: user.id,
        accessLevel: 'private',
        hasLinkAccess: false,
        suspended: false,
        ownerSchoolIds: user.schoolIds,
      } as AssistantSelectModel;
      const schoolAssistant = {
        ...privateAssistant,
        id: generateUUID(),
        accessLevel: 'school',
      } as AssistantSelectModel;
      const communityAssistant = {
        ...privateAssistant,
        id: generateUUID(),
        accessLevel: 'community',
      } as AssistantSelectModel;

      (dbGetAssistantsByUserId as MockedFunction<typeof dbGetAssistantsByUserId>).mockResolvedValue(
        [privateAssistant, schoolAssistant, communityAssistant] as never,
      );

      const result = await getAssistantsByOverviewFilter({ filter: 'mine', user });

      expect(result).toEqual([privateAssistant, schoolAssistant, communityAssistant]);
    });

    it('routes filter=community to dbGetCommunityGpts', async () => {
      (dbGetCommunityGpts as MockedFunction<typeof dbGetCommunityGpts>).mockResolvedValue(
        assistants as never,
      );

      const result = await getAssistantsByOverviewFilter({ filter: 'community', user });

      expect(result).toEqual(assistants);
      expect(dbGetCommunityGpts).toHaveBeenCalledWith();
    });

    it('routes filter=school to the school and community db functions', async () => {
      const schoolAssistant = {
        id: generateUUID(),
        userId: generateUUID(),
        accessLevel: 'school',
        hasLinkAccess: false,
        suspended: false,
        ownerSchoolIds: user.schoolIds,
      } as AssistantSelectModel;
      const communityAssistant = {
        id: generateUUID(),
        userId: generateUUID(),
        accessLevel: 'community',
        hasLinkAccess: false,
        suspended: false,
        ownerSchoolIds: user.schoolIds,
      } as unknown as AssistantSelectModel;
      const otherSchoolCommunityAssistant = {
        id: generateUUID(),
        userId: generateUUID(),
        accessLevel: 'community',
        hasLinkAccess: false,
        suspended: false,
        ownerSchoolIds: [],
      } as unknown as AssistantSelectModel;

      (
        dbGetGptsByAssociatedSchools as MockedFunction<typeof dbGetGptsByAssociatedSchools>
      ).mockResolvedValue([schoolAssistant] as never);
      (dbGetCommunityGpts as MockedFunction<typeof dbGetCommunityGpts>).mockResolvedValue([
        communityAssistant,
        otherSchoolCommunityAssistant,
      ] as never);

      const result = await getAssistantsByOverviewFilter({ filter: 'school', user });

      expect(result).toEqual([schoolAssistant, communityAssistant]);
      expect(dbGetGptsByAssociatedSchools).toHaveBeenCalledWith({ user });
      expect(dbGetCommunityGpts).toHaveBeenCalledWith();
    });

    it.each([
      { filter: 'mine' as const, expectedMock: dbGetAssistantsByUserId },
      { filter: 'official' as const, expectedMock: dbGetGlobalGpts },
    ])('routes filter=$filter to the correct db function', async ({ filter, expectedMock }) => {
      (expectedMock as MockedFunction<typeof expectedMock>).mockResolvedValue(assistants as never);

      const result = await getAssistantsByOverviewFilter({ filter, user });

      expect(result).toEqual(assistants);
      expect(expectedMock).toHaveBeenCalledWith({ user });
    });

    it('returns an empty list for unsupported overview filters', async () => {
      const result = await getAssistantsByOverviewFilter({
        filter: 'invalid' as never,
        user,
      });

      expect(result).toEqual([]);
    });
  });

  describe('uploadAvatarPictureForAssistant', () => {
    const assistantId = generateUUID();
    const userId = generateUUID();

    beforeEach(() => {
      const mockAssistant: Partial<AssistantSelectModel> = {
        id: assistantId,
        userId,
        accessLevel: 'private',
        pictureId: null,
      };
      (dbGetAssistantById as MockedFunction<typeof dbGetAssistantById>).mockResolvedValue(
        mockAssistant as never,
      );
      (uploadFileToS3 as MockedFunction<typeof uploadFileToS3>).mockResolvedValue(
        undefined as never,
      );
      mockDbReturning.mockResolvedValue([
        { id: assistantId, userId, pictureId: `custom-gpts/${assistantId}/avatar_abc123` },
      ]);
      (getAvatarPictureUrl as MockedFunction<typeof getAvatarPictureUrl>).mockResolvedValue(
        'https://signed-url',
      );
    });

    it('should upload avatar, update db and return picturePath and signedUrl', async () => {
      const result = await uploadAvatarPictureForAssistant({
        assistantId,
        user: { id: userId },
        croppedImageBlob: new Blob(['data'], { type: 'image/png' }),
      });

      expect(uploadFileToS3).toHaveBeenCalled();
      expect(result).toEqual({
        picturePath: `custom-gpts/${assistantId}/avatar_3a6eb0790f39`,
        signedUrl: 'https://signed-url',
      });
    });
  });
});
