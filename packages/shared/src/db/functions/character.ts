import { UserModel } from '@shared/auth/user-model';
import { NotFoundError } from '@shared/error';
import { findStaticModelByRole } from '@shared/llm-models/llm-model-service';
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
  CharacterFileMapping,
  CharacterInsertModel,
  CharacterOptionalShareDataModel,
  CharacterSelectModel,
  characterTable,
  characterTemplateMappingTable,
  CharacterWithShareDataModel,
  conversationTable,
  FilterGroup,
  sharedCharacter,
  SharedCharacterChatUsageTrackingInsertModel,
  sharedCharacterChatUsageTrackingTable,
  userFavoriteTable,
  userTable,
} from '../schema';
import { PgTransactionObject } from '../types';
import { dbDeleteFileIfUnreferenced } from './files';
import { sanitizeCostsInCent } from './token-usage';

type IncludeDeletedOption = {
  includeDeleted?: boolean;
};

function excludeDeletedCharacters(options?: IncludeDeletedOption) {
  return options?.includeDeleted ? undefined : eq(characterTable.isDeleted, false);
}

type ShareScope = 'active' | 'manageable';

/**
 * - `active`: the share is still running (`expired_at >= now`).
 * - `manageable`: the share is running or expired within the grace window
 *   (`SHARE_EXTENSION_WINDOW_MS`), so it can still be extended or adjusted.
 */
function shareScopeCondition(scope: ShareScope) {
  return scope === 'active'
    ? sql`${sharedCharacter.expiredAt} >= now()`
    : gte(sharedCharacter.expiredAt, new Date(Date.now() - SHARE_EXTENSION_WINDOW_MS));
}

/**
 * Returns a subquery that selects the single latest share per character for a given user that is
 * not manually stopped and matches the given scope.
 *
 * `DISTINCT ON (character_id) ORDER BY started_at DESC` ensures only the most-recent row is
 * returned, preventing duplicate entity rows in JOINs.
 */
function latestCharacterShare(user: Pick<UserModel, 'id'>, scope: ShareScope) {
  return db
    .selectDistinctOn([sharedCharacter.characterId], {
      ...getTableColumns(sharedCharacter),
    })
    .from(sharedCharacter)
    .where(
      and(
        eq(sharedCharacter.userId, user.id),
        isNull(sharedCharacter.manuallyStoppedAt),
        shareScopeCondition(scope),
      ),
    )
    .orderBy(sharedCharacter.characterId, desc(sharedCharacter.startedAt))
    .as('latest_share');
}

function baseCharacterQuery() {
  return db
    .select({
      ...getTableColumns(characterTable),
      ownerSchoolIds: userTable.schoolIds,
    })
    .from(characterTable)
    .innerJoin(userTable, eq(characterTable.userId, userTable.id));
}

function baseCharacterWithShareQuery(share: ReturnType<typeof latestCharacterShare>) {
  return db
    .select({
      ...getTableColumns(characterTable),
      tokenPointsLimit: share.tokenPointsLimit,
      inviteCode: share.inviteCode,
      maxUsageTimeLimit: share.maxUsageTimeLimit,
      startedAt: share.startedAt,
      expiredAt: share.expiredAt,
      manuallyStoppedAt: share.manuallyStoppedAt,
      startedBy: share.userId,
      ownerSchoolIds: userTable.schoolIds,
    })
    .from(characterTable)
    .innerJoin(userTable, eq(characterTable.userId, userTable.id));
}

/**
 * Get all characters a user is allowed to see:
 * - user is owner of character
 * - character is shared with users school
 * - character is global
 * - character is not deleted
 */
export async function dbGetCharacters({
  user,
  includeDeleted,
}: {
  user: Pick<UserModel, 'id' | 'schoolIds'>;
} & IncludeDeletedOption): Promise<CharacterSelectModel[]> {
  const schoolCondition =
    user.schoolIds.length > 0
      ? and(
          eq(characterTable.isSchoolShared, true),
          arrayOverlaps(userTable.schoolIds, user.schoolIds),
        )
      : undefined;

  const characters = await baseCharacterQuery().where(
    and(
      or(
        eq(characterTable.userId, user.id),
        schoolCondition,
        eq(characterTable.isCommunityShared, true),
        eq(characterTable.isGlobal, true),
      ),
      excludeDeletedCharacters({ includeDeleted }),
    ),
  );

  return characters;
}

