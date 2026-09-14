import { UserModel } from '@shared/auth/user-model';
import { db } from '@shared/db';
import {
  dbCreateCharacterShare,
  dbDeleteCharacterByIdAndUser,
  dbExtendSharedCharacterConversationExpiration,
  dbGetAllAccessibleCharacters,
  dbGetAllCharactersByUser,
  dbGetCharacterById,
  dbGetCharacterByIdForConversation,
  dbGetCharacterByIdOptionalShareData,
  dbGetCharacterByIdWithShareData,
  dbGetCommunityCharacters,
  dbGetCharacters,
  dbGetCharactersByAssociatedSchools,
  dbGetCharactersByUser,
  dbGetGlobalCharacters,
  dbGetLatestManageableCharacterShare,
  dbStopCharacterShare,
  dbUpdateCharacterShareTokenPointsLimit,
} from '@shared/db/functions/character';
import { dbGetFileForCharacter, dbGetRelatedCharacterFiles } from '@shared/db/functions/files';
import { dbGetLlmModelsByFederalStateId } from '@shared/db/functions/llm-model';
import { FederalStateModel } from '@shared/federal-states/types';
import {
  getUsedBudgetInCentByUser,
  getMaxBudgetInCentByUser,
} from '@shared/users/user-budget-service';
import {
  AccessLevel,
  accessLevelSchema,
  CharacterFileMapping,
  CharacterOptionalShareDataModel,
  CharacterSelectModel,
  characterTable,
  characterUpdateSchema,
  CharacterWithShareDataModel,
  FileModel,
  fileTable,
} from '@shared/db/schema';
import { checkParameterUUID, ForbiddenError, InvalidArgumentError } from '@shared/error';
import { NotFoundError } from '@shared/error/not-found-error';
import {
  deleteAvatarPicture,
  deleteMessageAttachments,
  getAvatarPictureUrl,
} from '@shared/files/fileService';
import { buildCharacterPictureKey } from '@shared/utils/picture-key';
import { deleteFileFromS3, getReadOnlySignedUrl, uploadFileToS3 } from '@shared/s3';
import { ONE_HOUR } from '@shared/s3/const';
import { generateInviteCode } from '@shared/sharing/generate-invite-code';
import {
  MAX_SHARE_USAGE_TIME_LIMIT_IN_MINUTES,
  SHARE_EXTENSION_WINDOW_MS,
} from '@shared/sharing/const';
import { copyCharacter, copyRelatedTemplateFiles } from '@shared/templates/template-service';
import { OverviewFilter } from '@shared/overview-filter';
import { removeNullishValues } from '@shared/utils/remove-nullish-values';
import {
  getChangedKeys,
  getPreservedUpdatedAtForExemptedKeys,
} from '@shared/utils/preserve-updated-at';
import { generateUUID } from '@shared/utils/uuid';
import { and, eq } from 'drizzle-orm';
import z from 'zod';
import { computeBlobHash } from '@ais-chat/shared-core/crypto/blob-hash';
import {
  requireTeacherRole,
  verifySuspensionState,
  verifyReadAccess,
  verifyWriteAccess,
  filterCommunitySharedByAssociatedSchool,
  filterReadableCustomChats,
} from '@shared/auth/authorization-service';
import { dbGetSharedCharacterChatUsageInCentByCharacterId } from '@shared/db/functions/token-points';
import { sharedCharacterChatHasReachedTokenPointsLimit } from '@shared/users/usage';
import { isShareWithinGraceWindow } from '@shared/sharing/is-share-within-grace-window';

function buildAvatarFilename(hash: string) {
  return `avatar_${hash}`;
}

/**
 * Creates a new character for a user, optionally based on a template.
 */
