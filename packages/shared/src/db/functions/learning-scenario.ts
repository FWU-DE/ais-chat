import { UserModel } from '@shared/auth/user-model';
import { NotFoundError } from '@shared/error';
import { SHARE_EXTENSION_WINDOW_MS } from '@shared/sharing/const';
import {
  and,
  arrayOverlaps,
  desc,
  eq,
  getTableColumns,
  gte,
  inArray,
  isNull,
  or,
  sql,
} from 'drizzle-orm';

import { db } from '..';
import {
  conversationTable,
  FilterGroup,
  LearningScenarioFileMapping,
  LearningScenarioOptionalShareDataModel,
  LearningScenarioSelectModel,
  learningScenarioTable,
  learningScenarioTemplateMappingTable,
  LearningScenarioWithShareDataModel,
  sharedLearningScenarioTable,
  sharedLearningScenarioUsageTracking,
  SharedLearningScenarioUsageTrackingInsertModel,
  userFavoriteTable,
  userTable,
} from '../schema';
import { PgTransactionObject } from '../types';
import { dbDeleteFileIfUnreferenced } from './files';
import { sanitizeCostsInCent } from './token-usage';

type IncludeDeletedOption = {
  includeDeleted?: boolean;
};

function excludeDeletedLearningScenarios(options?: IncludeDeletedOption) {
  return options?.includeDeleted ? undefined : eq(learningScenarioTable.isDeleted, false);
}

type ShareScope = 'active' | 'manageable';

/**
 * - `active`: the share is still running (`expired_at >= now`).
 * - `manageable`: the share is running or expired within the grace window
 *   (`SHARE_EXTENSION_WINDOW_MS`), so it can still be extended or adjusted.
 */
function shareScopeCondition(scope: ShareScope) {
  return scope === 'active'
    ? sql`${sharedLearningScenarioTable.expiredAt} >= now()`
    : gte(sharedLearningScenarioTable.expiredAt, new Date(Date.now() - SHARE_EXTENSION_WINDOW_MS));
}

/**
 * Returns a subquery that selects the single latest share per learning scenario for a given user
 * that is not manually stopped and matches the given scope.
 *
 * `DISTINCT ON (learning_scenario_id) ORDER BY started_at DESC` ensures only the most-recent row
 * is returned, preventing duplicate entity rows in JOINs.
 */
function latestLearningScenarioShare(user: Pick<UserModel, 'id'>, scope: ShareScope) {
  return db
    .selectDistinctOn([sharedLearningScenarioTable.learningScenarioId], {
      ...getTableColumns(sharedLearningScenarioTable),
    })
    .from(sharedLearningScenarioTable)
    .where(
      and(
        eq(sharedLearningScenarioTable.userId, user.id),
        isNull(sharedLearningScenarioTable.manuallyStoppedAt),
        shareScopeCondition(scope),
      ),
    )
    .orderBy(
      sharedLearningScenarioTable.learningScenarioId,
      desc(sharedLearningScenarioTable.startedAt),
    )
    .as('latest_share');
}

function baseLearningScenarioQuery() {
  return db
    .select({
      ...getTableColumns(learningScenarioTable),
      ownerSchoolIds: userTable.schoolIds,
    })
    .from(learningScenarioTable)
    .innerJoin(userTable, eq(learningScenarioTable.userId, userTable.id));
}

function baseLearningScenarioWithShareQuery(share: ReturnType<typeof latestLearningScenarioShare>) {
  return db
    .select({
      ...getTableColumns(learningScenarioTable),
      tokenPointsLimit: share.tokenPointsLimit,
      inviteCode: share.inviteCode,
      maxUsageTimeLimit: share.maxUsageTimeLimit,
      startedAt: share.startedAt,
      expiredAt: share.expiredAt,
      manuallyStoppedAt: share.manuallyStoppedAt,
      startedBy: share.userId,
      ownerSchoolIds: userTable.schoolIds,
    })
    .from(learningScenarioTable)
    .innerJoin(userTable, eq(learningScenarioTable.userId, userTable.id));
}