/**
 * Needs userId because the metadata for shared characters is both tied to the user and character,
 * this is especially important for shared characters (school wide or global).
 *
 * Only considers manageable shares: not manually stopped and either running or expired within
 * the grace window.
 *
 * Returns undefined if the character does not exist or has no manageable share.
 */
export async function dbGetCharacterByIdWithManageableShare({
  characterId,
  user,
  includeDeleted,
}: {
  characterId: string;
  user: Pick<UserModel, 'id'>;
} & IncludeDeletedOption): Promise<CharacterWithShareDataModel | undefined> {
  const manageableShare = latestCharacterShare(user, 'manageable');
  const [row] = await baseCharacterWithShareQuery(manageableShare)
    .innerJoin(manageableShare, eq(manageableShare.characterId, characterTable.id))
    .where(and(eq(characterTable.id, characterId), excludeDeletedCharacters({ includeDeleted })));
  return row;
}

/**
 * The returned entity has no shared data attached. These are found in the SharedCharacter table.
 */
export async function dbGetCharacterById({
  characterId,
  includeDeleted,
}: {
  characterId: string;
} & IncludeDeletedOption) {
  const [row] = await baseCharacterQuery().where(
    and(eq(characterTable.id, characterId), excludeDeletedCharacters({ includeDeleted })),
  );
  return row;
}

export async function dbGetCharacterByIdForConversation({
  characterId,
  conversationId,
  userId,
}: {
  characterId: string;
  conversationId: string;
  userId: string;
}): Promise<CharacterSelectModel | undefined> {
  const [row] = await baseCharacterQuery()
    .innerJoin(conversationTable, eq(conversationTable.characterId, characterTable.id))
    .where(
      and(
        eq(characterTable.id, characterId),
        eq(conversationTable.id, conversationId),
        eq(conversationTable.userId, userId),
        isNull(conversationTable.deletedAt),
      ),
    );
  return row;
}

export async function dbGetCharactersByIds({
  characterIds,
  includeDeleted,
}: {
  characterIds: string[];
} & IncludeDeletedOption): Promise<CharacterSelectModel[]> {
  if (characterIds.length === 0) {
    return [];
  }

  return baseCharacterQuery().where(
    and(inArray(characterTable.id, characterIds), excludeDeletedCharacters({ includeDeleted })),
  );
}

/**
 * Attaches the latest manageable share (running or within the grace window) of the user, if any.
 * Expired shares stay visible so the detail and editor views can offer to extend them.
 */
export async function dbGetCharactersByIdsOptionalShareData({
  characterIds,
  user,
  includeDeleted,
}: {
  characterIds: string[];
  user: Pick<UserModel, 'id'>;
} & IncludeDeletedOption): Promise<CharacterOptionalShareDataModel[]> {
  if (characterIds.length === 0) {
    return [];
  }

  const manageableShare = latestCharacterShare(user, 'manageable');
  return baseCharacterWithShareQuery(manageableShare)
    .leftJoin(manageableShare, eq(manageableShare.characterId, characterTable.id))
    .where(
      and(inArray(characterTable.id, characterIds), excludeDeletedCharacters({ includeDeleted })),
    )
    .orderBy(desc(characterTable.createdAt));
}

export async function dbGetCharactersByUserFavorite({
  user,
}: {
  user: Pick<UserModel, 'id'>;
}): Promise<CharacterOptionalShareDataModel[]> {
  const activeShare = latestCharacterShare(user, 'active');
  return baseCharacterWithShareQuery(activeShare)
    .leftJoin(activeShare, eq(activeShare.characterId, characterTable.id))
    .innerJoin(
      userFavoriteTable,
      and(
        eq(userFavoriteTable.characterId, characterTable.id),
        eq(userFavoriteTable.userId, user.id),
      ),
    )
    .where(excludeDeletedCharacters())
    .orderBy(desc(characterTable.createdAt));
}

