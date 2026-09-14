import { UserModel } from '@shared/auth/user-model';
import { db } from '@shared/db';
import {
  dbGetFileForLearningScenario,
  dbGetFilesForLearningScenario,
} from '@shared/db/functions/files';
import {
  dbCreateLearningScenarioShare,
  dbDeleteLearningScenarioByIdAndUser,
  dbExtendSharedLearningScenarioExpiration,
  dbGetAllAccessibleLearningScenarios,
  dbGetCommunityLearningScenarios,
  dbGetAllLearningScenariosByUser,
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
} from '@shared/db/functions/learning-scenario';
import {
  AccessLevel,
  accessLevelSchema,
  FileModel,
  fileTable,
  LearningScenarioFileMapping,
  LearningScenarioOptionalShareDataModel,
  LearningScenarioSelectModel,
  learningScenarioTable,
  learningScenarioUpdateSchema,
  LearningScenarioWithShareDataModel,
} from '@shared/db/schema';
import {
  checkParameterUUID,
  ForbiddenError,
  InvalidArgumentError,
  NotFoundError,
} from '@shared/error';
import {
  deleteAvatarPicture,
  deleteMessageAttachments,
  getAvatarPictureUrl,
} from '@shared/files/fileService';
import { buildLearningScenarioPictureKey } from '@shared/utils/picture-key';
import { deleteFileFromS3, getReadOnlySignedUrl, uploadFileToS3 } from '@shared/s3';
import { ONE_HOUR } from '@shared/s3/const';
import { and, eq } from 'drizzle-orm';
import { OverviewFilter } from '@shared/overview-filter';
import z from 'zod';
import { duplicateLearningScenario } from '@shared/learning-scenarios/learning-scenario-admin-service';
import {
  requireTeacherRole,
  verifySuspensionState,
  verifyReadAccess,
  verifyWriteAccess,
  filterCommunitySharedByAssociatedSchool,
  filterReadableCustomChats,
} from '@shared/auth/authorization-service';
import { computeBlobHash } from '@ais-chat/shared-core/crypto/blob-hash';
import { generateInviteCode } from '@shared/sharing/generate-invite-code';
import {
  MAX_SHARE_USAGE_TIME_LIMIT_IN_MINUTES,
  SHARE_EXTENSION_WINDOW_MS,
} from '@shared/sharing/const';
import {
  getChangedKeys,
  getPreservedUpdatedAtForExemptedKeys,
} from '@shared/utils/preserve-updated-at';
import {
  getMaxBudgetInCentByUser,
  getUsedBudgetInCentByUser,
} from '@shared/users/user-budget-service';
import { sharedLearningScenarioChatHasReachedTokenPointsLimit } from '@shared/users/usage';
import { FederalStateModel } from '@shared/federal-states/types';
import { dbGetLearningScenarioChatUsageInCentByLearningScenarioId } from '@shared/db/functions/token-points';
import { isShareWithinGraceWindow } from '@shared/sharing/is-share-within-grace-window';

export type LearningScenarioWithImage = LearningScenarioOptionalShareDataModel & {
  maybeSignedPictureUrl: string | undefined;
};

function buildAvatarFilename(hash: string) {
  return `avatar_${hash}`;
}

/**
 * Returns all learning scenarios a user can access.
 */
export async function getLearningScenariosForUser({
  user,
}: {
  user: Pick<UserModel, 'id'>;
}): Promise<LearningScenarioWithImage[]> {
  const learningScenarios = await dbGetLearningScenariosByUser({ user });
  // This is part of the old logic, keep it for now
  // If a new learning scenario is created, it has an empty name.
  const filteredScenarios = learningScenarios.filter((c) => c.name !== '');
  const enrichedScenarios = await enrichLearningScenarioWithPictureUrl({
    learningScenarios: filteredScenarios,
  });
  return enrichedScenarios;
}

/**
 * Returns the list of available learning scenarios that the user can access
 * based on userId, schools associated with the user, federalStateId, and access level.
 */