export function dbGetGlobalLearningScenarios({
  user,
  includeDeleted,
}: {
  user: Pick<UserModel, 'id' | 'federalStateId'>;
} & IncludeDeletedOption): Promise<LearningScenarioOptionalShareDataModel[]> {
  const activeShare = latestLearningScenarioShare(user, 'active');
  return baseLearningScenarioWithShareQuery(activeShare)
    .leftJoin(activeShare, eq(activeShare.learningScenarioId, learningScenarioTable.id))
    .leftJoin(
      learningScenarioTemplateMappingTable,
      eq(learningScenarioTemplateMappingTable.learningScenarioId, learningScenarioTable.id),
    )
    .where(
      and(
        eq(learningScenarioTable.isGlobal, true),
        user.federalStateId
          ? eq(learningScenarioTemplateMappingTable.federalStateId, user.federalStateId)
          : undefined,
        excludeDeletedLearningScenarios({ includeDeleted }),
      ),
    )
    .orderBy(desc(learningScenarioTable.createdAt));
}

/**
 * Retrieves all learning scenarios shared at the school level that are accessible to a user.
 *
 * This includes learning scenarios from other users who share at least one school with the requesting user.
 * This includes usage data from the sharedLearningScenarioTable table.
 *
 * @param params.userId - The unique identifier of the user requesting the learning scenarios
 * @returns A promise that resolves to an array of learning scenario models with associated sharing metadata
 */
export async function dbGetLearningScenariosByAssociatedSchools({
  user,
  includeDeleted,
}: {
  user: Pick<UserModel, 'id' | 'schoolIds'>;
} & IncludeDeletedOption): Promise<LearningScenarioOptionalShareDataModel[]> {
  // Get all users who share at least one school with the requesting user
  if (user.schoolIds.length === 0) {
    return [];
  }

  const activeShare = latestLearningScenarioShare(user, 'active');
  return baseLearningScenarioWithShareQuery(activeShare)
    .leftJoin(activeShare, eq(activeShare.learningScenarioId, learningScenarioTable.id))
    .where(
      and(
        eq(learningScenarioTable.isSchoolShared, true),
        arrayOverlaps(userTable.schoolIds, user.schoolIds),
        excludeDeletedLearningScenarios({ includeDeleted }),
      ),
    )
    .orderBy(desc(learningScenarioTable.createdAt));
}

export async function dbGetCommunityLearningScenarios({
  user,
  includeDeleted,
}: {
  user: Pick<UserModel, 'id'>;
} & IncludeDeletedOption): Promise<LearningScenarioOptionalShareDataModel[]> {
  const activeShare = latestLearningScenarioShare(user, 'active');
  return baseLearningScenarioWithShareQuery(activeShare)
    .leftJoin(activeShare, eq(activeShare.learningScenarioId, learningScenarioTable.id))
    .where(
      and(
        eq(learningScenarioTable.isCommunityShared, true),
        excludeDeletedLearningScenarios({ includeDeleted }),
      ),
    )
    .orderBy(desc(learningScenarioTable.createdAt));
}

export async function dbGetLearningScenariosByUser({
  user,
  includeDeleted,
}: {
  user: Pick<UserModel, 'id'>;
} & IncludeDeletedOption): Promise<LearningScenarioOptionalShareDataModel[]> {
  const activeShare = latestLearningScenarioShare(user, 'active');
  return baseLearningScenarioWithShareQuery(activeShare)
    .leftJoin(activeShare, eq(activeShare.learningScenarioId, learningScenarioTable.id))
    .where(
      and(
        eq(learningScenarioTable.userId, user.id),
        eq(learningScenarioTable.isSchoolShared, false),
        eq(learningScenarioTable.isCommunityShared, false),
        eq(learningScenarioTable.isGlobal, false),
        excludeDeletedLearningScenarios({ includeDeleted }),
      ),
    )
    .orderBy(desc(learningScenarioTable.createdAt));
}

