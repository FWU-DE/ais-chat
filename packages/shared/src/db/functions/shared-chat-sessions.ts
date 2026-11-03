import { and, eq, gte, lt } from 'drizzle-orm';
import { db } from '..';
import { sharedChatSessionMessageTable, sharedChatSessionTable } from '../schema';

export type SharedChatSessionIdentity = {
  sessionId: string;
  inviteCode: string;
  entityType: 'character' | 'learningScenario';
  entityId: string;
};

export async function dbGetOrCreateSharedChatSession({
  sessionId,
  inviteCode,
  entityType,
  entityId,
  expiresAt,
}: SharedChatSessionIdentity & { expiresAt: Date }) {
  await db
    .insert(sharedChatSessionTable)
    .values({ id: sessionId, inviteCode, entityType, entityId, expiresAt })
    .onConflictDoNothing();

  const [session] = await db
    .select()
    .from(sharedChatSessionTable)
    .where(eq(sharedChatSessionTable.id, sessionId));

  if (
    session === undefined ||
    session.inviteCode !== inviteCode ||
    session.entityType !== entityType ||
    session.entityId !== entityId
  ) {
    return undefined;
  }

  if (session.expiresAt.getTime() !== expiresAt.getTime()) {
    await db
      .update(sharedChatSessionTable)
      .set({ expiresAt })
      .where(eq(sharedChatSessionTable.id, sessionId));
  }

  return session;
}

export async function dbGetSharedChatSession({
  sessionId,
  inviteCode,
  entityType,
  entityId,
}: SharedChatSessionIdentity) {
  const [session] = await db
    .select()
    .from(sharedChatSessionTable)
    .where(eq(sharedChatSessionTable.id, sessionId));

  if (
    session === undefined ||
    session.inviteCode !== inviteCode ||
    session.entityType !== entityType ||
    session.entityId !== entityId ||
    session.expiresAt <= new Date()
  ) {
    return undefined;
  }

  return session;
}

export async function dbGetSharedChatSessionMessages(sessionId: string) {
  return db
    .select()
    .from(sharedChatSessionMessageTable)
    .where(eq(sharedChatSessionMessageTable.sessionId, sessionId))
    .orderBy(sharedChatSessionMessageTable.orderNumber);
}

export async function dbReplaceSharedChatSessionMessages({
  sessionId,
  fromOrderNumber,
  messages,
}: {
  sessionId: string;
  fromOrderNumber: number;
  messages: Array<typeof sharedChatSessionMessageTable.$inferInsert>;
}) {
  await db.transaction(async (tx) => {
    await tx
      .delete(sharedChatSessionMessageTable)
      .where(
        and(
          eq(sharedChatSessionMessageTable.sessionId, sessionId),
          gte(sharedChatSessionMessageTable.orderNumber, fromOrderNumber),
        ),
      );

    if (messages.length > 0) {
      await tx.insert(sharedChatSessionMessageTable).values(messages);
    }

    await tx
      .update(sharedChatSessionTable)
      .set({ updatedAt: new Date() })
      .where(eq(sharedChatSessionTable.id, sessionId));
  });
}

export async function dbDeleteExpiredSharedChatSessions(cutoffDate: Date): Promise<number> {
  const deletedSessions = await db
    .delete(sharedChatSessionTable)
    .where(lt(sharedChatSessionTable.expiresAt, cutoffDate))
    .returning({ id: sharedChatSessionTable.id });

  return deletedSessions.length;
}
