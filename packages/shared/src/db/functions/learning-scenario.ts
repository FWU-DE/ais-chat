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
import { NotFoundError } from '@shared/error';
import { db } from '..';
import { SHARE_EXTENSION_WINDOW_MS } from '@shared/sharing/const';
import {
  fileTable,
  FilterGroup,
  LearningScenarioFileMapping,
  LearningScenarioOptionalShareDataModel,
  LearningScenarioSelectModel,
  conversationTable,
  learningScenarioTable,
  learningScenarioTemplateMappingTable,
  LearningScenarioWithShareDataModel,
  sharedLearningScenarioTable,
  sharedLearningScenarioUsageTracking,
  SharedLearningScenarioUsageTrackingInsertModel,
  userTable,
} from '../schema';
import { UserModel } from '@shared/auth/user-model';

type IncludeDeletedOption = {
  includeDeleted?: boolean;
};

function excludeDeletedLearningScenarios(options?: IncludeDeletedOption) {
  return options?.includeDeleted ? undefined : eq(learningScenarioTable.isDeleted, false);
}

/**
 * Returns a subquery that selects only the single latest non-expired share per learning scenario
 * for a given user.
 *
 * A share is expired if either:
 * - `manually_stopped_at IS NOT NULL` (explicitly stopped), or
 * - `expired_at < now` (time limit elapsed; `manually_stopped_at` may still be NULL for these)
 *
 * When multiple non-expired rows exist, `DISTINCT ON (learning_scenario_id) ORDER BY started_at DESC`
 * ensures only the most-recent row is returned, preventing duplicate entity rows in JOINs.
 */
function latestActiveLearningScenarioShare(user: Pick<UserModel, 'id'>) {
  return db
    .selectDistinctOn([sharedLearningScenarioTable.learningScenarioId], {
      ...getTableColumns(sharedLearningScenarioTable),
    })
    .from(sharedLearningScenarioTable)
    .where(
      and(
        eq(sharedLearningScenarioTable.userId, user.id),
        isNull(sharedLearningScenarioTable.manuallyStoppedAt),
        sql`${sharedLearningScenarioTable.expiredAt} >= now()`,
      ),
    )
    .orderBy(
      sharedLearningScenarioTable.learningScenarioId,
      desc(sharedLearningScenarioTable.startedAt),
    )
    .as('latest_share');
}

/**
 * Returns a subquery that selects the single most-recent share per learning scenario for a given
 * user, regardless of whether it is active or expired. Used to surface the last share's settings
 * (tokenPointsLimit, maxUsageTimeLimit) as defaults when no active share exists.
 */
function latestLearningScenarioShare(
  user: Pick<UserModel, 'id'>,
): ReturnType<typeof latestActiveLearningScenarioShare> {
  return db
    .selectDistinctOn([sharedLearningScenarioTable.learningScenarioId], {
      ...getTableColumns(sharedLearningScenarioTable),
    })
    .from(sharedLearningScenarioTable)
    .where(eq(sharedLearningScenarioTable.userId, user.id))
    .orderBy(
      sharedLearningScenarioTable.learningScenarioId,
      desc(sharedLearningScenarioTable.startedAt),
    )
    .as('latest_share');
}

/**
 * Returns a subquery that selects the single most-recent non-manually-stopped share per learning
 * scenario for a given user. This includes shares that have already expired, so the caller has
 * to decide if it is still available (grace window) or already expired.
 */