export const createNewCharacter = async ({
  federalStateId,
  modelId: _modelId,
  user,
  templateId,
  duplicateCharacterName,
}: {
  federalStateId: string;
  modelId?: string;
  user: UserModel;
  templateId?: string;
  duplicateCharacterName?: string;
}) => {
  requireTeacherRole(user.userRole);

  if (templateId !== undefined) {
    const sourceCharacter = await dbGetCharacterById({ characterId: templateId });
    if (!sourceCharacter) {
      throw new NotFoundError('Character not found');
    }
    verifyReadAccess({
      item: sourceCharacter,
      user,
    });
    verifySuspensionState({ item: sourceCharacter });

    const insertedCharacter = await copyCharacter(
      templateId,
      'private',
      user,
      duplicateCharacterName,
    );

    await copyRelatedTemplateFiles('character', templateId, insertedCharacter.id);
    return insertedCharacter;
  }

  // Generate uuid beforehand to avoid two db transactions for create and immediate update
  const characterId = generateUUID();
  const llmModels = await dbGetLlmModelsByFederalStateId({
    federalStateId: federalStateId,
  });

  const model = llmModels.find((m) => m.id === _modelId) ?? llmModels[0];

  if (model === undefined) {
    throw new Error(
      `Could not find modelId ${_modelId} nor any other model for federalStateId ${federalStateId}`,
    );
  }

  const [insertedCharacter] = await db
    .insert(characterTable)
    .values({
      id: characterId,
      name: '',
      userId: user.id,
      modelId: model.id,
    })
    .returning();

  if (insertedCharacter === undefined) {
    throw new Error('Could not create a new character');
  }

  return { ...insertedCharacter, ownerSchoolIds: user.schoolIds };
};

/**
 * Deletes a character file mapping and the associated file entry in the database.
 * Also deletes the actual file from S3.
 *
 * Only the owner is allowed to delete files from a character.
 */
export const deleteFileMappingAndEntity = async ({
  characterId,
  fileId,
  user,
}: {
  characterId: string;
  fileId: string;
  user: Pick<UserModel, 'id'>;
}) => {
  checkParameterUUID(characterId);
  // Authorization check: user must own character
  const { character } = await getCharacterInfo(characterId, user.id);
  verifyWriteAccess({ item: character, user });

  // Delete the mapping and the file entry
  await db.transaction(async (tx) => {
    await tx.delete(CharacterFileMapping).where(eq(CharacterFileMapping.fileId, fileId));
    await tx.delete(fileTable).where(eq(fileTable.id, fileId));
  });

  // Delete the file from S3
  await deleteMessageAttachments([fileId]);
};

/**
 * Get all file mappings related to a character.
 *
 * If the character is private, only the owner can fetch file mappings.
 * If the character is released for a school, any teacher in that school can fetch file mappings.
 * If the character is global, any teacher can fetch those file mappings.
 */
export const fetchFileMappings = async ({
  characterId,
  user,
}: {
  characterId: string;
  user: Pick<UserModel, 'id' | 'schoolIds'>;
}): Promise<FileModel[]> => {
  checkParameterUUID(characterId);
  // Authorization check
  const { character } = await getCharacterInfo(characterId, user.id);
  verifyReadAccess({
    item: character,
    user,
  });

  // Fetch and return related files
  return await dbGetRelatedCharacterFiles(characterId);
};

/**
 * Links a file to a character by creating a new CharacterFileMapping entry in the database.
 *
 * Only the owner is allowed to add new files to a character.
 */
export const linkFileToCharacter = async ({
  fileId,
  characterId,
  user,
}: {
  fileId: string;
  characterId: string;
  user: Pick<UserModel, 'id'>;
}) => {
  checkParameterUUID(characterId);
  // Authorization check
  const { character } = await getCharacterInfo(characterId, user.id);
  verifyWriteAccess({ item: character, user });

  // create a new file mapping
  const [insertedFileMapping] = await db
    .insert(CharacterFileMapping)
    .values({ characterId: characterId, fileId: fileId })
    .returning();
  if (insertedFileMapping === undefined) {
    throw new Error('Could not link file to character');
  }
};

/**
 * User can share a character he owns with the school or community
 * or unshare it (access level = private).
 * User is not allowed to set the access level to global.
 */