export async function dbCreateCharacter(
  character: Omit<CharacterInsertModel, 'modelId'> & Partial<Pick<CharacterInsertModel, 'modelId'>>,
) {
  let modelId = character.modelId;
  if (!modelId) {
    modelId = (await findStaticModelByRole('default-chat'))?.id;
    if (!modelId) {
      throw new Error('No default model found');
    }
  }

  const created = await db
    .insert(characterTable)
    .values({ ...character, modelId })
    .onConflictDoUpdate({ target: characterTable.id, set: { ...character } })
    .returning();
  return created;
}

export async function dbGetGlobalCharacters({
  user,
  includeDeleted,
}: {
  user: Pick<UserModel, 'id' | 'federalStateId'>;
} & IncludeDeletedOption): Promise<CharacterOptionalShareDataModel[]> {
  const federalStateId = user.federalStateId;

  const activeShare = latestCharacterShare(user, 'active');
  const characters = await baseCharacterWithShareQuery(activeShare)
    .leftJoin(activeShare, eq(activeShare.characterId, characterTable.id))
    .leftJoin(
      characterTemplateMappingTable,
      eq(characterTemplateMappingTable.characterId, characterTable.id),
    )
    .where(
      and(
        eq(characterTable.isGlobal, true),
        federalStateId
          ? eq(characterTemplateMappingTable.federalStateId, federalStateId)
          : undefined,
        excludeDeletedCharacters({ includeDeleted }),
      ),
    )
    .orderBy(desc(characterTable.createdAt));

  return characters;
}

export async function dbGetCommunityCharacters({
  user,
  includeDeleted,
}: {
  user: Pick<UserModel, 'id'>;
} & IncludeDeletedOption): Promise<CharacterOptionalShareDataModel[]> {
  const activeShare = latestCharacterShare(user, 'active');
  const characters = await baseCharacterWithShareQuery(activeShare)
    .leftJoin(activeShare, eq(activeShare.characterId, characterTable.id))
    .where(
      and(eq(characterTable.isCommunityShared, true), excludeDeletedCharacters({ includeDeleted })),
    )
    .orderBy(desc(characterTable.createdAt));

  return characters;
}

/**
 * Retrieves all characters shared at the school level that are accessible to a user.
 *
 * This includes characters from other users who share at least one school with the requesting user.
 * This includes usage data from the SharedCharacter table.
 *
 * @param params.userId - The unique identifier of the user requesting the characters
 * @returns A promise that resolves to an array of character models with associated conversation metadata
 *
 */
export async function dbGetCharactersByAssociatedSchools({
  user,
  includeDeleted,
}: {
  user: Pick<UserModel, 'id' | 'schoolIds'>;
} & IncludeDeletedOption): Promise<CharacterOptionalShareDataModel[]> {
  if (user.schoolIds.length === 0) {
    return [];
  }

  const activeShare = latestCharacterShare(user, 'active');
  const characters = await baseCharacterWithShareQuery(activeShare)
    .leftJoin(activeShare, eq(activeShare.characterId, characterTable.id))
    .where(
      and(
        arrayOverlaps(userTable.schoolIds, user.schoolIds),
        eq(characterTable.isSchoolShared, true),
        excludeDeletedCharacters({ includeDeleted }),
      ),
    )
    .orderBy(desc(characterTable.createdAt));

  return characters;
}

export async function dbGetCharactersByUser({
  user,
  includeDeleted,
}: {
  user: Pick<UserModel, 'id'>;
} & IncludeDeletedOption): Promise<CharacterOptionalShareDataModel[]> {
  const activeShare = latestCharacterShare(user, 'active');
  const characters = await baseCharacterWithShareQuery(activeShare)
    .leftJoin(activeShare, eq(activeShare.characterId, characterTable.id))
    .where(
      and(
        eq(characterTable.userId, user.id),
        eq(characterTable.isSchoolShared, false),
        eq(characterTable.isCommunityShared, false),
        eq(characterTable.isGlobal, false),
        excludeDeletedCharacters({ includeDeleted }),
      ),
    )
    .orderBy(desc(characterTable.createdAt));

  return characters;
}

export async function dbGetAllCharactersByUser({
  user,
  includeDeleted,
}: {
  user: Pick<UserModel, 'id'>;
} & IncludeDeletedOption): Promise<CharacterOptionalShareDataModel[]> {
  const activeShare = latestCharacterShare(user, 'active');
  const characters = await baseCharacterWithShareQuery(activeShare)
    .leftJoin(activeShare, eq(activeShare.characterId, characterTable.id))
    .where(and(eq(characterTable.userId, user.id), excludeDeletedCharacters({ includeDeleted })))
    .orderBy(desc(characterTable.createdAt));

  return characters;
}

