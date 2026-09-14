import { UserModel } from '@shared/auth/user-model';
import {
  getConversation,
  getConversationMessages,
} from '@shared/conversation/conversation-service';
import { db } from '@shared/db';
import {
  dbGetAssistantsByUserId,
  dbDeleteAssistantByIdAndUser,
  dbGetAssistantById,
  dbGetAssistantByIdForConversation,
  dbGetCommunityGpts,
  dbGetGlobalGpts,
  dbGetGptsByAssociatedSchools,
  dbGetGptsByUser,
  dbInsertAssistantFileMapping,
} from '@shared/db/functions/assistants';
import { dbGetFileForAssistant, dbGetRelatedAssistantFiles } from '@shared/db/functions/files';
import {
  AccessLevel,
  accessLevelSchema,
  AssistantFileMapping,
  AssistantSelectModel,
  assistantTable,
  assistantUpdateSchema,
  FileModel,
  fileTable,
} from '@shared/db/schema';
import { checkParameterUUID, ForbiddenError, NotFoundError } from '@shared/error';
import {
  deleteAvatarPicture,
  deleteMessageAttachments,
  getAvatarPictureUrl,
} from '@shared/files/fileService';
import { buildAssistantPictureKey } from '@shared/utils/picture-key';
import { deleteFileFromS3, getReadOnlySignedUrl, uploadFileToS3 } from '@shared/s3';
import { ONE_HOUR } from '@shared/s3/const';
import { copyAssistant, copyRelatedTemplateFiles } from '@shared/templates/template-service';
import { OverviewFilter } from '@shared/overview-filter';
import { generateUUID } from '@shared/utils/uuid';
import {
  getChangedKeys,
  getPreservedUpdatedAtForExemptedKeys,
} from '@shared/utils/preserve-updated-at';
import { and, eq } from 'drizzle-orm';
import z from 'zod';
import { computeBlobHash } from '@ais-chat/shared-core/crypto/blob-hash';
import {
  verifySuspensionState,
  verifyReadAccess,
  verifyWriteAccess,
  filterCommunitySharedByAssociatedSchool,
  filterReadableCustomChats,
} from '@shared/auth/authorization-service';

function buildAvatarFilename(hash: string) {
  return `avatar_${hash}`;
}

/**
 * Loads assistant for editing or viewing in the frontend.
 * Throws if the user is not authorized to access the assistant:
 * - NotFound if the assistant does not exist
 * - Forbidden if the assistant is private and the user is not the owner
 * - Forbidden if the assistant is school-level and the user is not in the same school (and not the owner)
 *
 * Link sharing bypass: If `hasLinkAccess` is true, access checks are skipped
 * and any authenticated user can view the assistant. Note that link sharing
 * only grants read-only access - editing is still restricted to the owner.
 */
export async function getAssistantByUser({
  assistantId,
  user,
}: {
  assistantId: string;
  user: Pick<UserModel, 'id' | 'schoolIds'>;
}): Promise<{
  assistant: AssistantSelectModel;
  fileMappings: FileModel[];
  pictureUrl: string | undefined;
}> {
  checkParameterUUID(assistantId);
  const assistant = await dbGetAssistantById({ assistantId });
  verifyReadAccess({
    item: assistant,
    user,
  });

  const [fileMappings, pictureUrl] = await Promise.all([
    dbGetRelatedAssistantFiles(assistantId),
    getAvatarPictureUrl(assistant.pictureId),
  ]);

  return { assistant, fileMappings, pictureUrl };
}

/**
 * User starts a new chat with a custom gpt.
 * Conversation starts with the first message.
 * Throws NotFoundError if the custom gpt does not exist.
 * Throws ForbiddenError if the user is not authorized to use the custom gpt.
 *
 * Link sharing bypass: If `hasLinkAccess` is true, access checks are skipped
 * and any authenticated user can use the custom gpt for chat.
 */
export async function getAssistantForNewChat({
  assistantId,
  user,
}: {
  assistantId: string;
  user: Pick<UserModel, 'id' | 'schoolIds'>;
}) {
  checkParameterUUID(assistantId);
  const assistant = await dbGetAssistantById({ assistantId });
  verifyReadAccess({
    item: assistant,
    user,
  });

  return assistant;
}

export async function getAssistantForExistingConversation({
  assistantId,
  conversationId,
  user,
}: {
  assistantId: string;
  conversationId: string;
  user: Pick<UserModel, 'id' | 'schoolIds'>;
}) {
  checkParameterUUID(assistantId, conversationId);
  const assistant = await dbGetAssistantByIdForConversation({
    assistantId,
    conversationId,
    userId: user.id,
  });
  if (!assistant) throw new NotFoundError('Assistant not found');
  verifyReadAccess({ item: assistant, user });

  return assistant;
}