export const updateCharacterAccessLevel = async ({
  characterId,
  accessLevel,
  user,
}: {
  characterId: string;
  accessLevel: AccessLevel;
  user: Pick<UserModel, 'id'>;
}) => {
  checkParameterUUID(characterId);
  accessLevelSchema.parse(accessLevel);

  if (accessLevel === 'global') {
    throw new ForbiddenError('Not authorized to set the access level to global');
  }

  const { character } = await getCharacterInfo(characterId, user.id);
  verifyWriteAccess({ item: character, user });
  verifySuspensionState({ item: character });

  if (character.accessLevel === accessLevel) {
    return character;
  }

  const preservedUpdatedAt = getPreservedUpdatedAtForExemptedKeys({
    entity: character,
    values: { accessLevel },
    exemptedKeys: ['accessLevel'],
  });

  // Update the access level in database
  const [updatedCharacter] = await db
    .update(characterTable)
    .set({ accessLevel, ...(preservedUpdatedAt ? { updatedAt: preservedUpdatedAt } : {}) })
    .where(and(eq(characterTable.id, characterId), eq(characterTable.userId, user.id)))
    .returning();

  if (updatedCharacter === undefined) {
    throw new Error('Could not update the access level of the character');
  }

  return updatedCharacter;
};

/**
 * Schema for updating character details that are allowed to be changed by the user.
 */
const updateCharacterSchema = characterUpdateSchema.omit({
  accessLevel: true,
  isDeleted: true,
  originalCharacterId: true,
  pictureId: true,
});
export type UpdateCharacterActionModel = z.infer<typeof updateCharacterSchema>;

/**
 * Updates character details that are allowed to be changed by user afterwards
 * The user must be the owner of the character.
 */
export const updateCharacter = async ({
  user,
  ...character
}: UpdateCharacterActionModel & { user: Pick<UserModel, 'id'> }) => {
  checkParameterUUID(character.id);
  // Authorization check
  const { character: existingCharacter } = await getCharacterInfo(character.id, user.id);
  verifyWriteAccess({ item: existingCharacter, user });

  // Update the character in database
  const cleanedCharacter = removeNullishValues(character);
  if (cleanedCharacter === undefined) return;

  const parsedCharacterValues = updateCharacterSchema.parse(cleanedCharacter);
  const changedKeys = getChangedKeys({
    entity: existingCharacter,
    values: parsedCharacterValues,
  });

  if (changedKeys.length === 0) {
    return existingCharacter;
  }

  const preservedUpdatedAt = getPreservedUpdatedAtForExemptedKeys({
    entity: existingCharacter,
    values: parsedCharacterValues,
    exemptedKeys: ['hasLinkAccess'],
  });

  const [updatedCharacter] = await db
    .update(characterTable)
    .set({
      ...parsedCharacterValues,
      ...(preservedUpdatedAt ? { updatedAt: preservedUpdatedAt } : {}),
    })
    .where(and(eq(characterTable.id, character.id), eq(characterTable.userId, user.id)))
    .returning();

  if (updatedCharacter === undefined) {
    throw new Error('Could not update the character');
  }
  return updatedCharacter;
};

/**
 * Deletes a character and its associated picture from S3.
 * Only the owner is allowed to delete the character.
 */
export const deleteCharacter = async ({
  characterId,
  user,
}: {
  characterId: string;
  user: Pick<UserModel, 'id'>;
}) => {
  checkParameterUUID(characterId);
  // Authorization check
  const { character } = await getCharacterInfo(characterId, user.id);
  verifyWriteAccess({ item: character, user });

  const relatedFiles = await dbGetRelatedCharacterFiles(characterId);

  // delete character from db
  const deletedCharacter = await dbDeleteCharacterByIdAndUser({ characterId, user });

  // delete avatar picture from S3
  await deleteAvatarPicture(character.pictureId);

  // delete all related files linked to this character
  await deleteMessageAttachments(relatedFiles.map((file) => file.id));

  return deletedCharacter;
};