/**
 * Returns all learning scenarios created by the user regardless of access level
 * (private, school, or global).
 *
 * Contrast with {@link dbGetLearningScenariosByUser}, which only returns private scenarios.
 */
export async function dbGetAllLearningScenariosByUser({
  user,
  includeDeleted,
}: {
  user: Pick<UserModel, 'id'>;
} & IncludeDeletedOption): Promise<LearningScenarioOptionalShareDataModel[]> {
  const activeShare = latestLearningScenarioShare(user, 'active');
  return baseLearningScenarioWithShareQuery(activeShare)
    .leftJoin(activeShare, eq(activeShare.learningScenarioId, learningScenarioTable.id))
    .where(
      and(
        eq(learningScenarioTable.userId, user.id),
        excludeDeletedLearningScenarios({ includeDeleted }),
      ),
    )
    .orderBy(desc(learningScenarioTable.createdAt));
}

export async function dbGetAllAccessibleLearningScenarios({
  user,
  includeDeleted,
}: {
  user: Pick<UserModel, 'id' | 'schoolIds' | 'federalStateId'>;
} & IncludeDeletedOption): Promise<LearningScenarioOptionalShareDataModel[]> {
  const activeShare = latestLearningScenarioShare(user, 'active');
  return baseLearningScenarioWithShareQuery(activeShare)
    .leftJoin(activeShare, eq(activeShare.learningScenarioId, learningScenarioTable.id))
    .leftJoin(
      learningScenarioTemplateMappingTable,
      eq(learningScenarioTemplateMappingTable.learningScenarioId, learningScenarioTable.id),
    )
    .where(
      and(
        or(
          and(
            eq(learningScenarioTable.userId, user.id),
            eq(learningScenarioTable.isSchoolShared, false),
            eq(learningScenarioTable.isCommunityShared, false),
            eq(learningScenarioTable.isGlobal, false),
          ),
          user.schoolIds.length > 0
            ? and(
                eq(learningScenarioTable.isSchoolShared, true),
                arrayOverlaps(userTable.schoolIds, user.schoolIds),
              )
            : undefined,
          eq(learningScenarioTable.isCommunityShared, true),
          and(
            eq(learningScenarioTable.isGlobal, true),
            eq(learningScenarioTemplateMappingTable.federalStateId, user.federalStateId),
          ),
        ),
        excludeDeletedLearningScenarios({ includeDeleted }),
      ),
    )
    .orderBy(desc(learningScenarioTable.createdAt));
}

/**
 * The returned entity has no Shared Data attached.
 * Use `dbGetLearningScenarioByIdWithManageableShare` if you need shared data.
 */
export async function dbGetLearningScenarioById({
  learningScenarioId,
  includeDeleted,
}: {
  learningScenarioId: string;
} & IncludeDeletedOption) {
  const [learningScenario] = await baseLearningScenarioQuery().where(
    and(
      eq(learningScenarioTable.id, learningScenarioId),
      excludeDeletedLearningScenarios({ includeDeleted }),
    ),
  );
  return learningScenario;
}

export async function dbGetLearningScenarioByIdForConversation({
  learningScenarioId,
  conversationId,
  userId,
}: {
  learningScenarioId: string;
  conversationId: string;
  userId: string;
}): Promise<LearningScenarioSelectModel | undefined> {
  const [learningScenario] = await baseLearningScenarioQuery()
    .innerJoin(
      conversationTable,
      eq(conversationTable.learningScenarioId, learningScenarioTable.id),
    )
    .where(
      and(
        eq(learningScenarioTable.id, learningScenarioId),
        eq(conversationTable.id, conversationId),
        eq(conversationTable.userId, userId),
        isNull(conversationTable.deletedAt),
      ),
    );
  return learningScenario;
}