/**
 * Returns an existing conversation along with its messages and the associated custom gpt.
 * Throws NotFoundError if the custom gpt does not exist.
 * Throws NotFoundError if the conversation does not exist.
 * Throws ForbiddenError if the user is not the owner of the conversation.
 */
export async function getConversationWithMessagesAndAssistant({
  conversationId,
  assistantId,
  userId,
}: {
  conversationId: string;
  assistantId: string;
  userId: string;
}) {
  checkParameterUUID(assistantId, conversationId);
  const [assistant, conversation, messages] = await Promise.all([
    dbGetAssistantByIdForConversation({ assistantId, conversationId, userId }),
    getConversation({ conversationId, userId }),
    getConversationMessages({ conversationId, userId }),
  ]);

  if (!assistant || conversation.assistantId !== assistantId) {
    throw new NotFoundError('Conversation not found');
  }

  return { assistant, conversation, messages };
}

/**
 * Returns a list of custom gpts for the user based on
 * userId, schools associated with the user, federalStateId and access level.
 */
export async function getAssistantByAccessLevel({
  accessLevel,
  user,
}: {
  accessLevel: AccessLevel;
  user: Pick<UserModel, 'id' | 'schoolIds' | 'federalStateId'>;
}): Promise<AssistantSelectModel[]> {
  let assistants: AssistantSelectModel[];

  switch (accessLevel) {
    case 'community':
      assistants = await dbGetCommunityGpts();
      break;
    case 'global':
      assistants = await dbGetGlobalGpts({ user });
      break;
    case 'school':
      assistants = await dbGetGptsByAssociatedSchools({ user });
      break;
    case 'private':
      assistants = await dbGetGptsByUser({ user });
      break;
    default:
      return [];
  }

  return filterReadableCustomChats({ items: assistants, user });
}

export async function getAssistantsByOverviewFilter({
  filter,
  user,
}: {
  filter: OverviewFilter;
  user: Pick<UserModel, 'id' | 'schoolIds' | 'federalStateId'>;
}): Promise<AssistantSelectModel[]> {
  let assistants: AssistantSelectModel[];

  switch (filter) {
    case 'all': {
      const [privateAssistants, schoolAssistants, communityAssistants, globalAssistants] =
        await Promise.all([
          dbGetGptsByUser({ user }),
          dbGetGptsByAssociatedSchools({ user }),
          dbGetCommunityGpts(),
          dbGetGlobalGpts({ user }),
        ]);
      assistants = [
        ...privateAssistants,
        ...schoolAssistants,
        ...communityAssistants,
        ...globalAssistants,
      ];
      break;
    }
    case 'mine':
      assistants = await dbGetAssistantsByUserId({ user });
      break;
    case 'official':
      assistants = await dbGetGlobalGpts({ user });
      break;
    case 'community':
      assistants = await dbGetCommunityGpts();
      break;
    case 'school': {
      const [schoolAssistants, communityAssistants] = await Promise.all([
        dbGetGptsByAssociatedSchools({ user }),
        dbGetCommunityGpts(),
      ]);
      assistants = [
        ...schoolAssistants,
        ...filterCommunitySharedByAssociatedSchool({ items: communityAssistants, user }),
      ];
      break;
    }
    default:
      return [];
  }

  return filterReadableCustomChats({ items: assistants, user });
}

/**
 * User creates a new assistant.
 * If a templateId is provided, the new assistant is created by copying the template.
 * Throws if the user is not a teacher.
 */
export async function createNewAssistant({
  templateId,
  user,
  duplicateAssistantName,
}: {
  templateId?: string;
  user: UserModel;
  duplicateAssistantName?: string;
}) {
  if (user.userRole !== 'teacher') throw new ForbiddenError('Not authorized to create assistant');

  if (templateId !== undefined) {
    const sourceAssistant = await dbGetAssistantById({ assistantId: templateId });
    verifyReadAccess({
      item: sourceAssistant,
      user,
    });
    verifySuspensionState({ item: sourceAssistant });

    const insertedAssistant = await copyAssistant(
      templateId,
      'private',
      user,
      duplicateAssistantName,
    );

    await copyRelatedTemplateFiles('assistant', templateId, insertedAssistant.id);
    return insertedAssistant;
  }

  const assistantId = generateUUID();

  const [insertedAssistant] = await db
    .insert(assistantTable)
    .values({
      id: assistantId,
      name: '',
      systemPrompt: '',
      userId: user.id,
      description: '',
      instructions: '',
      promptSuggestions: [],
    })
    .returning();

  if (!insertedAssistant) {
    throw new Error('Could not create a new assistant');
  }

  return { ...insertedAssistant, ownerSchoolIds: user.schoolIds };
}