export const getActiveCharacterShareData = async ({
  characterId,
  user,
  federalState,
}: {
  characterId: string;
  user: Pick<UserModel, 'id' | 'userRole' | 'schoolIds'>;
  federalState: FederalStateModel;
}): Promise<{
  expiredAt: Date | null;
  manuallyStoppedAt: Date | null;
  tokenPointsLimit: number | null;
  budgetUsedBySharedChat: number;
  tokenLimitExceeded: boolean;
}> => {
  checkParameterUUID(characterId);
  requireTeacherRole(user.userRole);

  const { character } = await getCharacterInfo(characterId, user.id);
  verifyReadAccess({ item: character, user });

  const share = await dbGetLatestManageableCharacterShare({ characterId, user });

  if (!share) {
    return {
      expiredAt: null,
      manuallyStoppedAt: null,
      tokenPointsLimit: null,
      budgetUsedBySharedChat: 0,
      tokenLimitExceeded: false,
    };
  }

  const budgetUsedBySharedChat = await dbGetSharedCharacterChatUsageInCentByCharacterId({
    characterId,
    userId: user.id,
    expiredAt: share.expiredAt,
    startedAt: share.startedAt,
  });

  const tokenLimitExceeded = await sharedCharacterChatHasReachedTokenPointsLimit({
    user: { ...user, federalState },
    character: {
      ...character,
      tokenPointsLimit: share.tokenPointsLimit,
      expiredAt: share.expiredAt,
      startedAt: share.startedAt,
    },
  });

  return {
    expiredAt: share.expiredAt,
    manuallyStoppedAt: share.manuallyStoppedAt,
    tokenPointsLimit: share.tokenPointsLimit,
    budgetUsedBySharedChat,
    tokenLimitExceeded,
  };
};

/**
 * Checks if any recent shares exist for a character that would prevent a new share.
 * A recent share is one that is either:
 * 1. Running (not yet expired and not manually stopped)
 * 2. Expired but within the 2-hour grace window (still extendable)
 *
 * @throws Error if a share exists that prevents creating a new one
 */
const checkRecentCharacterShares = async ({
  characterId,
  user,
}: {
  characterId: string;
  user: Pick<UserModel, 'id'>;
}): Promise<void> => {
  const share = await dbGetLatestManageableCharacterShare({ characterId, user });

  if (share) {
    throw new InvalidArgumentError(
      'A share session already exists or has recently expired. Please extend the existing session instead of starting a new one.',
    );
  }
};

/**
 * A teacher can share a character with students.
 * The teacher can share his own characters or characters that are released for the school or global.
 */
export const shareCharacter = async ({
  characterId,
  user,
  tokenPointsPercentageLimit,
  usageTimeLimitMinutes,
}: {
  characterId: string;
  user: Pick<UserModel, 'id' | 'userRole' | 'schoolIds'>;
  tokenPointsPercentageLimit: number;
  usageTimeLimitMinutes: number;
}) => {
  checkParameterUUID(characterId);
  // Authorization check: user must be a teacher and owner of the character or it is global
  requireTeacherRole(user.userRole);

  const { character } = await getCharacterInfo(characterId, user.id);
  verifyReadAccess({
    item: character,
    user,
  });

  // validate input parameters
  if (tokenPointsPercentageLimit < 0 || tokenPointsPercentageLimit > 100) {
    throw new InvalidArgumentError('token points percentage limit must be between 0 and 100');
  }
  if (usageTimeLimitMinutes <= 0 || usageTimeLimitMinutes > 30 * 24 * 60) {
    throw new InvalidArgumentError('usage time limit must be between 1 and 43200 minutes');
  }

  // Check for existing active or recently-expired shares within the grace window
  await checkRecentCharacterShares({
    characterId,
    user,
  });

  const inviteCode = generateInviteCode();
  const startedAt = new Date();
  const newSharedChat = await dbCreateCharacterShare({
    user,
    characterId,
    tokenPointsLimit: tokenPointsPercentageLimit,
    maxUsageTimeLimit: usageTimeLimitMinutes,
    inviteCode,
    startedAt,
  });

  if (newSharedChat === undefined) {
    throw new Error('Could not share character chat');
  }

  return newSharedChat;
};

/**
 * A teacher can unshare a character if he was the one that started the sharing.
 */
export const unshareCharacter = async ({
  characterId,
  user,
}: {
  characterId: string;
  user: Pick<UserModel, 'id' | 'userRole'>;
}) => {
  checkParameterUUID(characterId);
  // Authorization check: user must be a teacher and owner of the sharing itself
  requireTeacherRole(user.userRole);

  const share = await dbGetLatestManageableCharacterShare({
    characterId,
    user,
  });
  if (!share) {
    throw new NotFoundError('No active sharing found for this character');
  }

  // unshare character instance by setting manuallyStoppedAt
  const updatedCharacter = await dbStopCharacterShare({ shareId: share.id });

  if (!updatedCharacter) {
    throw new Error('Could not stop sharing of character');
  }

  return updatedCharacter;
};