export async function dbGetLearningScenariosByIds({
  learningScenarioIds,
  includeDeleted,
}: {
  learningScenarioIds: string[];
} & IncludeDeletedOption): Promise<LearningScenarioSelectModel[]> {
  if (learningScenarioIds.length === 0) {
    return [];
  }

  return baseLearningScenarioQuery().where(
    and(
      inArray(learningScenarioTable.id, learningScenarioIds),
      excludeDeletedLearningScenarios({ includeDeleted }),
    ),
  );
}

/**
 * Attaches the latest manageable share (running or within the grace window) of the user, if any.
 * Expired shares stay visible so the detail and editor views can offer to extend them.
 */
export async function dbGetLearningScenariosByIdsOptionalShareData({
  learningScenarioIds,
  user,
  includeDeleted,
}: {
  learningScenarioIds: string[];
  user: Pick<UserModel, 'id'>;
} & IncludeDeletedOption): Promise<LearningScenarioOptionalShareDataModel[]> {
  if (learningScenarioIds.length === 0) {
    return [];
  }

  const manageableShare = latestLearningScenarioShare(user, 'manageable');
  return baseLearningScenarioWithShareQuery(manageableShare)
    .leftJoin(manageableShare, eq(manageableShare.learningScenarioId, learningScenarioTable.id))
    .where(
      and(
        inArray(learningScenarioTable.id, learningScenarioIds),
        excludeDeletedLearningScenarios({ includeDeleted }),
      ),
    )
    .orderBy(desc(learningScenarioTable.createdAt));
}

export async function dbGetLearningScenariosByUserFavorite({
  user,
}: {
  user: Pick<UserModel, 'id'>;
}): Promise<LearningScenarioOptionalShareDataModel[]> {
  const activeShare = latestLearningScenarioShare(user, 'active');
  return baseLearningScenarioWithShareQuery(activeShare)
    .leftJoin(activeShare, eq(activeShare.learningScenarioId, learningScenarioTable.id))
    .innerJoin(
      userFavoriteTable,
      and(
        eq(userFavoriteTable.learningScenarioId, learningScenarioTable.id),
        eq(userFavoriteTable.userId, user.id),
      ),
    )
    .where(excludeDeletedLearningScenarios())
    .orderBy(desc(learningScenarioTable.createdAt));
}

/**
 * Needs userId because the metadata for shared learning scenarios is both tied to the user and learning scenario,
 * this is especially important for shared learning scenarios (school wide or global).
 *
 * Only considers manageable shares: not manually stopped and either running or expired within
 * the grace window.
 *
 * Returns undefined if the learning scenario does not exist or has no manageable share.
 */
export async function dbGetLearningScenarioByIdWithManageableShare({
  learningScenarioId,
  user,
  includeDeleted,
}: {
  learningScenarioId: string;
  user: Pick<UserModel, 'id'>;
} & IncludeDeletedOption): Promise<LearningScenarioWithShareDataModel | undefined> {
  const manageableShare = latestLearningScenarioShare(user, 'manageable');
  const [row] = await baseLearningScenarioWithShareQuery(manageableShare)
    .innerJoin(manageableShare, eq(manageableShare.learningScenarioId, learningScenarioTable.id))
    .where(
      and(
        eq(learningScenarioTable.id, learningScenarioId),
        excludeDeletedLearningScenarios({ includeDeleted }),
      ),
    );
  return row;
}

/**
 * Returns the share for a given learning scenario and user.
 */