export async function dbGetAllAccessibleCharacters({
  user,
  includeDeleted,
}: {
  user: Pick<UserModel, 'id' | 'schoolIds' | 'federalStateId'>;
} & IncludeDeletedOption): Promise<CharacterOptionalShareDataModel[]> {
  const federalStateId = user.federalStateId;
  const activeShare = latestCharacterShare(user, 'active');
  return baseCharacterWithShareQuery(activeShare)
    .leftJoin(activeShare, eq(activeShare.characterId, characterTable.id))
    .leftJoin(
      characterTemplateMappingTable,
      eq(characterTemplateMappingTable.characterId, characterTable.id),
    )
    .where(
      and(
        or(
          and(
            eq(characterTable.userId, user.id),
            eq(characterTable.isSchoolShared, false),
            eq(characterTable.isCommunityShared, false),
            eq(characterTable.isGlobal, false),
          ),
          user.schoolIds && user.schoolIds.length > 0
            ? and(
                eq(characterTable.isSchoolShared, true),
                arrayOverlaps(userTable.schoolIds, user.schoolIds),
              )
            : undefined,
          eq(characterTable.isCommunityShared, true),
          and(
            eq(characterTable.isGlobal, true),
            eq(characterTemplateMappingTable.federalStateId, federalStateId),
          ),
        ),
        excludeDeletedCharacters({ includeDeleted }),
      ),
    )
    .orderBy(desc(characterTable.createdAt));
}

export async function dbDeleteCharacterByIdAndUser({
  characterId,
  user,
}: {
  characterId: string;
  user: Pick<UserModel, 'id'>;
}) {
  const [character] = await db
    .select()
    .from(characterTable)
    .where(and(eq(characterTable.id, characterId), eq(characterTable.userId, user.id)));

  if (character === undefined) {
    throw new Error('Character does not exist');
  }

  const deletedCharacter = await db.transaction(async (tx) => {
    const relatedFiles = await tx
      .select({ id: CharacterFileMapping.fileId })
      .from(CharacterFileMapping)
      .where(eq(CharacterFileMapping.characterId, character.id));
    await tx.delete(conversationTable).where(eq(conversationTable.characterId, character.id));
    await tx.delete(CharacterFileMapping).where(eq(CharacterFileMapping.characterId, character.id));
    const deletedFileIds: string[] = [];
    for (const { id } of relatedFiles) {
      if (await dbDeleteFileIfUnreferenced(tx, id)) {
        deletedFileIds.push(id);
      }
    }
    const deletedCharacter = (
      await tx
        .delete(characterTable)
        .where(and(eq(characterTable.id, characterId), eq(characterTable.userId, user.id)))
        .returning()
    )[0];

    if (deletedCharacter === undefined) {
      throw new Error('Could not delete character');
    }
    return { deletedCharacter, deletedFileIds };
  });

  return deletedCharacter;
}

export async function dbGetCharacterByIdAndInviteCode({
  id,
  inviteCode,
  includeDeleted,
}: {
  id: string;
  inviteCode: string;
} & IncludeDeletedOption): Promise<CharacterWithShareDataModel | undefined> {
  const [row] = await db
    .select({
      ...getTableColumns(characterTable),
      tokenPointsLimit: sharedCharacter.tokenPointsLimit,
      inviteCode: sharedCharacter.inviteCode,
      maxUsageTimeLimit: sharedCharacter.maxUsageTimeLimit,
      startedAt: sharedCharacter.startedAt,
      expiredAt: sharedCharacter.expiredAt,
      manuallyStoppedAt: sharedCharacter.manuallyStoppedAt,
      startedBy: sharedCharacter.userId,
      ownerSchoolIds: userTable.schoolIds,
    })
    .from(characterTable)
    .innerJoin(userTable, eq(characterTable.userId, userTable.id))
    .innerJoin(sharedCharacter, eq(sharedCharacter.characterId, characterTable.id))
    .where(
      and(
        eq(characterTable.id, id),
        eq(sharedCharacter.inviteCode, inviteCode),
        excludeDeletedCharacters({ includeDeleted }),
      ),
    );

  return row;
}