/**
 * Link a file to a custom gpt.
 * Throws if the user is not the owner of the custom gpt.
 */
export async function linkFileToAssistant({
  fileId,
  assistantId,
  user,
}: {
  fileId: string;
  assistantId: string;
  user: Pick<UserModel, 'id'>;
}) {
  checkParameterUUID(assistantId);
  const assistant = await dbGetAssistantById({ assistantId });
  verifyWriteAccess({ item: assistant, user });

  const insertedFileMapping = await dbInsertAssistantFileMapping({
    assistantId,
    fileId: fileId,
  });

  if (!insertedFileMapping) {
    throw new Error('Could not link file to assistant');
  }
}

/**
 * Delete file mapping and the file entity itself from database.
 * Also deletes the actual file from S3.
 * Throws if the user is not the owner of the custom gpt.
 */
export async function deleteFileMappingAndEntity({
  assistantId,
  fileId,
  user,
}: {
  assistantId: string;
  fileId: string;
  user: Pick<UserModel, 'id'>;
}) {
  checkParameterUUID(assistantId);
  const assistant = await dbGetAssistantById({ assistantId });
  verifyWriteAccess({ item: assistant, user });

  // delete mapping and file entry in db
  await db.transaction(async (tx) => {
    await tx.delete(AssistantFileMapping).where(eq(AssistantFileMapping.fileId, fileId));
    await tx.delete(fileTable).where(eq(fileTable.id, fileId));
  });

  // Delete the file from S3
  await deleteMessageAttachments([fileId]);
}

/**
 * Get file mappings for a custom gpt.
 * Throws if the user is not authorized to access the custom gpt:
 * - NotFound if the custom gpt does not exist
 * - Forbidden if the custom gpt is private and the user is not the owner
 * - Forbidden if the custom gpt is school-level and the user is not in the same school
 */
export async function getFileMappings({
  assistantId,
  user,
}: {
  assistantId: string;
  user: Pick<UserModel, 'id' | 'schoolIds'>;
}): Promise<FileModel[]> {
  checkParameterUUID(assistantId);
  const assistant = await dbGetAssistantById({ assistantId });
  verifyReadAccess({
    item: assistant,
    user,
  });

  return await dbGetRelatedAssistantFiles(assistantId);
}

/**
 * Update access level, e.g. from private to school/community or back to private.
 * Throws if the user is not the owner of the custom gpt.
 */
export async function updateAssistantAccessLevel({
  accessLevel,
  assistantId,
  user,
}: {
  accessLevel: AccessLevel;
  assistantId: string;
  user: Pick<UserModel, 'id'>;
}) {
  checkParameterUUID(assistantId);
  accessLevelSchema.parse(accessLevel);

  if (accessLevel === 'global') {
    throw new ForbiddenError('Not authorized to set the access level to global');
  }

  const assistant = await dbGetAssistantById({ assistantId });
  verifyWriteAccess({ item: assistant, user });
  verifySuspensionState({ item: assistant });

  if (assistant.accessLevel === accessLevel) {
    return assistant;
  }

  const preservedUpdatedAt = getPreservedUpdatedAtForExemptedKeys({
    entity: assistant,
    values: { accessLevel },
    exemptedKeys: ['accessLevel'],
  });

  const [updatedAssistant] = await db
    .update(assistantTable)
    .set({ accessLevel, ...(preservedUpdatedAt ? { updatedAt: preservedUpdatedAt } : {}) })
    .where(and(eq(assistantTable.id, assistantId), eq(assistantTable.userId, user.id)))
    .returning();

  if (!updatedAssistant) {
    throw new Error('Could not update the access level of the assistant');
  }

  return updatedAssistant;
}

const updateAssistantSchema = assistantUpdateSchema.omit({
  id: true,
  isDeleted: true,
  originalAssistantId: true,
  accessLevel: true,
  pictureId: true,
});

/**
 * Update assistant properties.
 * Throws if the user is not the owner of the assistant.
 */