/**
 * Extends the expiration of an active character share.
 * @throws InvalidArgumentError if no active sharing exists for the character.
 */
export const extendCharacterShareExpiration = async ({
  characterId,
  additionalTimeInMinutes,
  user,
}: {
  characterId: string;
  additionalTimeInMinutes: number;
  user: Pick<UserModel, 'id' | 'userRole' | 'schoolIds'>;
}) => {
  checkParameterUUID(characterId);
  requireTeacherRole(user.userRole);

  const { character } = await getCharacterInfo(characterId, user.id);
  verifyReadAccess({ item: character, user });

  if (additionalTimeInMinutes <= 0 || additionalTimeInMinutes > 30 * 24 * 60) {
    throw new InvalidArgumentError('additional time must be between 1 and 43200 minutes');
  }

  const currentShare = await dbGetLatestManageableCharacterShare({ characterId, user });
  if (!currentShare) {
    throw new InvalidArgumentError('No active sharing found for this character');
  }

  const currentRemainingUsageTimeInMinutes = Math.max(
    0,
    Math.ceil((currentShare.expiredAt.getTime() - Date.now()) / 60_000),
  );

  if (
    currentRemainingUsageTimeInMinutes + additionalTimeInMinutes >
    MAX_SHARE_USAGE_TIME_LIMIT_IN_MINUTES
  ) {
    throw new InvalidArgumentError('total usage time limit must not exceed 130 days');
  }

  const updatedShare = await dbExtendSharedCharacterConversationExpiration({
    share: currentShare,
    additionalTimeInMinutes,
  });

  if (!updatedShare) {
    throw new InvalidArgumentError('No active sharing found for this character');
  }

  return updatedShare;
};

/**
 * Increases the token points limit of an active character share.
 * @throws InvalidArgumentError if no sharing exists for the character.
 * @throws InvalidArgumentError if the new limit is not higher than the current limit.
 */
export const updateCharacterShareTokenPointsLimit = async ({
  characterId,
  tokenPointsPercentageLimit,
  user,
}: {
  characterId: string;
  tokenPointsPercentageLimit: number;
  user: Pick<UserModel, 'id' | 'userRole' | 'schoolIds'>;
}) => {
  checkParameterUUID(characterId);
  requireTeacherRole(user.userRole);

  const { character } = await getCharacterInfo(characterId, user.id);
  verifyReadAccess({ item: character, user });

  if (tokenPointsPercentageLimit <= 0 || tokenPointsPercentageLimit > 100) {
    throw new InvalidArgumentError('token points percentage limit must be between 1 and 100');
  }

  const currentShare = await dbGetLatestManageableCharacterShare({ characterId, user });

  if (!currentShare) {
    throw new InvalidArgumentError('No sharing found for this character');
  }

  if (tokenPointsPercentageLimit <= currentShare.tokenPointsLimit) {
    throw new InvalidArgumentError(
      'token points percentage limit must be higher than current limit',
    );
  }

  const updatedShare = await dbUpdateCharacterShareTokenPointsLimit({
    characterId,
    user,
    tokenPointsLimit: tokenPointsPercentageLimit,
  });

  if (!updatedShare) {
    throw new InvalidArgumentError('No sharing found for this character');
  }

  return updatedShare;
};

/**
 * This function is called when a user wants to start a chat session with a character.
 * If the character is private, only the owner can start a chat session.
 * If the character is shared with the school, any user from the same school can start a chat session.
 * If the character is global, any user can start a chat session.
 *
 * Link sharing bypass: If `hasLinkAccess` is true, access checks are skipped
 * and any authenticated user can start a chat session with the character.
 *
 * @throws NotFoundError if character does not exist
 * @throws ForbiddenError if user is not authorized to access the character
 */
export const getCharacterForChatSession = async ({
  characterId,
  user,
}: {
  characterId: string;
  user: Pick<UserModel, 'id' | 'schoolIds'>;
}) => {
  checkParameterUUID(characterId);
  const character = await dbGetCharacterById({ characterId });
  if (!character) throw new NotFoundError('Character not found');
  verifyReadAccess({
    item: character,
    user,
  });

  return character;
};

