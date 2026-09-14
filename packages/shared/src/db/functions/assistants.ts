import { db } from '..';
import {
  and,
  arrayOverlaps,
  desc,
  eq,
  getTableColumns,
  inArray,
  isNull,
  or,
  sql,
} from 'drizzle-orm';
import {
  conversationTable,
  AssistantFileMapping,
  type AssistantInsertModel,
  type AssistantSelectModel,
  assistantTable,
  assistantTemplateMappingTable,
  fileTable,
  userTable,
} from '../schema';
import { NotFoundError } from '@shared/error';
import { UserModel } from '@shared/auth/user-model';

type IncludeDeletedOption = {
  includeDeleted?: boolean;
};

function excludeDeletedAssistants(options?: IncludeDeletedOption) {
  return options?.includeDeleted ? undefined : eq(assistantTable.isDeleted, false);
}

function baseAssistantQuery() {
  return db
    .select({
      ...getTableColumns(assistantTable),
      ownerSchoolIds: sql<string[]>`coalesce(${userTable.schoolIds}, '{}'::text[])`,
    })
    .from(assistantTable)
    .leftJoin(userTable, eq(assistantTable.userId, userTable.id));
}

export async function dbGetAssistantsByUserId({
  user,
  includeDeleted,
}: {
  user: Pick<UserModel, 'id'>;
} & IncludeDeletedOption): Promise<AssistantSelectModel[]> {
  return baseAssistantQuery()
    .where(and(eq(assistantTable.userId, user.id), excludeDeletedAssistants({ includeDeleted })))
    .orderBy(desc(assistantTable.createdAt));
}

export async function dbGetAssistantById({
  assistantId,
  includeDeleted,
}: {
  assistantId: string;
} & IncludeDeletedOption): Promise<AssistantSelectModel> {
  const [assistant] = await baseAssistantQuery().where(
    and(eq(assistantTable.id, assistantId), excludeDeletedAssistants({ includeDeleted })),
  );

  if (!assistant) throw new NotFoundError('Assistant not found');

  return assistant;
}

export async function dbGetAssistantByIdForConversation({
  assistantId,
  conversationId,
  userId,
}: {
  assistantId: string;
  conversationId: string;
  userId: string;
}): Promise<AssistantSelectModel | undefined> {
  const [assistant] = await baseAssistantQuery()
    .innerJoin(conversationTable, eq(conversationTable.assistantId, assistantTable.id))
    .where(
      and(
        eq(assistantTable.id, assistantId),
        eq(conversationTable.id, conversationId),
        eq(conversationTable.userId, userId),
        isNull(conversationTable.deletedAt),
      ),
    );

  return assistant;
}

export async function dbGetAssistantsByIds({
  assistantIds,
  includeDeleted,
}: {
  assistantIds: string[];
} & IncludeDeletedOption): Promise<AssistantSelectModel[]> {
  if (assistantIds.length === 0) {
    return [];
  }

  return baseAssistantQuery().where(
    and(inArray(assistantTable.id, assistantIds), excludeDeletedAssistants({ includeDeleted })),
  );
}

export async function dbGetGlobalGpts({
  user,
  includeDeleted,
}: {
  user: Pick<UserModel, 'id' | 'schoolIds' | 'federalStateId'>;
} & IncludeDeletedOption): Promise<AssistantSelectModel[]> {
  const federalStateId = user.federalStateId;

  if (federalStateId) {
    return baseAssistantQuery()
      .innerJoin(
        assistantTemplateMappingTable,
        eq(assistantTemplateMappingTable.assistantId, assistantTable.id),
      )
      .where(
        and(
          eq(assistantTable.accessLevel, 'global'),
          eq(assistantTemplateMappingTable.federalStateId, federalStateId),
          excludeDeletedAssistants({ includeDeleted }),
        ),
      )
      .orderBy(desc(assistantTable.createdAt));
  } else {
    return baseAssistantQuery()
      .where(
        and(eq(assistantTable.accessLevel, 'global'), excludeDeletedAssistants({ includeDeleted })),
      )
      .orderBy(desc(assistantTable.createdAt));
  }
}

export async function dbGetCommunityGpts(
  options?: IncludeDeletedOption,
): Promise<AssistantSelectModel[]> {
  return baseAssistantQuery()
    .where(and(eq(assistantTable.accessLevel, 'community'), excludeDeletedAssistants(options)))
    .orderBy(desc(assistantTable.createdAt));
}

export async function dbGetGlobalAssistantByName({
  name,
  includeDeleted,
}: {
  name: string;
} & IncludeDeletedOption): Promise<AssistantSelectModel | undefined> {
  const [assistant] = await baseAssistantQuery().where(
    and(
      eq(assistantTable.name, name),
      eq(assistantTable.accessLevel, 'global'),
      excludeDeletedAssistants({ includeDeleted }),
    ),
  );
  return assistant;
}

export async function dbGetGptsByAssociatedSchools({
  user,
  includeDeleted,
}: {
  user: Pick<UserModel, 'schoolIds'>;
} & IncludeDeletedOption): Promise<AssistantSelectModel[]> {
  if (user.schoolIds.length === 0) {
    return [];
  }

  return baseAssistantQuery()
    .where(
      and(
        eq(assistantTable.accessLevel, 'school'),
        arrayOverlaps(userTable.schoolIds, user.schoolIds),
        excludeDeletedAssistants({ includeDeleted }),
      ),
    )
    .orderBy(desc(assistantTable.createdAt));
}