export async function getLearningScenariosByAccessLevel({
  accessLevel,
  user,
}: {
  accessLevel: AccessLevel;
  user: Pick<UserModel, 'id' | 'schoolIds' | 'federalStateId'>;
}): Promise<LearningScenarioOptionalShareDataModel[]> {
  let learningScenarios: LearningScenarioOptionalShareDataModel[];

  switch (accessLevel) {
    case 'community':
      learningScenarios = await dbGetCommunityLearningScenarios({ user });
      break;
    case 'global':
      learningScenarios = await dbGetGlobalLearningScenarios({ user });
      break;
    case 'school':
      learningScenarios = await dbGetLearningScenariosByAssociatedSchools({ user });
      break;
    case 'private':
      learningScenarios = await dbGetLearningScenariosByUser({ user });
      break;
    default:
      return [];
  }

  return filterReadableCustomChats({ items: learningScenarios, user });
}

export async function getLearningScenariosByOverviewFilter({
  filter,
  user,
}: {
  filter: OverviewFilter;
  user: Pick<UserModel, 'id' | 'schoolIds' | 'federalStateId'>;
}): Promise<LearningScenarioOptionalShareDataModel[]> {
  let learningScenarios: LearningScenarioOptionalShareDataModel[];

  switch (filter) {
    case 'all':
      learningScenarios = await dbGetAllAccessibleLearningScenarios({
        user,
      });
      break;
    case 'mine':
      learningScenarios = await dbGetAllLearningScenariosByUser({ user });
      break;
    case 'official':
      learningScenarios = await dbGetGlobalLearningScenarios({ user });
      break;
    case 'community':
      learningScenarios = await dbGetCommunityLearningScenarios({ user });
      break;
    case 'school': {
      const [schoolLearningScenarios, communityLearningScenarios] = await Promise.all([
        dbGetLearningScenariosByAssociatedSchools({ user }),
        dbGetCommunityLearningScenarios({ user }),
      ]);
      learningScenarios = [
        ...schoolLearningScenarios,
        ...filterCommunitySharedByAssociatedSchool({ items: communityLearningScenarios, user }),
      ];
      break;
    }
    default:
      return [];
  }

  return filterReadableCustomChats({ items: learningScenarios, user });
}

/**
 * Loads a learning scenario from db
 * @returns
 * - isOwner: whether the user is the owner
 * - isPrivate: whether the learning scenario is private
 * - the learning scenario itself
 * @throws NotFoundError if learning scenario does not exist
 */
async function getLearningScenarioInfo(
  learningScenarioId: string,
  user: Pick<UserModel, 'id'>,
): Promise<{
  isOwner: boolean;
  isPrivate: boolean;
  learningScenario: LearningScenarioSelectModel;
}> {
  const learningScenario = await dbGetLearningScenarioById({ learningScenarioId });
  if (!learningScenario) throw new NotFoundError('Learning scenario not found');

  return {
    isOwner: learningScenario.userId === user.id,
    isPrivate: learningScenario.accessLevel === 'private',
    learningScenario,
  };
}

/**
 * Returns a learning scenario with invite code and other sharing related data for sharing page.
 * The share must either be active (not yet expired) or within the grace window period
 * (expired recently enough to still be manageable/extendable).
 *
 * @throws NotFoundError if:
 *   - learning scenario does not exist
 *   - share does not exist
 *   - share has been manually stopped
 *   - share is expired beyond the grace window
 */
export async function getSharedLearningScenario({
  learningScenarioId,
  user,
}: {
  learningScenarioId: string;
  user: Pick<UserModel, 'id'>;
}): Promise<LearningScenarioWithShareDataModel> {
  checkParameterUUID(learningScenarioId);
  const learningScenario = await dbGetLearningScenarioByIdWithShareData({
    learningScenarioId,
    user,
  });
  if (!learningScenario || learningScenario.manuallyStoppedAt !== null) {
    throw new NotFoundError('Learning scenario not found');
  }

  if (!isShareWithinGraceWindow(learningScenario.expiredAt, SHARE_EXTENSION_WINDOW_MS)) {
    throw new NotFoundError('Learning scenario not found');
  }

  return learningScenario;
}

