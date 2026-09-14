import { beforeEach, describe, expect, it, MockedFunction, vi } from 'vitest';
import {
  copyAssistant,
  copyCharacter,
  copyEntityPictureIfExists,
  copyRelatedTemplateFiles,
  createTemplateFromUrl,
  updateTemplateDeletedState,
} from './template-service';
import { dbGetAssistantById, dbUpsertAssistant } from '@shared/db/functions/assistants';
import { dbCreateCharacter, dbGetCharacterById } from '@shared/db/functions/character';
import {
  dbGetFilesForLearningScenario,
  dbGetRelatedAssistantFiles,
  dbGetRelatedCharacterFiles,
} from '@shared/db/functions/files';
import { dbGetLearningScenarioById } from '@shared/db/functions/learning-scenario';
import {
  duplicateFileWithEmbeddings,
  linkFileToAssistant,
  linkFileToCharacter,
  linkFileToLearningScenario,
} from '@shared/files/fileService';
import { logError } from '@shared/logging';
import { copyFileInS3 } from '@shared/s3';
import { generateUUID } from '@shared/utils/uuid';

const { mockDbSet, mockDbUpdate, mockDbReturning, mockDbValues, mockDbInsert } = vi.hoisted(() => {
  const mockDbWhere = vi.fn().mockResolvedValue(undefined);
  const mockDbSet = vi.fn(() => ({ where: mockDbWhere }));
  const mockDbUpdate = vi.fn(() => ({ set: mockDbSet }));
  const mockDbReturning = vi.fn();
  const mockDbValues = vi.fn<
    (values: Record<string, unknown>) => { returning: typeof mockDbReturning }
  >(() => ({ returning: mockDbReturning }));
  const mockDbInsert = vi.fn(() => ({ values: mockDbValues }));
  return { mockDbSet, mockDbUpdate, mockDbReturning, mockDbValues, mockDbInsert };
});

vi.mock('@shared/db', () => ({ db: { update: mockDbUpdate, insert: mockDbInsert } }));

vi.mock('@shared/db/functions/assistants', () => ({
  dbGetAssistantById: vi.fn(),
  dbUpsertAssistant: vi.fn(),
}));

vi.mock('@shared/db/functions/character', () => ({
  dbGetCharacterById: vi.fn(),
  dbCreateCharacter: vi.fn(),
}));

vi.mock('@shared/db/functions/files', () => ({
  dbGetRelatedAssistantFiles: vi.fn(),
  dbGetRelatedCharacterFiles: vi.fn(),
  dbGetFilesForLearningScenario: vi.fn(),
}));

vi.mock('@shared/db/functions/learning-scenario', () => ({
  dbGetLearningScenarioById: vi.fn(),
}));

vi.mock('@shared/files/fileService', () => ({
  duplicateFileWithEmbeddings: vi.fn(),
  linkFileToAssistant: vi.fn(),
  linkFileToCharacter: vi.fn(),
  linkFileToLearningScenario: vi.fn(),
  copyAvatarPicture: vi.fn(),
}));

vi.mock('@shared/logging', () => ({
  logError: vi.fn(),
}));

vi.mock('@shared/s3', () => ({
  copyFileInS3: vi.fn(),
}));