function latestNonStoppedLearningScenarioShare(
  user: Pick<UserModel, 'id'>,
): ReturnType<typeof latestActiveLearningScenarioShare> {
  return db
    .selectDistinctOn([sharedLearningScenarioTable.learningScenarioId], {
      ...getTableColumns(sharedLearningScenarioTable),
    })
    .from(sharedLearningScenarioTable)
    .where(
      and(
        eq(sharedLearningScenarioTable.userId, user.id),
        isNull(sharedLearningScenarioTable.manuallyStoppedAt),
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

function baseLearningScenarioWithShareQuery(
  activeShare: ReturnType<typeof latestActiveLearningScenarioShare>,
) {
  return db
    .select({
      ...getTableColumns(learningScenarioTable),
      tokenPointsLimit: activeShare.tokenPointsLimit,
      inviteCode: activeShare.inviteCode,
      maxUsageTimeLimit: activeShare.maxUsageTimeLimit,
      startedAt: activeShare.startedAt,
      expiredAt: activeShare.expiredAt,
      manuallyStoppedAt: activeShare.manuallyStoppedAt,
      startedBy: activeShare.userId,
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
  const activeShare = latestActiveLearningScenarioShare(user);
  return baseLearningScenarioWithShareQuery(activeShare)
    .leftJoin(activeShare, eq(activeShare.learningScenarioId, learningScenarioTable.id))
    .leftJoin(
      learningScenarioTemplateMappingTable,
      eq(learningScenarioTemplateMappingTable.learningScenarioId, learningScenarioTable.id),
    )
    .where(
      and(
        eq(learningScenarioTable.accessLevel, 'global'),
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

  const activeShare = latestActiveLearningScenarioShare(user);
  return baseLearningScenarioWithShareQuery(activeShare)
    .leftJoin(activeShare, eq(activeShare.learningScenarioId, learningScenarioTable.id))
    .where(
      and(
        eq(learningScenarioTable.accessLevel, 'school'),
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
  const activeShare = latestActiveLearningScenarioShare(user);
  return baseLearningScenarioWithShareQuery(activeShare)
    .leftJoin(activeShare, eq(activeShare.learningScenarioId, learningScenarioTable.id))
    .where(
      and(
        eq(learningScenarioTable.accessLevel, 'community'),
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
  const activeShare = latestActiveLearningScenarioShare(user);
  return baseLearningScenarioWithShareQuery(activeShare)
    .leftJoin(activeShare, eq(activeShare.learningScenarioId, learningScenarioTable.id))
    .where(
      and(
        eq(learningScenarioTable.userId, user.id),
        eq(learningScenarioTable.accessLevel, 'private'),
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
  const activeShare = latestActiveLearningScenarioShare(user);
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
  const activeShare = latestActiveLearningScenarioShare(user);
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
            eq(learningScenarioTable.accessLevel, 'private'),
          ),
          user.schoolIds.length > 0
            ? and(
                eq(learningScenarioTable.accessLevel, 'school'),
                arrayOverlaps(userTable.schoolIds, user.schoolIds),
              )
            : undefined,
          eq(learningScenarioTable.accessLevel, 'community'),
          and(
            eq(learningScenarioTable.accessLevel, 'global'),
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
 * Use `dbGetLearningScenarioByIdWithShareData` if you need shared data.
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
 * Needs userId because the metadata for shared learning scenarios is both tied to the user and learning scenario,
 * this is especially important for shared learning scenarios (school wide or global).
 *
 * Returns the latest share data even if expired, as long as it hasn't been manually stopped.
 * The service layer (getSharedLearningScenario) is responsible for validating the grace window.
 *
 * Returns undefined if the learning scenario does not exist or has no non-manually-stopped shares
 */
export async function dbGetLearningScenarioByIdWithShareData({
  learningScenarioId,
  user,
  includeDeleted,
}: {
  learningScenarioId: string;
  user: Pick<UserModel, 'id'>;
} & IncludeDeletedOption): Promise<LearningScenarioWithShareDataModel | undefined> {
  const latestShare = latestNonStoppedLearningScenarioShare(user);
  const [row] = await baseLearningScenarioWithShareQuery(latestShare)
    .innerJoin(latestShare, eq(latestShare.learningScenarioId, learningScenarioTable.id))
    .where(
      and(
        eq(learningScenarioTable.id, learningScenarioId),
        excludeDeletedLearningScenarios({ includeDeleted }),
      ),
    );
  return row;
}

export async function dbGetLearningScenarioByIdOptionalShareData({
  learningScenarioId,
  user,
  includeDeleted,
}: {
  learningScenarioId: string;
  user: Pick<UserModel, 'id'>;
} & IncludeDeletedOption): Promise<LearningScenarioOptionalShareDataModel | undefined> {
  const latestShare = latestLearningScenarioShare(user);
  const [row] = await baseLearningScenarioWithShareQuery(latestShare)
    .leftJoin(latestShare, eq(latestShare.learningScenarioId, learningScenarioTable.id))
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
    .values(value)
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
    await tx.delete(fileTable).where(
      inArray(
        fileTable.id,
        relatedFiles.map((f) => f.id),
      ),
    );
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
    return deletedLearningScenario;
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
  const graceWindowStart = new Date(Date.now() - SHARE_EXTENSION_WINDOW_MS);

  const [share] = await db
    .select()
    .from(sharedLearningScenarioTable)
    .where(
      and(
        eq(sharedLearningScenarioTable.learningScenarioId, learningScenarioId),
        eq(sharedLearningScenarioTable.userId, user.id),
        isNull(sharedLearningScenarioTable.manuallyStoppedAt),
        gte(sharedLearningScenarioTable.expiredAt, graceWindowStart),
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
      accessLevel: 'private',
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