/**
 * Schema for updating character details that are allowed to be changed by the user.
 */
const updateLearningScenarioSchema = learningScenarioUpdateSchema.omit({
  accessLevel: true,
  isDeleted: true,
  originalLearningScenarioId: true,
  pictureId: true,
});
export type UpdateLearningScenarioActionModel = z.infer<typeof updateLearningScenarioSchema>;

/**
 * User updates a learning scenario.
 * @throws ZodError if the data is invalid.
 * @throws ForbiddenError if the user is not the owner of the learning scenario.
 */
export async function updateLearningScenario({
  learningScenarioId,
  user,
  data,
}: {
  learningScenarioId: string;
  user: Pick<UserModel, 'id' | 'userRole'>;
  data: LearningScenarioSelectModel;
}) {
  checkParameterUUID(learningScenarioId);
  requireTeacherRole(user.userRole);
  const { learningScenario } = await getLearningScenarioInfo(learningScenarioId, user);
  verifyWriteAccess({ item: learningScenario, user });

  const parsedData = updateLearningScenarioSchema.parse(data);
  const changedKeys = getChangedKeys({
    entity: learningScenario,
    values: parsedData,
  });

  if (changedKeys.length === 0) {
    return learningScenario;
  }

  const preservedUpdatedAt = getPreservedUpdatedAtForExemptedKeys({
    entity: learningScenario,
    values: parsedData,
    exemptedKeys: ['hasLinkAccess'],
  });

  const [updatedLearningScenario] = await db
    .update(learningScenarioTable)
    .set({ ...parsedData, ...(preservedUpdatedAt ? { updatedAt: preservedUpdatedAt } : {}) })
    .where(eq(learningScenarioTable.id, learningScenarioId))
    .returning();

  if (!updatedLearningScenario) {
    throw new Error('Could not update learning scenario');
  }

  return updatedLearningScenario;
}

/**
 * User can share a learning scenario he owns with the school or community
 * or unshare it (access level = private).
 * User is not allowed to set the access level to global.
 */
export async function updateLearningScenarioAccessLevel({
  learningScenarioId,
  accessLevel,
  user,
}: {
  learningScenarioId: string;
  accessLevel: AccessLevel;
  user: Pick<UserModel, 'id' | 'userRole'>;
}) {
  checkParameterUUID(learningScenarioId);
  accessLevelSchema.parse(accessLevel);

  if (accessLevel === 'global') {
    throw new ForbiddenError('Not authorized to set the access level to global');
  }

  requireTeacherRole(user.userRole);
  const { learningScenario } = await getLearningScenarioInfo(learningScenarioId, user);
  verifyWriteAccess({ item: learningScenario, user });
  verifySuspensionState({ item: learningScenario });

  if (learningScenario.accessLevel === accessLevel) {
    return learningScenario;
  }

  const preservedUpdatedAt = getPreservedUpdatedAtForExemptedKeys({
    entity: learningScenario,
    values: { accessLevel },
    exemptedKeys: ['accessLevel'],
  });

  // Update the access level in database
  const [updatedLearningScenario] = await db
    .update(learningScenarioTable)
    .set({ accessLevel, ...(preservedUpdatedAt ? { updatedAt: preservedUpdatedAt } : {}) })
    .where(eq(learningScenarioTable.id, learningScenarioId))
    .returning();

  if (updatedLearningScenario === undefined) {
    throw new Error('Could not update the access level of the learning scenario');
  }

  return updatedLearningScenario;
}

export const learningScenarioShareValuesSchema = z.object({
  tokenPointsPercentageLimit: z.number().min(1).max(100),
  usageTimeLimit: z
    .number()
    .min(30)
    .max(30 * 24 * 60),
});
export type LearningScenarioShareValues = z.infer<typeof learningScenarioShareValuesSchema>;