export async function updateAssistant({
  assistantId,
  user,
  assistantProps,
}: {
  assistantId: string;
  user: Pick<UserModel, 'id'>;
  assistantProps: z.infer<typeof updateAssistantSchema>;
}) {
  checkParameterUUID(assistantId);
  const assistant = await dbGetAssistantById({ assistantId });
  verifyWriteAccess({ item: assistant, user });

  const parsedValues = updateAssistantSchema.parse(assistantProps);
  const changedKeys = getChangedKeys({
    entity: assistant,
    values: parsedValues,
  });

  if (changedKeys.length === 0) {
    return assistant;
  }

  const preservedUpdatedAt = getPreservedUpdatedAtForExemptedKeys({
    entity: assistant,
    values: parsedValues,
    exemptedKeys: ['hasLinkAccess'],
  });

  const [updatedAssistant] = await db
    .update(assistantTable)
    .set({ ...parsedValues, ...(preservedUpdatedAt ? { updatedAt: preservedUpdatedAt } : {}) })
    .where(and(eq(assistantTable.id, assistantId), eq(assistantTable.userId, user.id)))
    .returning();

  if (!updatedAssistant) {
    throw new Error('Could not update the assistant');
  }

  return updatedAssistant;
}

/**
 * Deletes an assistant.
 * Throws if the user is not the owner of the assistant.
 * Also deletes all related files and the avatar picture from S3.
 */
export async function deleteAssistant({
  assistantId,
  user,
}: {
  assistantId: string;
  user: Pick<UserModel, 'id' | 'schoolIds'>;
}) {
  checkParameterUUID(assistantId);
  const assistant = await dbGetAssistantById({ assistantId });
  verifyWriteAccess({ item: assistant, user });

  const relatedFiles = await dbGetRelatedAssistantFiles(assistantId);

  // delete assistant from db
  const deletedAssistant = await dbDeleteAssistantByIdAndUser({ gptId: assistantId, user });

  // delete avatar picture from S3
  await deleteAvatarPicture(assistant.pictureId);

  // delete all related files from s3
  await deleteMessageAttachments(relatedFiles.map((file) => file.id));

  return deletedAssistant;
}

export async function uploadAvatarPictureForAssistant({
  assistantId,
  croppedImageBlob,
  user,
}: {
  assistantId: string;
  croppedImageBlob: Blob;
  user: Pick<UserModel, 'id'>;
}) {
  checkParameterUUID(assistantId);
  const assistant = await dbGetAssistantById({ assistantId });
  verifyWriteAccess({ item: assistant, user });

  // Compute hash of the blob for cache busting
  const hash = await computeBlobHash(croppedImageBlob);
  const key = buildAssistantPictureKey(assistantId, buildAvatarFilename(hash));
  const oldKey = assistant.pictureId;
  if (oldKey === key) {
    // image didn't change, skip update
    return {
      picturePath: key,
      signedUrl: await getAvatarPictureUrl(key),
    };
  }

  // Upload new avatar
  await uploadFileToS3({
    key,
    body: croppedImageBlob,
    contentType: croppedImageBlob.type,
  });

  // Change pictureId in db
  const [updatedAssistant] = await db
    .update(assistantTable)
    .set({ pictureId: key })
    .where(and(eq(assistantTable.id, assistantId), eq(assistantTable.userId, user.id)))
    .returning();

  if (!updatedAssistant) {
    throw new Error('Could not update the assistant');
  }

  // Delete old avatar if it exists
  if (assistant.pictureId) {
    try {
      await deleteFileFromS3({ key: assistant.pictureId });
    } catch {
      // Silently ignore error, cleanup job will delete unreferenced files later
    }
  }

  return {
    picturePath: key,
    signedUrl: await getAvatarPictureUrl(key),
  };
}

/**
 * Downloads a file for an assistant.
 *
 * Authorization checks:
 * - User must have access to the assistant.
 * - The file must belong to the assistant.
 */
export async function downloadFileFromAssistant({
  assistantId,
  fileId,
  user,
}: {
  assistantId: string;
  fileId: string;
  user: Pick<UserModel, 'id' | 'schoolIds'>;
}) {
  checkParameterUUID(assistantId);
  const assistant = await dbGetAssistantById({ assistantId });
  verifyReadAccess({
    item: assistant,
    user,
  });

  const file = await dbGetFileForAssistant({ fileId, assistantId });
  if (!file) {
    throw new NotFoundError('File not found');
  }

  return getReadOnlySignedUrl({
    key: `message_attachments/${fileId}`,
    filename: file.name,
    attachment: true,
    options: { expiresIn: ONE_HOUR },
  });
}