export async function dbUpdateTokenUsageByCharacterChatId(
  value: SharedCharacterChatUsageTrackingInsertModel,
) {
  const insertedUsage = (
    await db
      .insert(sharedCharacterChatUsageTrackingTable)
      .values(sanitizeCostsInCent(value))
      .returning()
  )[0];
  if (insertedUsage === undefined) {
    throw new Error('Could not track the token usage');
  }

  return insertedUsage;
}

export async function dbGetCharacterByNameAndUser({
  name,
  user,
  includeDeleted,
}: {
  name: string;
  user: Pick<UserModel, 'id'>;
} & IncludeDeletedOption): Promise<CharacterSelectModel | undefined> {
  const [character] = await baseCharacterQuery().where(
    and(
      eq(characterTable.name, name),
      eq(characterTable.userId, user.id),
      excludeDeletedCharacters({ includeDeleted }),
    ),
  );
  return character;
}

export async function dbGetGlobalCharacterByName({
  name,
  includeDeleted,
}: {
  name: string;
} & IncludeDeletedOption): Promise<CharacterSelectModel | undefined> {
  const [character] = await baseCharacterQuery().where(
    and(
      eq(characterTable.name, name),
      eq(characterTable.isGlobal, true),
      excludeDeletedCharacters({ includeDeleted }),
    ),
  );
  return character;
}

export async function dbSetCharacterSuspended({ characterId }: { characterId: string }) {
  const [updatedCharacter] = await db
    .update(characterTable)
    .set({
      suspended: true,
      isSchoolShared: false,
      isCommunityShared: false,
      isGlobal: false,
      hasLinkAccess: false,
    })
    .where(eq(characterTable.id, characterId))
    .returning();

  if (!updatedCharacter) {
    throw new NotFoundError('Character not found');
  }

  const character = await dbGetCharacterById({
    characterId: updatedCharacter.id,
    includeDeleted: true,
  });
  if (!character) {
    throw new NotFoundError('Character not found');
  }

  return character;
}

export async function dbLiftSuspensionOnCharacter({ characterId }: { characterId: string }) {
  const [updatedCharacter] = await db
    .update(characterTable)
    .set({ suspended: false })
    .where(eq(characterTable.id, characterId))
    .returning();

  if (!updatedCharacter) {
    throw new NotFoundError('Character not found');
  }

  const character = await dbGetCharacterById({
    characterId: updatedCharacter.id,
    includeDeleted: true,
  });
  if (!character) {
    throw new NotFoundError('Character not found');
  }

  return character;
}

/**
 * Returns the latest manageable share for a character owned/started by the given user,
 * or `null` when none exists.
 *
 * A share is "manageable" when it has not been manually stopped and its expiration is
 * still within the grace window (`SHARE_EXTENSION_WINDOW_MS`) — i.e. it is either still
 * running or expired recently enough that it can still be extended or adjusted.
 */
export async function dbGetLatestManageableCharacterShare({
  characterId,
  user,
}: {
  characterId: string;
  user: Pick<UserModel, 'id'>;
}) {
  const [share] = await db
    .select()
    .from(sharedCharacter)
    .where(
      and(
        eq(sharedCharacter.characterId, characterId),
        eq(sharedCharacter.userId, user.id),
        isNull(sharedCharacter.manuallyStoppedAt),
        shareScopeCondition('manageable'),
      ),
    )
    .orderBy(desc(sharedCharacter.startedAt))
    .limit(1);

  return share ?? null;
}

/**
 * Creates a new share for a character.
 * Always inserts a new row; the caller is responsible for ensuring no
 * manageable share already exists.
 */
export async function dbCreateCharacterShare({
  user,
  characterId,
  tokenPointsLimit,
  maxUsageTimeLimit,
  inviteCode,
  startedAt,
}: {
  user: Pick<UserModel, 'id'>;
  characterId: string;
  tokenPointsLimit: number;
  maxUsageTimeLimit: number;
  inviteCode: string;
  startedAt: Date;
}) {
  const expiredAt = new Date(startedAt.getTime() + maxUsageTimeLimit * 60 * 1000);
  const [newShare] = await db
    .insert(sharedCharacter)
    .values({
      userId: user.id,
      characterId,
      tokenPointsLimit,
      maxUsageTimeLimit,
      inviteCode,
      startedAt,
      expiredAt,
    })
    .returning();

  return newShare;
}