export async function getActiveLearningScenarioShareData({
  learningScenarioId,
  user,
  federalState,
}: {
  learningScenarioId: string;
  user: Pick<UserModel, 'id' | 'userRole' | 'schoolIds'>;
  federalState: FederalStateModel;
}): Promise<{
  expiredAt: Date | null;
  manuallyStoppedAt: Date | null;
  tokenPointsLimit: number | null;
  budgetUsedBySharedChat: number;
  tokenLimitExceeded: boolean;
}> {
  checkParameterUUID(learningScenarioId);
  requireTeacherRole(user.userRole);

  const { learningScenario } = await getLearningScenarioInfo(learningScenarioId, user);
  verifyReadAccess({ item: learningScenario, user });

  const share = await dbGetLatestManageableLearningScenarioShare({ learningScenarioId, user });

  if (!share) {
    return {
      expiredAt: null,
      manuallyStoppedAt: null,
      tokenPointsLimit: null,
      budgetUsedBySharedChat: 0,
      tokenLimitExceeded: false,
    };
  }

  const budgetUsedBySharedChat = await dbGetLearningScenarioChatUsageInCentByLearningScenarioId({
    learningScenarioId,
    userId: user.id,
    expiredAt: share.expiredAt,
    startedAt: share.startedAt,
  });

  const tokenLimitExceeded = await sharedLearningScenarioChatHasReachedTokenPointsLimit({
    user: { ...user, federalState },
    learningScenario: {
      ...learningScenario,
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
}

/**
 * Checks if any recent shares exist for a learning scenario that would prevent a new share.
 * A recent share is one that is either:
 * 1. Running (not yet expired and not manually stopped)
 * 2. Expired but within the 2-hour grace window (still extendable)
 *
 * @throws Error if a share exists that prevents creating a new one
 */
async function checkRecentLearningScenarioShares({
  learningScenarioId,
  user,
}: {
  learningScenarioId: string;
  user: Pick<UserModel, 'id'>;
}): Promise<void> {
  const share = await dbGetLatestManageableLearningScenarioShare({
    learningScenarioId,
    user,
  });

  if (share) {
    throw new InvalidArgumentError(
      'A share session already exists or has recently expired. Please extend the existing session instead of starting a new one.',
    );
  }
}

/**
 * Starts sharing of a learning scenario.
 * @throws NotFoundError if the learning scenario does not exist.
 * @throws ForbiddenError if the user is not the owner of the learning scenario.
 */
export async function shareLearningScenario({
  learningScenarioId,
  data,
  user,
}: {
  learningScenarioId: string;
  data: LearningScenarioShareValues;
  user: Pick<UserModel, 'id' | 'userRole' | 'schoolIds'>;
}) {
  checkParameterUUID(learningScenarioId);
  // Authorization check: user must be a teacher and must have access to the learning scenario
  requireTeacherRole(user.userRole);

  const { learningScenario } = await getLearningScenarioInfo(learningScenarioId, user);
  verifyReadAccess({
    item: learningScenario,
    user,
  });

  const parsedValues = learningScenarioShareValuesSchema.parse(data);

  // Check for existing active or recently-expired shares within the grace window
  await checkRecentLearningScenarioShares({
    learningScenarioId,
    user,
  });

  const inviteCode = generateInviteCode();
  const startedAt = new Date();

  const sharedLearningScenario = await dbCreateLearningScenarioShare({
    user,
    learningScenarioId,
    inviteCode,
    startedAt,
    tokenPointsLimit: parsedValues.tokenPointsPercentageLimit,
    maxUsageTimeLimit: parsedValues.usageTimeLimit,
  });

  if (!sharedLearningScenario) {
    throw new Error('Could not share learning scenario');
  }

  return sharedLearningScenario;
}

/**
 * Unshares a learning scenario.
 * @throws NotFoundError if the learning scenario does not exist.
 * @throws ForbiddenError if the user is not the owner of the learning scenario.
 */
export async function unshareLearningScenario({
  learningScenarioId,
  user,
}: {
  learningScenarioId: string;
  user: Pick<UserModel, 'id' | 'userRole'>;
}) {
  checkParameterUUID(learningScenarioId);
  // Authorization check: user must be a teacher and owner of the sharing itself
  requireTeacherRole(user.userRole);

  const share = await dbGetLatestManageableLearningScenarioShare({
    learningScenarioId,
    user,
  });
  if (!share) {
    throw new NotFoundError('No active sharing found for this learning scenario');
  }

  const updatedShare = await dbStopLearningScenarioShare({ shareId: share.id });

  if (!updatedShare) {
    throw new Error('Could not unshare learning scenario');
  }

  return updatedShare;
}

/**
 * Extends the expiration of an active learning scenario share.
 * @throws InvalidArgumentError if no active sharing exists for the learning scenario.
 */
export async function extendLearningScenarioShareExpiration({
  learningScenarioId,
  additionalTimeInMinutes,
  user,
}: {
  learningScenarioId: string;
  additionalTimeInMinutes: number;
  user: Pick<UserModel, 'id' | 'userRole' | 'schoolIds'>;
}) {
  checkParameterUUID(learningScenarioId);
  requireTeacherRole(user.userRole);

  const { learningScenario } = await getLearningScenarioInfo(learningScenarioId, user);
  verifyReadAccess({ item: learningScenario, user });

  if (additionalTimeInMinutes <= 0 || additionalTimeInMinutes > 30 * 24 * 60) {
    throw new InvalidArgumentError('additional time must be between 1 and 43200 minutes');
  }

  const currentShare = await dbGetLatestManageableLearningScenarioShare({
    learningScenarioId,
    user,
  });
  if (!currentShare) {
    throw new InvalidArgumentError('No active sharing found for this learning scenario');
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

  const updatedShare = await dbExtendSharedLearningScenarioExpiration({
    learningScenarioId,
    user,
    additionalTimeInMinutes,
  });

  if (!updatedShare) {
    throw new InvalidArgumentError('No active sharing found for this learning scenario');
  }

  return updatedShare;
}

/**
 * Increases the token points limit of an active learning scenario share.
 * @throws InvalidArgumentError if no sharing exists for the learning scenario.
 * @throws InvalidArgumentError if the new limit is not higher than the current limit.
 */
export async function updateLearningScenarioShareTokenPointsLimit({
  learningScenarioId,
  tokenPointsPercentageLimit,
  user,
}: {
  learningScenarioId: string;
  tokenPointsPercentageLimit: number;
  user: Pick<UserModel, 'id' | 'userRole' | 'schoolIds'>;
}) {
  checkParameterUUID(learningScenarioId);
  requireTeacherRole(user.userRole);

  const { learningScenario } = await getLearningScenarioInfo(learningScenarioId, user);
  verifyReadAccess({ item: learningScenario, user });

  if (tokenPointsPercentageLimit <= 0 || tokenPointsPercentageLimit > 100) {
    throw new InvalidArgumentError('token points percentage limit must be between 1 and 100');
  }

  const currentShare = await dbGetLatestManageableLearningScenarioShare({
    learningScenarioId,
    user,
  });

  if (!currentShare) {
    throw new InvalidArgumentError('No sharing found for this learning scenario');
  }

  if (tokenPointsPercentageLimit <= currentShare.tokenPointsLimit) {
    throw new InvalidArgumentError(
      'token points percentage limit must be higher than current limit',
    );
  }

  const updatedShare = await dbUpdateLearningScenarioShareTokenPointsLimit({
    learningScenarioId,
    user,
    tokenPointsLimit: tokenPointsPercentageLimit,
  });

  if (!updatedShare) {
    throw new InvalidArgumentError('No sharing found for this learning scenario');
  }

  return updatedShare;
}

/**
 * Loads learning scenario for editing / viewing.
 * Throws if the user is not authorized to access the learning scenario:
 * - NotFound if the learning scenario does not exist
 * - Forbidden if the learning scenario is private and the user is not the owner
 * - Forbidden if the learning scenario is school-level and the user is not in the same school
 *
 * Link sharing bypass: If `hasLinkAccess` is true, access checks are skipped
 * and any authenticated user can view the learning scenario. Note that link sharing
 * only grants read-only access - editing is still restricted to the owner.
 */
export async function getLearningScenarioForEditView({
  learningScenarioId,
  user,
  federalState,
}: {
  learningScenarioId: string;
  user: Pick<UserModel, 'id' | 'userRole' | 'schoolIds'>;
  federalState: FederalStateModel;
}): Promise<{
  learningScenario: LearningScenarioOptionalShareDataModel;
  relatedFiles: FileModel[];
  avatarPictureUrl: string | undefined;
  maxBudget: number | null;
  usedBudget: number;
  budgetUsedBySharedChat: number;
}> {
  checkParameterUUID(learningScenarioId);
  requireTeacherRole(user.userRole);
  const learningScenario = await dbGetLearningScenarioByIdOptionalShareData({
    learningScenarioId,
    user,
  });
  if (!learningScenario) throw new NotFoundError('Learning scenario not found');

  verifyReadAccess({ item: learningScenario, user });

  const relatedFiles = await getFilesForLearningScenario({
    learningScenarioId,
    user,
  });
  const avatarPictureUrl = await getAvatarPictureUrl(learningScenario.pictureId);

  const maxBudget = await getMaxBudgetInCentByUser({
    user,
    federalState,
  });
  const usedBudget = await getUsedBudgetInCentByUser({
    user,
  });

  let budgetUsedBySharedChat = 0;
  if (learningScenario.startedAt && learningScenario.expiredAt) {
    budgetUsedBySharedChat = await dbGetLearningScenarioChatUsageInCentByLearningScenarioId({
      learningScenarioId: learningScenario.id,
      userId: user.id,
      expiredAt: learningScenario.expiredAt,
      startedAt: learningScenario.startedAt,
    });
  }

  return {
    learningScenario,
    relatedFiles,
    avatarPictureUrl,
    maxBudget,
    usedBudget,
    budgetUsedBySharedChat,
  };
}

/**
 * This function is called when a user wants to start a chat session with a learning scenario.
 * Access rules are the same as for read access in the overview/view pages.
 *
 * @throws NotFoundError if learning scenario does not exist
 * @throws ForbiddenError if user is not authorized to access the learning scenario
 */
export async function getLearningScenarioForChatSession({
  learningScenarioId,
  user,
}: {
  learningScenarioId: string;
  user: Pick<UserModel, 'id' | 'schoolIds'>;
}) {
  checkParameterUUID(learningScenarioId);
  const learningScenario = await dbGetLearningScenarioById({ learningScenarioId });
  if (!learningScenario) throw new NotFoundError('Learning scenario not found');
  verifyReadAccess({ item: learningScenario, user });

  return learningScenario;
}

export async function getLearningScenarioForExistingConversation({
  learningScenarioId,
  conversationId,
  user,
}: {
  learningScenarioId: string;
  conversationId: string;
  user: Pick<UserModel, 'id' | 'schoolIds'>;
}) {
  checkParameterUUID(learningScenarioId, conversationId);
  const learningScenario = await dbGetLearningScenarioByIdForConversation({
    learningScenarioId,
    conversationId,
    userId: user.id,
  });
  if (!learningScenario) throw new NotFoundError('Learning scenario not found');
  verifyReadAccess({ item: learningScenario, user });

  return learningScenario;
}

/**
 * Get files linked to a learning scenario.
 *
 * If the learning scenario is private, only the owner can fetch file mappings.
 * If the learning scenario is shared with a school, any teacher in that school can fetch file mappings.
 * If the learning scenario is global, any teacher can fetch those file mappings.
 *
 * Link sharing bypass: If `hasLinkAccess` is true, access checks are skipped
 * and any authenticated user can access the file mappings.
 */
export async function getFilesForLearningScenario({
  learningScenarioId,
  user,
}: {
  learningScenarioId: string;
  user: Pick<UserModel, 'id' | 'userRole' | 'schoolIds'>;
}): Promise<FileModel[]> {
  checkParameterUUID(learningScenarioId);
  requireTeacherRole(user.userRole);
  const { learningScenario } = await getLearningScenarioInfo(learningScenarioId, user);
  verifyReadAccess({
    item: learningScenario,
    user,
  });

  return dbGetFilesForLearningScenario(learningScenarioId);
}

/**
 * User creates a new, empty learning scenario.
 */
export async function createNewLearningScenario({
  modelId,
  user,
}: {
  modelId: string;
  user: Pick<UserModel, 'id' | 'userRole'>;
}) {
  requireTeacherRole(user.userRole);

  const [insertedLearningScenario] = await db
    .insert(learningScenarioTable)
    .values({
      name: '',
      pictureId: '',
      modelId,
      userId: user.id,
    })
    .returning();

  if (!insertedLearningScenario) {
    throw new Error('Could not create learning scenario');
  }

  return insertedLearningScenario;
}

/**
 * Deletes a learning scenario if the user is the owner.
 * @throws NotFoundError if the learning scenario does not exist or the user is not the owner.
 * Also deletes all related files and the avatar picture from S3.
 */
export async function deleteLearningScenario({
  learningScenarioId,
  user,
}: {
  learningScenarioId: string;
  user: Pick<UserModel, 'id' | 'userRole'>;
}) {
  checkParameterUUID(learningScenarioId);
  requireTeacherRole(user.userRole);
  const { learningScenario } = await getLearningScenarioInfo(learningScenarioId, user);
  verifyWriteAccess({ item: learningScenario, user });

  const relatedFiles = await dbGetFilesForLearningScenario(learningScenarioId);

  // delete learning scenario from db
  const deletedLearningScenario = await dbDeleteLearningScenarioByIdAndUser({
    learningScenarioId,
    user,
  });

  // delete avatar picture from S3
  await deleteAvatarPicture(learningScenario.pictureId);

  // delete all related files from s3
  await deleteMessageAttachments(relatedFiles.map((file) => file.id));

  return deletedLearningScenario;
}

/**
 * Links a file to a learning scenario.
 * @throws NotFoundError if the learning scenario does not exist or the user is not the owner.
 */
export async function linkFileToLearningScenario({
  fileId,
  learningScenarioId,
  user,
}: {
  fileId: string;
  learningScenarioId: string;
  user: Pick<UserModel, 'id' | 'userRole'>;
}) {
  checkParameterUUID(learningScenarioId);
  requireTeacherRole(user.userRole);
  const { learningScenario } = await getLearningScenarioInfo(learningScenarioId, user);
  verifyWriteAccess({ item: learningScenario, user });

  const [insertedFileMapping] = await db
    .insert(LearningScenarioFileMapping)
    .values({ learningScenarioId: learningScenarioId, fileId: fileId })
    .returning();
  if (insertedFileMapping === undefined) {
    throw new Error('Could not link file to learning scenario');
  }
}

/**
 * Removes a file from a learning scenario.
 * Also deletes the actual file from S3.
 *
 * @throws NotFoundError if the learning scenario does not exist.
 * @throws ForbiddenError if the user is not the owner of the learning scenario.
 */
export async function removeFileFromLearningScenario({
  learningScenarioId,
  fileId,
  user,
}: {
  learningScenarioId: string;
  fileId: string;
  user: Pick<UserModel, 'id' | 'userRole'>;
}) {
  checkParameterUUID(learningScenarioId);
  requireTeacherRole(user.userRole);
  const { learningScenario } = await getLearningScenarioInfo(learningScenarioId, user);
  verifyWriteAccess({ item: learningScenario, user });

  // delete mapping and file entry in db
  await db.transaction(async (tx) => {
    await tx
      .delete(LearningScenarioFileMapping)
      .where(
        and(
          eq(LearningScenarioFileMapping.learningScenarioId, learningScenarioId),
          eq(LearningScenarioFileMapping.fileId, fileId),
        ),
      );
    await tx.delete(fileTable).where(eq(fileTable.id, fileId));
  });

  // Delete the file from S3
  await deleteMessageAttachments([fileId]);
}

export async function enrichLearningScenarioWithPictureUrl({
  learningScenarios,
}: {
  learningScenarios: LearningScenarioOptionalShareDataModel[];
}): Promise<LearningScenarioWithImage[]> {
  return await Promise.all(
    learningScenarios.map(async (scenario) => ({
      ...scenario,
      maybeSignedPictureUrl: await getAvatarPictureUrl(scenario.pictureId),
    })),
  );
}

export async function uploadAvatarPictureForLearningScenario({
  learningScenarioId,
  croppedImageBlob,
  user,
}: {
  learningScenarioId: string;
  croppedImageBlob: Blob;
  user: Pick<UserModel, 'id' | 'userRole'>;
}) {
  checkParameterUUID(learningScenarioId);
  requireTeacherRole(user.userRole);
  const { learningScenario } = await getLearningScenarioInfo(learningScenarioId, user);
  verifyWriteAccess({ item: learningScenario, user });

  // Compute hash of the blob for cache busting
  const hash = await computeBlobHash(croppedImageBlob);
  const key = buildLearningScenarioPictureKey(learningScenarioId, buildAvatarFilename(hash));
  const oldKey = learningScenario.pictureId;
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
  const [updatedLearningScenario] = await db
    .update(learningScenarioTable)
    .set({ pictureId: key })
    .where(eq(learningScenarioTable.id, learningScenarioId))
    .returning();

  if (!updatedLearningScenario) {
    throw new Error('Could not update learning scenario');
  }

  // Delete old avatar if it exists
  if (learningScenario.pictureId) {
    try {
      await deleteFileFromS3({ key: learningScenario.pictureId });
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
 * User creates a new learning scenario from a template.
 * All files are duplicated and linked to the new learning scenario.
 *
 * Authorization checks:
 * - User must be a teacher.
 * - User must have access to the template.
 *
 * @returns the newly created learning scenario
 */
export async function createNewLearningScenarioFromTemplate({
  user,
  originalLearningScenarioId,
  duplicateLearningScenarioName,
}: {
  originalLearningScenarioId: string;

  user: Pick<UserModel, 'id' | 'userRole' | 'schoolIds'>;
  duplicateLearningScenarioName?: string;
}) {
  checkParameterUUID(originalLearningScenarioId);
  requireTeacherRole(user.userRole);
  const { learningScenario } = await getLearningScenarioInfo(originalLearningScenarioId, user);
  verifyReadAccess({
    item: learningScenario,
    user,
  });
  verifySuspensionState({
    item: learningScenario,
  });

  return duplicateLearningScenario({
    accessLevel: 'private',
    originalLearningScenarioId,
    user,
    duplicateLearningScenarioName,
  });
}

/**
 * Downloads a file for a learning scenario.
 *
 * Authorization checks:
 * - User must have read access to the learning scenario.
 * - The file must belong to the learning scenario.
 */
export async function downloadFileFromLearningScenario({
  learningScenarioId,
  fileId,
  user,
}: {
  learningScenarioId: string;
  fileId: string;
  user: Pick<UserModel, 'id' | 'userRole' | 'schoolIds'>;
}) {
  checkParameterUUID(learningScenarioId);
  requireTeacherRole(user.userRole);
  const { learningScenario } = await getLearningScenarioInfo(learningScenarioId, user);
  verifyReadAccess({
    item: learningScenario,
    user,
  });

  const file = await dbGetFileForLearningScenario({ fileId, learningScenarioId });
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
