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
import { NotFoundError } from '@shared/error';
import { SHARE_EXTENSION_WINDOW_MS } from '@shared/sharing/const';
import {
  CharacterFileMapping,
  CharacterInsertModel,
  CharacterOptionalShareDataModel,
  CharacterSelectModel,
  characterTable,
  characterTemplateMappingTable,
  CharacterWithShareDataModel,
  conversationTable,
  fileTable,
  FilterGroup,
  SharedCharacterChatUsageTrackingInsertModel,
  sharedCharacterChatUsageTrackingTable,
  sharedCharacterConversation,
  userTable,
} from '../schema';
import { findStaticModelByRole } from '@shared/llm-models/llm-model-service';
import { UserModel } from '@shared/auth/user-model';

type IncludeDeletedOption = {
  includeDeleted?: boolean;
};

function excludeDeletedCharacters(options?: IncludeDeletedOption) {
  return options?.includeDeleted ? undefined : eq(characterTable.isDeleted, false);
}

/**
 * Returns a subquery that selects only the single latest non-expired share per character for a given user.
 *
 * A share is expired if either:
 * - `manually_stopped_at IS NOT NULL` (explicitly stopped), or
 * - `expired_at < now` (time limit elapsed; `manually_stopped_at` may still be NULL for these)
 *
 * When multiple non-expired rows exist, `DISTINCT ON (character_id) ORDER BY started_at DESC`
 * ensures only the most-recent row is returned, preventing duplicate entity rows in JOINs.
 */
function latestActiveCharacterShare(user: Pick<UserModel, 'id'>) {
  return db
    .selectDistinctOn([sharedCharacterConversation.characterId], {
      ...getTableColumns(sharedCharacterConversation),
    })
    .from(sharedCharacterConversation)
    .where(
      and(
        eq(sharedCharacterConversation.userId, user.id),
        isNull(sharedCharacterConversation.manuallyStoppedAt),
        sql`${sharedCharacterConversation.expiredAt} >= now()`,
      ),
    )
    .orderBy(sharedCharacterConversation.characterId, desc(sharedCharacterConversation.startedAt))
    .as('latest_share');
}

/**
 * Returns a subquery that selects the single most-recent share per character for a given user,
 * regardless of whether it is active or expired. Used to surface the last share's settings
 * (tokenPointsLimit, maxUsageTimeLimit) as defaults when no active share exists.
 */
function latestCharacterShare(
  user: Pick<UserModel, 'id'>,
): ReturnType<typeof latestActiveCharacterShare> {
  return db
    .selectDistinctOn([sharedCharacterConversation.characterId], {
      ...getTableColumns(sharedCharacterConversation),
    })
    .from(sharedCharacterConversation)
    .where(eq(sharedCharacterConversation.userId, user.id))
    .orderBy(sharedCharacterConversation.characterId, desc(sharedCharacterConversation.startedAt))
    .as('latest_share');
}

/**
 * Returns a subquery that selects the single most-recent non-manually-stopped share per character
 * for a given user. This includes shares that have already expired, so the caller has
 * to decide if it is still available (grace window) or already expired.
 */