export const getCharacterForExistingConversation = async ({
  characterId,
  conversationId,
  user,
}: {
  characterId: string;
  conversationId: string;
  user: Pick<UserModel, 'id' | 'schoolIds'>;
}) => {
  checkParameterUUID(characterId, conversationId);
  const character = await dbGetCharacterByIdForConversation({
    characterId,
    conversationId,
    userId: user.id,
  });
  if (!character) throw new NotFoundError('Character not found');
  verifyReadAccess({
    item: character,
    user,
  });

  return character;
};

/**
 * Loads character for edit view.
 * Throws if the user is not authorized to access the character:
 * - NotFound if the character does not exist
 * - Forbidden if the character is private and the user is not the owner
 * - Forbidden if the character is school-level and the user is not in the same school
 *
 * Link sharing bypass: If `hasLinkAccess` is true, access checks are skipped
 * and any authenticated user can view the character. Note that link sharing
 * only grants read-only access - editing is still restricted to the owner.
 */
export const getCharacterForEditView = async ({
  characterId,
  user,
  federalState,
}: {
  characterId: string;
  user: Pick<UserModel, 'id' | 'schoolIds' | 'userRole'>;
  federalState: FederalStateModel;
}): Promise<{
  character: CharacterOptionalShareDataModel;
  relatedFiles: FileModel[];
  maybeSignedPictureUrl: string | undefined;
  maxBudget: number | null;
  usedBudget: number;
  budgetUsedBySharedChat: number;
}> => {
  checkParameterUUID(characterId);
  requireTeacherRole(user.userRole);
  const character = await dbGetCharacterByIdOptionalShareData({ characterId, user });
  if (!character) throw new NotFoundError('Character not found');
  verifyReadAccess({ item: character, user });

  const relatedFiles = await fetchFileMappings({
    characterId,
    user,
  });
  const maybeSignedPictureUrl = character.pictureId
    ? await getReadOnlySignedUrl({
        key: character.pictureId,
      })
    : undefined;

  const maxBudget = await getMaxBudgetInCentByUser({
    user,
    federalState,
  });
  const usedBudget = await getUsedBudgetInCentByUser({
    user,
  });

  let budgetUsedBySharedChat = 0;
  if (character.startedAt && character.expiredAt) {
    budgetUsedBySharedChat = await dbGetSharedCharacterChatUsageInCentByCharacterId({
      characterId: character.id,
      userId: user.id,
      expiredAt: character.expiredAt,
      startedAt: character.startedAt,
    });
  }

  return {
    character,
    relatedFiles,
    maybeSignedPictureUrl,
    maxBudget,
    usedBudget,
    budgetUsedBySharedChat,
  };
};

/**
 * Returns a character with invite code and other sharing related data for sharing page.
 * The share must either be active (not yet expired) or within the grace window period
 * (expired recently enough to still be manageable/extendable).
 *
 * @throws NotFoundError if:
 *   - character does not exist
 *   - share does not exist
 *   - share has been manually stopped
 *   - share is expired beyond the grace window
 */
export const getSharedCharacter = async ({
  characterId,
  userId,
}: {
  characterId: string;
  userId: string;
}): Promise<CharacterWithShareDataModel> => {
  checkParameterUUID(characterId);
  const character = await dbGetCharacterByIdWithShareData({ characterId, user: { id: userId } });

  if (!character || character.manuallyStoppedAt !== null) {
    throw new NotFoundError('Character not found');
  }

  if (!isShareWithinGraceWindow(character.expiredAt, SHARE_EXTENSION_WINDOW_MS)) {
    throw new NotFoundError('Character not found');
  }

  return character;
};

/**
 * Returns all characters a user is allowed to see. That means:
 * - user is owner of character
 * - character is shared with users school
 * - character is global
 * - character is not deleted
 */
export async function getCharacters({
  user,
}: {
  user: Pick<UserModel, 'id' | 'schoolIds'>;
}): Promise<CharacterSelectModel[]> {
  const characters = await dbGetCharacters({ user });
  return characters;
}

/**
 * Returns the list of available characters that the user can access
 * based on userId, schools associated with the user, federalStateId and access level.
 */