export async function dbGetLearningScenarioByIdAndInviteCode({
  learningScenarioId,
  inviteCode,
  includeDeleted,
}: {
  learningScenarioId: string;
  inviteCode: string;
} & IncludeDeletedOption): Promise<LearningScenarioWithShareDataModel | undefined> {
  const [row] = await db
    .select({
      ...getTableColumns(learningScenarioTable),
      tokenPointsLimit: sharedLearningScenarioTable.tokenPointsLimit,
      inviteCode: sharedLearningScenarioTable.inviteCode,
      maxUsageTimeLimit: sharedLearningScenarioTable.maxUsageTimeLimit,
      startedAt: sharedLearningScenarioTable.startedAt,
      expiredAt: sharedLearningScenarioTable.expiredAt,
      manuallyStoppedAt: sharedLearningScenarioTable.manuallyStoppedAt,
      startedBy: sharedLearningScenarioTable.userId,
      ownerSchoolIds: userTable.schoolIds,
    })
    .from(learningScenarioTable)
    .innerJoin(userTable, eq(learningScenarioTable.userId, userTable.id))
    .innerJoin(
      sharedLearningScenarioTable,
      and(
        eq(sharedLearningScenarioTable.learningScenarioId, learningScenarioTable.id),
        eq(sharedLearningScenarioTable.inviteCode, inviteCode),
      ),
    )
    .where(
      and(
        eq(learningScenarioTable.id, learningScenarioId),
        excludeDeletedLearningScenarios({ includeDeleted }),
      ),
    );

  return row;
}

export async function dbUpdateTokenUsageBySharedLearningScenarioId(
  value: SharedLearningScenarioUsageTrackingInsertModel,
) {
  const [insertedUsage] = await db
    .insert(sharedLearningScenarioUsageTracking)
    .values(sanitizeCostsInCent(value))
    .returning();
  if (insertedUsage === undefined) {
    throw new Error('Could not track the token usage');
  }

  return insertedUsage;
}

export async function dbDeleteLearningScenarioByIdAndUser({
  learningScenarioId,
  user,
}: {
  learningScenarioId: string;
  user: Pick<UserModel, 'id'>;
}) {
  const [learningScenario] = await baseLearningScenarioQuery().where(
    and(
      eq(learningScenarioTable.id, learningScenarioId),
      eq(learningScenarioTable.userId, user.id),
    ),
  );

  if (learningScenario === undefined) {
    throw new Error('Learning scenario does not exist');
  }

  const deletedLearningScenario = await db.transaction(async (tx) => {
    const relatedFiles = await tx
      .select({ id: LearningScenarioFileMapping.fileId })
      .from(LearningScenarioFileMapping)
      .where(eq(LearningScenarioFileMapping.learningScenarioId, learningScenario.id));
    await tx
      .delete(LearningScenarioFileMapping)
      .where(eq(LearningScenarioFileMapping.learningScenarioId, learningScenario.id));
    const deletedFileIds: string[] = [];
    for (const { id } of relatedFiles) {
      if (await dbDeleteFileIfUnreferenced(tx, id)) {
        deletedFileIds.push(id);
      }
    }
    const [deletedLearningScenario] = await tx
      .delete(learningScenarioTable)
      .where(
        and(
          eq(learningScenarioTable.id, learningScenarioId),
          eq(learningScenarioTable.userId, user.id),
        ),
      )
      .returning();

    if (deletedLearningScenario === undefined) {
      throw new Error('Could not delete learning scenario');
    }
    return { deletedLearningScenario, deletedFileIds };
  });

  return deletedLearningScenario;
}

/**
 * Returns the latest manageable share for a learning scenario owned/started by the given user,
 * or `null` when none exists.
 *
 * A share is "manageable" when it has not been manually stopped and its expiration is
 * still within the grace window (`SHARE_EXTENSION_WINDOW_MS`) — i.e. it is either still
 * running or expired recently enough that it can still be extended or adjusted.
 */