describe('template-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('copyEntityPictureIfExists', () => {
    it('should return undefined when sourcePictureId is missing', async () => {
      const buildPictureKey = vi.fn();

      const result = await copyEntityPictureIfExists({
        sourcePictureId: null,
        newEntityId: 'entity-1',
        buildPictureKey,
      });

      expect(result).toBeUndefined();
      expect(buildPictureKey).not.toHaveBeenCalled();
      expect(copyFileInS3).not.toHaveBeenCalled();
    });

    it('should build target key from basename and copy file in s3', async () => {
      const buildPictureKey = vi.fn(
        (entityId: string, filename: string) => `entities/${entityId}/${filename}`,
      );

      const result = await copyEntityPictureIfExists({
        sourcePictureId: 'avatars/source-123/profile.png',
        newEntityId: 'entity-1',
        buildPictureKey,
      });

      expect(buildPictureKey).toHaveBeenCalledWith('entity-1', 'profile.png');
      expect(copyFileInS3).toHaveBeenCalledWith({
        copySource: 'avatars/source-123/profile.png',
        newKey: 'entities/entity-1/profile.png',
      });
      expect(result).toBe('entities/entity-1/profile.png');
    });

    it('should bubble up s3 copy errors', async () => {
      (copyFileInS3 as MockedFunction<typeof copyFileInS3>).mockRejectedValueOnce(
        new Error('S3 copy failed') as never,
      );

      await expect(
        copyEntityPictureIfExists({
          sourcePictureId: 'avatars/source-123/profile.png',
          newEntityId: 'entity-1',
          buildPictureKey: (entityId, filename) => `entities/${entityId}/${filename}`,
        }),
      ).rejects.toThrow('S3 copy failed');
    });
  });

  describe('copyAssistant', () => {
    it('should use duplicateAssistantName when provided', async () => {
      const originalId = 'assistant-origin';
      const sourceAssistant = {
        id: originalId,
        name: 'Original name',
        description: 'description',
        hasLinkAccess: true,
      };
      const upsertedAssistant = { id: 'assistant-copy', name: 'Duplicated assistant' };

      (dbGetAssistantById as MockedFunction<typeof dbGetAssistantById>).mockResolvedValue(
        sourceAssistant as never,
      );
      (dbUpsertAssistant as MockedFunction<typeof dbUpsertAssistant>).mockResolvedValue(
        upsertedAssistant as never,
      );

      const result = await copyAssistant(
        originalId,
        'private',
        { id: 'user-1' },
        'Duplicated assistant',
      );

      expect(dbGetAssistantById).toHaveBeenCalledWith({ assistantId: originalId });
      expect(dbUpsertAssistant).toHaveBeenCalledWith({
        assistant: expect.objectContaining({
          name: 'Duplicated assistant',
          originalAssistantId: originalId,
          accessLevel: 'private',
          userId: 'user-1',
          isDeleted: false,
          hasLinkAccess: false,
        }),
      });
      expect(result).toBe(upsertedAssistant);
    });

    it('should duplicate the picture in S3 under a key scoped to the new assistant id', async () => {
      const sourceAssistant = {
        id: 'assistant-origin',
        name: 'Original name',
        pictureId: 'custom-gpts/assistant-origin/avatar_abc123',
      };
      (dbGetAssistantById as MockedFunction<typeof dbGetAssistantById>).mockResolvedValue(
        sourceAssistant as never,
      );
      (dbUpsertAssistant as MockedFunction<typeof dbUpsertAssistant>).mockResolvedValue({
        id: 'assistant-copy',
      } as never);

      await copyAssistant('assistant-origin', 'global', { id: 'user-1' });

      const call = (dbUpsertAssistant as MockedFunction<typeof dbUpsertAssistant>).mock
        .calls[0]?.[0];
      expect(copyFileInS3).toHaveBeenCalledWith({
        copySource: 'custom-gpts/assistant-origin/avatar_abc123',
        newKey: call?.assistant.pictureId,
      });
      expect(call?.assistant.pictureId).not.toContain('assistant-origin');
    });

    it('should fallback to source name when duplicateAssistantName is not provided', async () => {
      const sourceAssistant = {
        id: 'assistant-origin',
        name: 'Source assistant name',
      };
      const upsertedAssistant = { id: 'assistant-copy', name: 'Source assistant name' };

      (dbGetAssistantById as MockedFunction<typeof dbGetAssistantById>).mockResolvedValue(
        sourceAssistant as never,
      );
      (dbUpsertAssistant as MockedFunction<typeof dbUpsertAssistant>).mockResolvedValue(
        upsertedAssistant as never,
      );

      await copyAssistant('assistant-origin', 'global', { id: 'user-1' });

      expect(dbUpsertAssistant).toHaveBeenCalledWith({
        assistant: expect.objectContaining({
          name: 'Source assistant name',
          accessLevel: 'global',
        }),
      });
    });

    it('should throw if source assistant does not exist', async () => {
      (dbGetAssistantById as MockedFunction<typeof dbGetAssistantById>).mockResolvedValue(
        undefined as never,
      );

      await expect(copyAssistant('missing-id', 'private', { id: 'user-1' })).rejects.toThrow(
        'Assistent nicht gefunden',
      );
    });

    it('should throw if upserted assistant has no id', async () => {
      (dbGetAssistantById as MockedFunction<typeof dbGetAssistantById>).mockResolvedValue({
        id: 'assistant-origin',
        name: 'Original name',
      } as never);
      (dbUpsertAssistant as MockedFunction<typeof dbUpsertAssistant>).mockResolvedValue(
        {} as never,
      );

      await expect(copyAssistant('assistant-origin', 'private', { id: 'user-1' })).rejects.toThrow(
        'Fehler beim Erstellen des Assistenten',
      );
    });
  });

  describe('copyCharacter', () => {
    it('should use duplicateCharacterName when provided', async () => {
      const originalId = 'character-origin';
      const sourceCharacter = {
        id: originalId,
        name: 'Original character',
        description: 'description',
        hasLinkAccess: true,
      };
      const createdCharacter = { id: 'character-copy', name: 'Duplicated character' };

      (dbGetCharacterById as MockedFunction<typeof dbGetCharacterById>).mockResolvedValue(
        sourceCharacter as never,
      );
      (dbCreateCharacter as MockedFunction<typeof dbCreateCharacter>).mockResolvedValue([
        createdCharacter,
      ] as never);

      const result = await copyCharacter(
        originalId,
        'private',
        { id: 'user-1' },
        'Duplicated character',
      );

      expect(dbGetCharacterById).toHaveBeenCalledWith({ characterId: originalId });
      expect(dbCreateCharacter).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Duplicated character',
          originalCharacterId: originalId,
          accessLevel: 'private',
          userId: 'user-1',
          isDeleted: false,
          hasLinkAccess: false,
        }),
      );
      expect(result).toBe(createdCharacter);
    });

    it('should duplicate the picture in S3 under a key scoped to the new character id', async () => {
      const sourceCharacter = {
        id: 'character-origin',
        name: 'Original character',
        pictureId: 'characters/character-origin/avatar_abc123',
      };
      (dbGetCharacterById as MockedFunction<typeof dbGetCharacterById>).mockResolvedValue(
        sourceCharacter as never,
      );
      (dbCreateCharacter as MockedFunction<typeof dbCreateCharacter>).mockResolvedValue([
        { id: 'character-copy' },
      ] as never);

      await copyCharacter('character-origin', 'global', { id: 'user-1' });

      const call = (dbCreateCharacter as MockedFunction<typeof dbCreateCharacter>).mock
        .calls[0]?.[0];
      expect(copyFileInS3).toHaveBeenCalledWith({
        copySource: 'characters/character-origin/avatar_abc123',
        newKey: call?.pictureId,
      });
      expect(call?.pictureId).not.toContain('character-origin');
    });

    it('should fallback to source name when duplicateCharacterName is not provided', async () => {
      const sourceCharacter = {
        id: 'character-origin',
        name: 'Source character name',
      };
      const createdCharacter = { id: 'character-copy', name: 'Source character name' };

      (dbGetCharacterById as MockedFunction<typeof dbGetCharacterById>).mockResolvedValue(
        sourceCharacter as never,
      );
      (dbCreateCharacter as MockedFunction<typeof dbCreateCharacter>).mockResolvedValue([
        createdCharacter,
      ] as never);

      await copyCharacter('character-origin', 'global', { id: 'user-1' });

      expect(dbCreateCharacter).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Source character name',
          accessLevel: 'global',
        }),
      );
    });

    it('should truncate the name to 50 characters', async () => {
      const longName = 'A'.repeat(60);
      const sourceCharacter = {
        id: 'character-origin',
        name: 'Source',
      };
      const createdCharacter = { id: 'character-copy', name: longName.substring(0, 50) };

      (dbGetCharacterById as MockedFunction<typeof dbGetCharacterById>).mockResolvedValue(
        sourceCharacter as never,
      );
      (dbCreateCharacter as MockedFunction<typeof dbCreateCharacter>).mockResolvedValue([
        createdCharacter,
      ] as never);

      await copyCharacter('character-origin', 'private', { id: 'user-1' }, longName);

      expect(dbCreateCharacter).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'A'.repeat(50),
        }),
      );
    });

    it('should throw if source character does not exist', async () => {
      (dbGetCharacterById as MockedFunction<typeof dbGetCharacterById>).mockResolvedValue(
        undefined as never,
      );

      await expect(copyCharacter('missing-id', 'private', { id: 'user-1' })).rejects.toThrow(
        'Dialogpartner nicht gefunden',
      );
    });

    it('should throw if created character has no id', async () => {
      (dbGetCharacterById as MockedFunction<typeof dbGetCharacterById>).mockResolvedValue({
        id: 'character-origin',
        name: 'Original name',
      } as never);
      (dbCreateCharacter as MockedFunction<typeof dbCreateCharacter>).mockResolvedValue(
        [] as never,
      );

      await expect(copyCharacter('character-origin', 'private', { id: 'user-1' })).rejects.toThrow(
        'Fehler beim Erstellen des Dialogpartners',
      );
    });
  });

  describe('copyRelatedTemplateFiles', () => {
    it('should copy and link files for assistant templates', async () => {
      (
        dbGetRelatedAssistantFiles as MockedFunction<typeof dbGetRelatedAssistantFiles>
      ).mockResolvedValue([{ id: 'file-1' }] as never);
      (
        duplicateFileWithEmbeddings as MockedFunction<typeof duplicateFileWithEmbeddings>
      ).mockResolvedValue('file-copy-1' as never);

      await copyRelatedTemplateFiles('assistant', 'template-1', 'result-1');

      expect(duplicateFileWithEmbeddings).toHaveBeenCalledWith('file-1');
      expect(linkFileToAssistant).toHaveBeenCalledWith('file-copy-1', 'result-1');
    });

    it('should copy and link files for character templates', async () => {
      (
        dbGetRelatedCharacterFiles as MockedFunction<typeof dbGetRelatedCharacterFiles>
      ).mockResolvedValue([{ id: 'file-2' }] as never);
      (
        duplicateFileWithEmbeddings as MockedFunction<typeof duplicateFileWithEmbeddings>
      ).mockResolvedValue('file-copy-2' as never);

      await copyRelatedTemplateFiles('character', 'template-2', 'result-2');

      expect(duplicateFileWithEmbeddings).toHaveBeenCalledWith('file-2');
      expect(linkFileToCharacter).toHaveBeenCalledWith('file-copy-2', 'result-2');
    });

    it('should copy and link files for learning-scenario templates', async () => {
      (
        dbGetFilesForLearningScenario as MockedFunction<typeof dbGetFilesForLearningScenario>
      ).mockResolvedValue([{ id: 'file-3' }] as never);
      (
        duplicateFileWithEmbeddings as MockedFunction<typeof duplicateFileWithEmbeddings>
      ).mockResolvedValue('file-copy-3' as never);

      await copyRelatedTemplateFiles('learning-scenario', 'template-3', 'result-3');

      expect(duplicateFileWithEmbeddings).toHaveBeenCalledWith('file-3');
      expect(linkFileToLearningScenario).toHaveBeenCalledWith('file-copy-3', 'result-3');
    });

    it('should continue processing when duplicating one file fails', async () => {
      (
        dbGetRelatedAssistantFiles as MockedFunction<typeof dbGetRelatedAssistantFiles>
      ).mockResolvedValue([{ id: 'file-1' }, { id: 'file-2' }] as never);
      (duplicateFileWithEmbeddings as MockedFunction<typeof duplicateFileWithEmbeddings>)
        .mockRejectedValueOnce(new Error('copy failed'))
        .mockResolvedValueOnce('file-copy-2' as never);

      await copyRelatedTemplateFiles('assistant', 'template-1', 'result-1');

      expect(logError).toHaveBeenCalledWith(
        expect.stringContaining('Error copying file'),
        expect.any(Error),
      );
      expect(linkFileToAssistant).toHaveBeenCalledWith('file-copy-2', 'result-1');
    });

    it('should log and swallow errors for invalid template type', async () => {
      await expect(
        copyRelatedTemplateFiles('invalid-template-type' as never, 'template-1', 'result-1'),
      ).resolves.not.toThrow();

      expect(logError).toHaveBeenCalledWith(
        expect.stringContaining('Error processing files'),
        expect.any(Error),
      );
    });
  });

  describe('createTemplateFromUrl', () => {
    it('should throw on invalid url format', async () => {
      await expect(createTemplateFromUrl('/invalid/url')).rejects.toThrow('Invalid url format.');
    });

    it('should duplicate the learning scenario picture in S3 under a key scoped to the new template id', async () => {
      const originalId = generateUUID();
      (
        dbGetLearningScenarioById as MockedFunction<typeof dbGetLearningScenarioById>
      ).mockResolvedValue({
        id: originalId,
        name: 'Original name',
        modelId: generateUUID(),
        userId: generateUUID(),
        accessLevel: 'private',
        pictureId: `shared-chats/${originalId}/avatar_abc123`,
      } as never);
      mockDbReturning.mockResolvedValue([{ id: generateUUID() }]);
      (
        dbGetFilesForLearningScenario as MockedFunction<typeof dbGetFilesForLearningScenario>
      ).mockResolvedValue([]);

      await createTemplateFromUrl(`/learning-scenarios/editor/${originalId}`);

      const call = mockDbValues.mock.calls[0]?.[0];
      expect(copyFileInS3).toHaveBeenCalledWith({
        copySource: `shared-chats/${originalId}/avatar_abc123`,
        newKey: call?.pictureId,
      });
      expect(call?.pictureId).not.toContain(originalId);
    });
  });

  describe('updateTemplateDeletedState', () => {
    it.each([
      { templateType: 'character' as const },
      { templateType: 'assistant' as const },
      { templateType: 'learning-scenario' as const },
    ])('updates the isDeleted flag for templateType=$templateType', async ({ templateType }) => {
      await updateTemplateDeletedState(templateType, 'template-1', true);

      expect(mockDbUpdate).toHaveBeenCalledTimes(1);
      expect(mockDbSet).toHaveBeenCalledWith({ isDeleted: true });
    });

    it('throws for an invalid template type', async () => {
      await expect(
        updateTemplateDeletedState('invalid-template-type' as never, 'template-1', true),
      ).rejects.toThrow('Invalid template type');

      expect(mockDbUpdate).not.toHaveBeenCalled();
    });
  });
});