function latestNonStoppedCharacterShare(
  user: Pick<UserModel, 'id'>,
): ReturnType<typeof latestActiveCharacterShare> {
  return db
    .selectDistinctOn([sharedCharacterConversation.characterId], {
      ...getTableColumns(sharedCharacterConversation),
    })
    .from(sharedCharacterConversation)
    .where(
      and(
        eq(sharedCharacterConversation.userId, user.id),
        isNull(sharedCharacterConversation.manuallyStoppedAt),
      ),
    )
    .orderBy(sharedCharacterConversation.characterId, desc(sharedCharacterConversation.startedAt))
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

function baseCharacterWithShareQuery(activeShare: ReturnType<typeof latestActiveCharacterShare>) {
  return db
    .select({
      ...getTableColumns(characterTable),
      tokenPointsLimit: activeShare.tokenPointsLimit,
      inviteCode: activeShare.inviteCode,
      maxUsageTimeLimit: activeShare.maxUsageTimeLimit,
      startedAt: activeShare.startedAt,
      expiredAt: activeShare.expiredAt,
      manuallyStoppedAt: activeShare.manuallyStoppedAt,
      startedBy: activeShare.userId,
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
          eq(characterTable.accessLevel, 'school'),
          arrayOverlaps(userTable.schoolIds, user.schoolIds),
        )
      : undefined;

  const characters = await baseCharacterQuery().where(
    and(
      or(
        eq(characterTable.userId, user.id),
        schoolCondition,
        eq(characterTable.accessLevel, 'community'),
        eq(characterTable.accessLevel, 'global'),
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
 * Returns the latest share data even if expired, as long as it hasn't been manually stopped.
 * The service layer (getSharedCharacter) is responsible for validating the grace window.
 *
 * Returns undefined if the character does not exist or has no non-manually-stopped shares
 */
export async function dbGetCharacterByIdWithShareData({
  characterId,
  user,
  includeDeleted,
}: {
  characterId: string;
  user: Pick<UserModel, 'id'>;
} & IncludeDeletedOption): Promise<CharacterWithShareDataModel | undefined> {
  const latestShare = latestNonStoppedCharacterShare(user);
  const [row] = await baseCharacterWithShareQuery(latestShare)
    .innerJoin(latestShare, eq(latestShare.characterId, characterTable.id))
    .where(and(eq(characterTable.id, characterId), excludeDeletedCharacters({ includeDeleted })));
  return row;
}

export async function dbGetCharacterByIdOptionalShareData({
  characterId,
  user,
  includeDeleted,
}: {
  characterId: string;
  user: Pick<UserModel, 'id'>;
} & IncludeDeletedOption): Promise<CharacterOptionalShareDataModel | undefined> {
  const latestShare = latestCharacterShare(user);
  const [row] = await baseCharacterWithShareQuery(latestShare)
    .leftJoin(latestShare, eq(latestShare.characterId, characterTable.id))
    .where(and(eq(characterTable.id, characterId), excludeDeletedCharacters({ includeDeleted })));
  return row;
}

/**
 * The returned entity has no Shared Data Attached! These are found in the SharedCharacterConversation Table
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

export async function dbGetCopyTemplateCharacter({
  templateId,
  characterId,
  user,
}: {
  templateId: string;
  characterId: string;
  user: Pick<UserModel, 'id' | 'schoolIds'>;
}): Promise<Omit<CharacterSelectModel, 'modelId'>> {
  const character = await dbGetCharacterByIdWithShareData({ characterId: templateId, user });
  if (character?.name === undefined) {
    throw new Error('Invalid State Template Character must have a name');
  }
  return {
    ...character,
    id: characterId,
    accessLevel: 'private',
    userId: user.id,
  };
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

  const activeShare = latestActiveCharacterShare(user);
  const characters = await baseCharacterWithShareQuery(activeShare)
    .leftJoin(activeShare, eq(activeShare.characterId, characterTable.id))
    .leftJoin(
      characterTemplateMappingTable,
      eq(characterTemplateMappingTable.characterId, characterTable.id),
    )
    .where(
      and(
        eq(characterTable.accessLevel, 'global'),
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
  const activeShare = latestActiveCharacterShare(user);
  const characters = await baseCharacterWithShareQuery(activeShare)
    .leftJoin(activeShare, eq(activeShare.characterId, characterTable.id))
    .where(
      and(
        eq(characterTable.accessLevel, 'community'),
        excludeDeletedCharacters({ includeDeleted }),
      ),
    )
    .orderBy(desc(characterTable.createdAt));

  return characters;
}

/**
 * Retrieves all characters shared at the school level that are accessible to a user.
 *
 * This includes characters from other users who share at least one school with the requesting user.
 * This includes usage data from the SharedCharacterConversation table.
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

  const activeShare = latestActiveCharacterShare(user);
  const characters = await baseCharacterWithShareQuery(activeShare)
    .leftJoin(activeShare, eq(activeShare.characterId, characterTable.id))
    .where(
      and(
        arrayOverlaps(userTable.schoolIds, user.schoolIds),
        eq(characterTable.accessLevel, 'school'),
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
  const activeShare = latestActiveCharacterShare(user);
  const characters = await baseCharacterWithShareQuery(activeShare)
    .leftJoin(activeShare, eq(activeShare.characterId, characterTable.id))
    .where(
      and(
        eq(characterTable.userId, user.id),
        eq(characterTable.accessLevel, 'private'),
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
  const activeShare = latestActiveCharacterShare(user);
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
  const activeShare = latestActiveCharacterShare(user);
  return baseCharacterWithShareQuery(activeShare)
    .leftJoin(activeShare, eq(activeShare.characterId, characterTable.id))
    .leftJoin(
      characterTemplateMappingTable,
      eq(characterTemplateMappingTable.characterId, characterTable.id),
    )
    .where(
      and(
        or(
          and(eq(characterTable.userId, user.id), eq(characterTable.accessLevel, 'private')),
          user.schoolIds && user.schoolIds.length > 0
            ? and(
                eq(characterTable.accessLevel, 'school'),
                arrayOverlaps(userTable.schoolIds, user.schoolIds),
              )
            : undefined,
          eq(characterTable.accessLevel, 'community'),
          and(
            eq(characterTable.accessLevel, 'global'),
            eq(characterTemplateMappingTable.federalStateId, federalStateId),
          ),
        ),
        excludeDeletedCharacters({ includeDeleted }),
      ),
    )
    .orderBy(desc(characterTable.createdAt));
}

export async function dbGetCharacterByIdAndUser({
  characterId,
  user,
  includeDeleted,
}: {
  characterId: string;
  user: Pick<UserModel, 'id'>;
} & IncludeDeletedOption): Promise<CharacterWithShareDataModel | undefined> {
  const activeShare = latestActiveCharacterShare(user);
  const [row] = await baseCharacterWithShareQuery(activeShare)
    .innerJoin(activeShare, eq(activeShare.characterId, characterTable.id))
    .where(and(eq(characterTable.id, characterId), excludeDeletedCharacters({ includeDeleted })));
  return row;
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
    await tx.delete(fileTable).where(
      inArray(
        fileTable.id,
        relatedFiles.map((f) => f.id),
      ),
    );
    const deletedCharacter = (
      await tx
        .delete(characterTable)
        .where(and(eq(characterTable.id, characterId), eq(characterTable.userId, user.id)))
        .returning()
    )[0];

    if (deletedCharacter === undefined) {
      throw new Error('Could not delete character');
    }
    return deletedCharacter;
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
      tokenPointsLimit: sharedCharacterConversation.tokenPointsLimit,
      inviteCode: sharedCharacterConversation.inviteCode,
      maxUsageTimeLimit: sharedCharacterConversation.maxUsageTimeLimit,
      startedAt: sharedCharacterConversation.startedAt,
      expiredAt: sharedCharacterConversation.expiredAt,
      manuallyStoppedAt: sharedCharacterConversation.manuallyStoppedAt,
      startedBy: sharedCharacterConversation.userId,
      ownerSchoolIds: userTable.schoolIds,
    })
    .from(characterTable)
    .innerJoin(userTable, eq(characterTable.userId, userTable.id))
    .innerJoin(
      sharedCharacterConversation,
      eq(sharedCharacterConversation.characterId, characterTable.id),
    )
    .where(
      and(
        eq(characterTable.id, id),
        eq(sharedCharacterConversation.inviteCode, inviteCode),
        excludeDeletedCharacters({ includeDeleted }),
      ),
    );

  return row;
}

export async function dbUpdateTokenUsageByCharacterChatId(
  value: SharedCharacterChatUsageTrackingInsertModel,
) {
  const insertedUsage = (
    await db.insert(sharedCharacterChatUsageTrackingTable).values(value).returning()
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
      eq(characterTable.accessLevel, 'global'),
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
      accessLevel: 'private',
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
  const graceWindowStart = new Date(Date.now() - SHARE_EXTENSION_WINDOW_MS);

  const [share] = await db
    .select()
    .from(sharedCharacterConversation)
    .where(
      and(
        eq(sharedCharacterConversation.characterId, characterId),
        eq(sharedCharacterConversation.userId, user.id),
        isNull(sharedCharacterConversation.manuallyStoppedAt),
        gte(sharedCharacterConversation.expiredAt, graceWindowStart),
      ),
    )
    .orderBy(desc(sharedCharacterConversation.startedAt))
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
    .insert(sharedCharacterConversation)
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
    .update(sharedCharacterConversation)
    .set({ manuallyStoppedAt: new Date() })
    .where(eq(sharedCharacterConversation.id, shareId))
    .returning();

  return updatedShare ?? null;
}

/**
 * Extends the expiration timestamp of an already loaded manageable character share.
 * Respects the grace window, so a share that expired recently can still be extended.
 */
export async function dbExtendSharedCharacterConversationExpiration({
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
    .update(sharedCharacterConversation)
    .set({ expiredAt: newExpiredAt })
    .where(eq(sharedCharacterConversation.id, share.id))
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
    .update(sharedCharacterConversation)
    .set({ tokenPointsLimit })
    .where(eq(sharedCharacterConversation.id, latestManageableShare.id))
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