export async function dbGetLatestManageableLearningScenarioShare({
  learningScenarioId,
  user,
}: {
  learningScenarioId: string;
  user: Pick<UserModel, 'id'>;
}) {
  const [share] = await db
    .select()
    .from(sharedLearningScenarioTable)
    .where(
      and(
        eq(sharedLearningScenarioTable.learningScenarioId, learningScenarioId),
        eq(sharedLearningScenarioTable.userId, user.id),
        isNull(sharedLearningScenarioTable.manuallyStoppedAt),
        shareScopeCondition('manageable'),
      ),
    )
    .orderBy(desc(sharedLearningScenarioTable.startedAt))
    .limit(1);

  return share ?? null;
}

/**
 * Marks a learning scenario share as manually stopped.
 * Returns `null` if the share does not exist.
 */
export async function dbStopLearningScenarioShare({ shareId }: { shareId: string }) {
  const [updatedShare] = await db
    .update(sharedLearningScenarioTable)
    .set({ manuallyStoppedAt: new Date() })
    .where(eq(sharedLearningScenarioTable.id, shareId))
    .returning();

  return updatedShare ?? null;
}

/**
 * Extends the expiration timestamp of the latest manageable learning scenario share for the given user.
 * Respects the grace window, so a share that expired recently can still be extended.
 * Returns `null` if no manageable share exists.
 */
export async function dbExtendSharedLearningScenarioExpiration({
  learningScenarioId,
  user,
  additionalTimeInMinutes,
}: {
  learningScenarioId: string;
  user: Pick<UserModel, 'id'>;
  additionalTimeInMinutes: number;
}) {
  const latestManageableShare = await dbGetLatestManageableLearningScenarioShare({
    learningScenarioId,
    user,
  });

  if (!latestManageableShare) {
    return null;
  }

  const now = new Date();
  const baseDate = latestManageableShare.expiredAt > now ? latestManageableShare.expiredAt : now;
  const newExpiredAt = new Date(baseDate.getTime() + additionalTimeInMinutes * 60 * 1000);

  const [updatedShare] = await db
    .update(sharedLearningScenarioTable)
    .set({ expiredAt: newExpiredAt })
    .where(eq(sharedLearningScenarioTable.id, latestManageableShare.id))
    .returning();

  return updatedShare;
}

/**
 * Updates the token points limit of the latest manageable learning scenario share for the given user.
 * Respects the grace window, so a share that expired recently can still be adjusted.
 * Returns `null` if no manageable share exists.
 */
export async function dbUpdateLearningScenarioShareTokenPointsLimit({
  learningScenarioId,
  user,
  tokenPointsLimit,
}: {
  learningScenarioId: string;
  user: Pick<UserModel, 'id'>;
  tokenPointsLimit: number;
}) {
  const latestManageableShare = await dbGetLatestManageableLearningScenarioShare({
    learningScenarioId,
    user,
  });

  if (!latestManageableShare) {
    return null;
  }

  const [updatedShare] = await db
    .update(sharedLearningScenarioTable)
    .set({ tokenPointsLimit })
    .where(eq(sharedLearningScenarioTable.id, latestManageableShare.id))
    .returning();

  return updatedShare;
}

/**
 * Create a new shared instance for a learning scenario.
 * Always inserts a new row; the caller is responsible for stopping any existing active share first.
 */
export async function dbCreateLearningScenarioShare({
  user,
  learningScenarioId,
  tokenPointsLimit,
  maxUsageTimeLimit,
  inviteCode,
  startedAt,
}: {
  user: Pick<UserModel, 'id'>;
  learningScenarioId: string;
  tokenPointsLimit: number;
  maxUsageTimeLimit: number;
  inviteCode: string;
  startedAt: Date;
}) {
  const expiredAt = new Date(startedAt.getTime() + maxUsageTimeLimit * 60 * 1000);
  const [newShare] = await db
    .insert(sharedLearningScenarioTable)
    .values({
      userId: user.id,
      learningScenarioId,
      maxUsageTimeLimit,
      tokenPointsLimit,
      inviteCode,
      startedAt,
      expiredAt,
    })
    .returning();
  return newShare;
}