export async function dbGetGptsByUser({
  user,
  includeDeleted,
}: {
  user: Pick<UserModel, 'id'>;
} & IncludeDeletedOption): Promise<AssistantSelectModel[]> {
  return baseAssistantQuery()
    .where(
      and(
        eq(assistantTable.userId, user.id),
        eq(assistantTable.accessLevel, 'private'),
        excludeDeletedAssistants({ includeDeleted }),
      ),
    )
    .orderBy(desc(assistantTable.createdAt));
}

export async function dbGetAssistantByIdOrAssociatedSchool({
  assistantId,
  user,
  includeDeleted,
}: {
  assistantId: string;
  user: Pick<UserModel, 'id' | 'schoolIds'>;
} & IncludeDeletedOption) {
  const [assistant] = await baseAssistantQuery().where(
    and(
      or(
        and(
          eq(assistantTable.id, assistantId),
          eq(assistantTable.userId, user.id),
          eq(assistantTable.accessLevel, 'private'),
        ),
        user.schoolIds.length > 0
          ? and(
              eq(assistantTable.id, assistantId),
              eq(assistantTable.accessLevel, 'school'),
              arrayOverlaps(userTable.schoolIds, user.schoolIds),
            )
          : undefined,
        and(eq(assistantTable.id, assistantId), eq(assistantTable.accessLevel, 'community')),
        and(eq(assistantTable.id, assistantId), eq(assistantTable.accessLevel, 'global')),
      ),
      excludeDeletedAssistants({ includeDeleted }),
    ),
  );

  return assistant;
}

export async function dbUpsertAssistant({
  assistant,
}: {
  assistant: AssistantInsertModel;
}): Promise<AssistantSelectModel | undefined> {
  const [insertedAssistant] = await db
    .insert(assistantTable)
    .values(assistant)
    .onConflictDoUpdate({
      target: assistantTable.id,
      set: { ...assistant },
    })
    .returning();

  if (!insertedAssistant) throw new Error('Could not insert or update assistant');
  return dbGetAssistantById({ assistantId: insertedAssistant.id, includeDeleted: true });
}

export async function dbSetAssistantSuspended({ assistantId }: { assistantId: string }) {
  const [updatedAssistant] = await db
    .update(assistantTable)
    .set({
      suspended: true,
      accessLevel: 'private',
      hasLinkAccess: false,
    })
    .where(eq(assistantTable.id, assistantId))
    .returning();

  if (!updatedAssistant) {
    throw new NotFoundError('Assistant not found');
  }

  return dbGetAssistantById({ assistantId: updatedAssistant.id, includeDeleted: true });
}

export async function dbLiftSuspensionOnAssistant({ assistantId }: { assistantId: string }) {
  const [updatedAssistant] = await db
    .update(assistantTable)
    .set({ suspended: false })
    .where(eq(assistantTable.id, assistantId))
    .returning();

  if (!updatedAssistant) {
    throw new NotFoundError('Assistant not found');
  }

  return dbGetAssistantById({ assistantId: updatedAssistant.id, includeDeleted: true });
}

export async function dbDeleteAssistant({ assistantId }: { assistantId: string }) {
  await db.transaction(async (tx) => {
    await tx.delete(conversationTable).where(eq(conversationTable.assistantId, assistantId));
    await tx.delete(assistantTable).where(eq(assistantTable.id, assistantId));
  });
}

export async function dbDeleteAssistantByIdAndUser({
  gptId: gptId,
  user,
}: {
  gptId: string;
  user: Pick<UserModel, 'id'>;
}) {
  const [assistant] = await db
    .select()
    .from(assistantTable)
    .where(and(eq(assistantTable.id, gptId), eq(assistantTable.userId, user.id)));

  if (assistant === undefined) {
    throw new Error('Assistant does not exist');
  }

  const deletedAssistant = await db.transaction(async (tx) => {
    const relatedFiles = await tx
      .select({ id: AssistantFileMapping.fileId })
      .from(AssistantFileMapping)
      .where(eq(AssistantFileMapping.assistantId, assistant.id));
    await tx.delete(conversationTable).where(eq(conversationTable.assistantId, assistant.id));
    await tx.delete(AssistantFileMapping).where(eq(AssistantFileMapping.assistantId, assistant.id));
    await tx.delete(fileTable).where(
      inArray(
        fileTable.id,
        relatedFiles.map((f) => f.id),
      ),
    );
    const deletedAssistant = (
      await tx
        .delete(assistantTable)
        .where(and(eq(assistantTable.id, gptId), eq(assistantTable.userId, user.id)))
        .returning()
    )[0];

    if (deletedAssistant === undefined) {
      throw new Error('Could not delete assistant');
    }
    return deletedAssistant;
  });

  return deletedAssistant;
}

/**
 * adds a new file mapping entry
 */
export async function dbInsertAssistantFileMapping({
  fileId,
  assistantId,
}: {
  fileId: string;
  assistantId: string;
}) {
  const [insertedFileMapping] = await db
    .insert(AssistantFileMapping)
    .values({ fileId, assistantId })
    .returning();

  return insertedFileMapping;
}