export async function getCharacterByAccessLevel({
  accessLevel,
  user,
}: {
  accessLevel: AccessLevel;
  user: Pick<UserModel, 'id' | 'schoolIds' | 'federalStateId'>;
}): Promise<CharacterOptionalShareDataModel[]> {
  let characters: CharacterOptionalShareDataModel[];

  switch (accessLevel) {
    case 'community':
      characters = await dbGetCommunityCharacters({ user });
      break;
    case 'global':
      characters = await dbGetGlobalCharacters({ user });
      break;
    case 'school':
      characters = await dbGetCharactersByAssociatedSchools({ user });
      break;
    case 'private':
      characters = await dbGetCharactersByUser({ user });
      break;
    default:
      return [];
  }

  return filterReadableCustomChats({ items: characters, user });
}

export async function getCharactersByOverviewFilter({
  filter,
  user,
}: {
  filter: OverviewFilter;
  user: Pick<UserModel, 'id' | 'schoolIds' | 'federalStateId'>;
}): Promise<CharacterOptionalShareDataModel[]> {
  let characters: CharacterOptionalShareDataModel[];

  switch (filter) {
    case 'all':
      characters = await dbGetAllAccessibleCharacters({ user });
      break;
    case 'mine':
      characters = await dbGetAllCharactersByUser({ user });
      break;
    case 'official':
      characters = await dbGetGlobalCharacters({ user });
      break;
    case 'community':
      characters = await dbGetCommunityCharacters({ user });
      break;
    case 'school': {
      const [schoolCharacters, communityCharacters] = await Promise.all([
        dbGetCharactersByAssociatedSchools({ user }),
        dbGetCommunityCharacters({ user }),
      ]);
      characters = [
        ...schoolCharacters,
        ...filterCommunitySharedByAssociatedSchool({ items: communityCharacters, user }),
      ];
      break;
    }
    default:
      return [];
  }

  return filterReadableCustomChats({ items: characters, user });
}

/**
 * Loads character from db
 * @returns
 * - isOwner: whether the user is the owner
 * - isPrivate: whether the character is private
 * - the character itself
 * @throws NotFoundError if character does not exist
 */
export const getCharacterInfo = async (
  characterId: string,
  userId: string,
): Promise<{ isOwner: boolean; isPrivate: boolean; character: CharacterSelectModel }> => {
  const character = await dbGetCharacterById({ characterId });
  if (!character) throw new NotFoundError('Character not found');

  return {
    isOwner: character?.userId === userId,
    isPrivate: character?.accessLevel === 'private',
    character,
  };
};

export async function uploadAvatarPictureForCharacter({
  characterId,
  croppedImageBlob,
  user,
}: {
  characterId: string;
  croppedImageBlob: Blob;
  user: Pick<UserModel, 'id'>;
}) {
  checkParameterUUID(characterId);
  const { character } = await getCharacterInfo(characterId, user.id);
  verifyWriteAccess({ item: character, user });

  // Compute hash of the blob for cache busting
  const hash = await computeBlobHash(croppedImageBlob);
  const key = buildCharacterPictureKey(characterId, buildAvatarFilename(hash));
  const oldKey = character.pictureId;
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
  const [updatedCharacter] = await db
    .update(characterTable)
    .set({ pictureId: key })
    .where(and(eq(characterTable.id, characterId), eq(characterTable.userId, user.id)))
    .returning();

  if (!updatedCharacter) {
    throw new Error('Could not update the character');
  }

  // Delete old avatar if it exists
  if (character.pictureId) {
    try {
      await deleteFileFromS3({ key: character.pictureId });
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
 * Downloads a file for a character.
 *
 * Authorization checks:
 * - User must have read access to the character.
 * - The file must belong to the character.
 */
export async function downloadFileFromCharacter({
  characterId,
  fileId,
  user,
}: {
  characterId: string;
  fileId: string;
  user: Pick<UserModel, 'id' | 'userRole' | 'schoolIds'>;
}) {
  checkParameterUUID(characterId);
  requireTeacherRole(user.userRole);
  const { character } = await getCharacterInfo(characterId, user.id);
  if (!character) throw new NotFoundError('Character not found');
  verifyReadAccess({
    item: character,
    user,
  });

  const file = await dbGetFileForCharacter({ fileId, characterId });
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