export async function dbSetLearningScenarioSuspended({
  learningScenarioId,
}: {
  learningScenarioId: string;
}) {
  const [updatedLearningScenario] = await db
    .update(learningScenarioTable)
    .set({
      suspended: true,
      isSchoolShared: false,
      isCommunityShared: false,
      isGlobal: false,
      hasLinkAccess: false,
    })
    .where(eq(learningScenarioTable.id, learningScenarioId))
    .returning();

  if (!updatedLearningScenario) {
    throw new NotFoundError('Learning scenario not found');
  }

  const learningScenario = await dbGetLearningScenarioById({
    learningScenarioId: updatedLearningScenario.id,
    includeDeleted: true,
  });
  if (!learningScenario) {
    throw new NotFoundError('Learning scenario not found');
  }

  return learningScenario;
}

export async function dbLiftSuspensionOnLearningScenario({
  learningScenarioId,
}: {
  learningScenarioId: string;
}) {
  const [updatedLearningScenario] = await db
    .update(learningScenarioTable)
    .set({ suspended: false })
    .where(eq(learningScenarioTable.id, learningScenarioId))
    .returning();

  if (!updatedLearningScenario) {
    throw new NotFoundError('Learning scenario not found');
  }

  const learningScenario = await dbGetLearningScenarioById({
    learningScenarioId: updatedLearningScenario.id,
    includeDeleted: true,
  });
  if (!learningScenario) {
    throw new NotFoundError('Learning scenario not found');
  }

  return learningScenario;
}

export async function dbUpdateLearningScenarioFilterGroup({
  learningScenarioId,
  filterGroup: updatedFilterGroup,
}: {
  learningScenarioId: string;
  filterGroup: FilterGroup;
}): Promise<void> {
  await db
    .update(learningScenarioTable)
    .set({ filterGroup: updatedFilterGroup })
    .where(eq(learningScenarioTable.id, learningScenarioId));
}

/**
 * Updates whether a learning scenario is community-shared, within the given transaction.
 * Only called from the community-template-request workflow (approve/cancel), never directly
 * from the owner-facing update path.
 */
export async function dbUpdateLearningScenarioCommunityShared(
  learningScenarioId: string,
  isCommunityShared: boolean,
  tx: PgTransactionObject,
): Promise<void> {
  const [updatedLearningScenario] = await tx
    .update(learningScenarioTable)
    .set({ isCommunityShared })
    .where(eq(learningScenarioTable.id, learningScenarioId))
    .returning({ id: learningScenarioTable.id });

  if (!updatedLearningScenario) {
    throw new NotFoundError('Learning scenario not found');
  }
}

/**
 * Forces hasLinkAccess on for a learning scenario within the given transaction (admin needs
 * link access to review a submitted community template request).
 */
export async function dbUpdateLearningScenarioHasLinkAccess(
  learningScenarioId: string,
  hasLinkAccess: boolean,
  tx: PgTransactionObject,
): Promise<void> {
  const [updatedLearningScenario] = await tx
    .update(learningScenarioTable)
    .set({ hasLinkAccess })
    .where(eq(learningScenarioTable.id, learningScenarioId))
    .returning({ id: learningScenarioTable.id });

  if (!updatedLearningScenario) {
    throw new NotFoundError('Learning scenario not found');
  }
}

/**
 * Forces isSchoolShared on for a learning scenario within the given transaction (community
 * sharing includes school sharing).
 */
export async function dbUpdateLearningScenarioSchoolShared(
  learningScenarioId: string,
  isSchoolShared: boolean,
  tx: PgTransactionObject,
): Promise<void> {
  const [updatedLearningScenario] = await tx
    .update(learningScenarioTable)
    .set({ isSchoolShared })
    .where(eq(learningScenarioTable.id, learningScenarioId))
    .returning({ id: learningScenarioTable.id });

  if (!updatedLearningScenario) {
    throw new NotFoundError('Learning scenario not found');
  }
}