/**
 * Marks a character share as manually stopped.
 * Returns `null` if the share does not exist.
 */
export async function dbStopCharacterShare({ shareId }: { shareId: string }) {
  const [updatedShare] = await db
    .update(sharedCharacter)
    .set({ manuallyStoppedAt: new Date() })
    .where(eq(sharedCharacter.id, shareId))
    .returning();

  return updatedShare ?? null;
}

/**
 * Extends the expiration timestamp of an already loaded manageable character share.
 * Respects the grace window, so a share that expired recently can still be extended.
 */
export async function dbExtendSharedCharacterExpiration({
  share,
  additionalTimeInMinutes,
}: {
  share: { id: string; expiredAt: Date };
  additionalTimeInMinutes: number;
}) {
  const now = new Date();
  const baseDate = share.expiredAt > now ? share.expiredAt : now;
  const newExpiredAt = new Date(baseDate.getTime() + additionalTimeInMinutes * 60 * 1000);

  const [updatedShare] = await db
    .update(sharedCharacter)
    .set({ expiredAt: newExpiredAt })
    .where(eq(sharedCharacter.id, share.id))
    .returning();

  return updatedShare ?? null;
}

/**
 * Updates the token points limit of the latest manageable character share for the given user.
 * Respects the grace window, so a share that expired recently can still be adjusted.
 * Returns `null` if no manageable share exists.
 */
export async function dbUpdateCharacterShareTokenPointsLimit({
  characterId,
  user,
  tokenPointsLimit,
}: {
  characterId: string;
  user: Pick<UserModel, 'id'>;
  tokenPointsLimit: number;
}) {
  const latestManageableShare = await dbGetLatestManageableCharacterShare({ characterId, user });

  if (!latestManageableShare) {
    return null;
  }

  const [updatedShare] = await db
    .update(sharedCharacter)
    .set({ tokenPointsLimit })
    .where(eq(sharedCharacter.id, latestManageableShare.id))
    .returning();

  return updatedShare;
}

export async function dbUpdateCharacterFilterGroup({
  characterId,
  filterGroup: updatedFilterGroup,
}: {
  characterId: string;
  filterGroup: FilterGroup;
}): Promise<void> {
  await db
    .update(characterTable)
    .set({ filterGroup: updatedFilterGroup })
    .where(eq(characterTable.id, characterId));
}

/**
 * Updates whether a character is community-shared, within the given transaction.
 * Only called from the community-template-request workflow (approve/cancel), never directly
 * from the owner-facing update path. The `updatedAt` timestamp is bumped automatically.
 */
export async function dbUpdateCharacterCommunityShared(
  characterId: string,
  isCommunityShared: boolean,
  tx: PgTransactionObject,
): Promise<void> {
  const [updatedCharacter] = await tx
    .update(characterTable)
    .set({ isCommunityShared })
    .where(eq(characterTable.id, characterId))
    .returning({ id: characterTable.id });

  if (!updatedCharacter) {
    throw new NotFoundError('Character not found');
  }
}

/**
 * Forces hasLinkAccess on for a character within the given transaction (admin needs link
 * access to review a submitted community template request).
 */
export async function dbUpdateCharacterHasLinkAccess(
  characterId: string,
  hasLinkAccess: boolean,
  tx: PgTransactionObject,
): Promise<void> {
  const [updatedCharacter] = await tx
    .update(characterTable)
    .set({ hasLinkAccess })
    .where(eq(characterTable.id, characterId))
    .returning({ id: characterTable.id });

  if (!updatedCharacter) {
    throw new NotFoundError('Character not found');
  }
}

/**
 * Forces isSchoolShared on for a character within the given transaction (community sharing
 * includes school sharing).
 */
export async function dbUpdateCharacterSchoolShared(
  characterId: string,
  isSchoolShared: boolean,
  tx: PgTransactionObject,
): Promise<void> {
  const [updatedCharacter] = await tx
    .update(characterTable)
    .set({ isSchoolShared })
    .where(eq(characterTable.id, characterId))
    .returning({ id: characterTable.id });

  if (!updatedCharacter) {
    throw new NotFoundError('Character not found');
  }
}
