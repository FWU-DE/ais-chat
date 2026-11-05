import { and, eq, exists, gte, lt, max, or } from 'drizzle-orm';
import { db } from '..';
import {
  sharedChatConversationMessageTable,
  sharedChatConversationTable,
  SharedChatConversationMessageFileMappingTable,
  sharedCharacter,
  sharedLearningScenarioTable,
} from '../schema';
import type { PgTransactionObject } from '../types';

async function lockSharedChatConversation(
  tx: PgTransactionObject,
  conversationId: string,
): Promise<void> {
  const [session] = await tx
    .update(sharedChatConversationTable)
    .set({ updatedAt: new Date() })
    .where(eq(sharedChatConversationTable.id, conversationId))
    .returning({ id: sharedChatConversationTable.id });

  if (session === undefined) {
    throw new Error('Shared chat session no longer exists');
  }
}

async function getNextMessageOrderNumber(
  tx: PgTransactionObject,
  conversationId: string,
): Promise<number> {
  const [lastMessage] = await tx
    .select({ orderNumber: max(sharedChatConversationMessageTable.orderNumber) })
    .from(sharedChatConversationMessageTable)
    .where(eq(sharedChatConversationMessageTable.sessionId, conversationId));

  return (lastMessage?.orderNumber ?? -1) + 1;
}

async function sharedChatInviteMatches({
  inviteCode,
  entityType,
  entityId,
}: Pick<SharedChatConversationIdentity, 'inviteCode' | 'entityType' | 'entityId'>) {
  if (entityType === 'character') {
    const [share] = await db
      .select({ id: sharedCharacter.id })
      .from(sharedCharacter)
      .where(
        and(eq(sharedCharacter.characterId, entityId), eq(sharedCharacter.inviteCode, inviteCode)),
      );
    return share !== undefined;
  }

  const [share] = await db
    .select({ id: sharedLearningScenarioTable.id })
    .from(sharedLearningScenarioTable)
    .where(
      and(
        eq(sharedLearningScenarioTable.learningScenarioId, entityId),
        eq(sharedLearningScenarioTable.inviteCode, inviteCode),
      ),
    );
  return share !== undefined;
}

export type SharedChatConversationIdentity = {
  conversationId: string;
  inviteCode: string;
  entityType: 'character' | 'learningScenario';
  entityId: string;
};

export async function dbGetOrCreateSharedChatConversation({
  conversationId,
  inviteCode,
  entityType,
  entityId,
}: SharedChatConversationIdentity) {
  if (!(await sharedChatInviteMatches({ inviteCode, entityType, entityId }))) {
    return undefined;
  }

  await db
    .insert(sharedChatConversationTable)
    .values({ id: conversationId, entityType, entityId })
    .onConflictDoNothing();

  const [session] = await db
    .select()
    .from(sharedChatConversationTable)
    .where(eq(sharedChatConversationTable.id, conversationId));

  if (session === undefined || session.entityType !== entityType || session.entityId !== entityId) {
    return undefined;
  }

  return session;
}

export async function dbGetSharedChatConversation({
  conversationId,
  inviteCode,
  entityType,
  entityId,
}: SharedChatConversationIdentity) {
  if (!(await sharedChatInviteMatches({ inviteCode, entityType, entityId }))) {
    return undefined;
  }

  const [session] = await db
    .select()
    .from(sharedChatConversationTable)
    .where(eq(sharedChatConversationTable.id, conversationId));

  if (session === undefined || session.entityType !== entityType || session.entityId !== entityId) {
    return undefined;
  }

  return session;
}

export async function dbGetSharedChatConversationMessages(conversationId: string) {
  return db
    .select()
    .from(sharedChatConversationMessageTable)
    .where(eq(sharedChatConversationMessageTable.sessionId, conversationId))
    .orderBy(sharedChatConversationMessageTable.orderNumber);
}

export async function dbGetSharedChatConversationMessageFileIds(conversationId: string) {
  return db
    .select({
      messageId: SharedChatConversationMessageFileMappingTable.conversationMessageId,
      fileId: SharedChatConversationMessageFileMappingTable.fileId,
    })
    .from(SharedChatConversationMessageFileMappingTable)
    .where(eq(SharedChatConversationMessageFileMappingTable.conversationId, conversationId));
}

export async function dbPrepareSharedChatConversation({
  conversationId,
  userMessage,
  fileIds,
}: {
  conversationId: string;
  userMessage: { id: string; content: string };
  fileIds?: string[];
}) {
  return db.transaction(async (tx) => {
    await lockSharedChatConversation(tx, conversationId);

    const sessionMessages = await tx
      .select()
      .from(sharedChatConversationMessageTable)
      .where(eq(sharedChatConversationMessageTable.sessionId, conversationId))
      .orderBy(sharedChatConversationMessageTable.orderNumber);

    const existingUserMessage = sessionMessages.find((message) => message.id === userMessage.id);

    if (existingUserMessage !== undefined) {
      await tx
        .delete(sharedChatConversationMessageTable)
        .where(
          and(
            eq(sharedChatConversationMessageTable.sessionId, conversationId),
            gte(
              sharedChatConversationMessageTable.orderNumber,
              existingUserMessage.orderNumber + 1,
            ),
          ),
        );

      return {
        userOrderNumber: existingUserMessage.orderNumber,
        isRetry: true,
      };
    }

    const userOrderNumber = await getNextMessageOrderNumber(tx, conversationId);
    await tx.insert(sharedChatConversationMessageTable).values({
      id: userMessage.id,
      sessionId: conversationId,
      content: userMessage.content,
      role: 'user',
      orderNumber: userOrderNumber,
      toolCalls: null,
      toolCallId: null,
    });
    if (fileIds !== undefined && fileIds.length > 0) {
      await tx.insert(SharedChatConversationMessageFileMappingTable).values(
        fileIds.map((fileId) => ({
          fileId,
          conversationMessageId: userMessage.id,
          conversationId,
        })),
      );
    }

    return {
      userOrderNumber,
      isRetry: false,
    };
  });
}

export async function dbAppendSharedChatConversationMessages({
  conversationId,
  messages,
}: {
  conversationId: string;
  messages: Array<Omit<typeof sharedChatConversationMessageTable.$inferInsert, 'orderNumber'>>;
}) {
  await db.transaction(async (tx) => {
    await lockSharedChatConversation(tx, conversationId);
    const firstOrderNumber = await getNextMessageOrderNumber(tx, conversationId);

    if (messages.length > 0) {
      await tx.insert(sharedChatConversationMessageTable).values(
        messages.map((message, index) => ({
          ...message,
          orderNumber: firstOrderNumber + index,
        })),
      );
    }
  });
}

export async function dbDeleteExpiredSharedChatConversations(cutoffDate: Date): Promise<number> {
  const deletedSessions = await db
    .delete(sharedChatConversationTable)
    .where(
      or(
        and(
          eq(sharedChatConversationTable.entityType, 'character'),
          exists(
            db
              .select({ id: sharedCharacter.id })
              .from(sharedCharacter)
              .where(
                and(
                  eq(sharedCharacter.characterId, sharedChatConversationTable.entityId),
                  lt(sharedCharacter.expiredAt, cutoffDate),
                ),
              ),
          ),
        ),
        and(
          eq(sharedChatConversationTable.entityType, 'learningScenario'),
          exists(
            db
              .select({ id: sharedLearningScenarioTable.id })
              .from(sharedLearningScenarioTable)
              .where(
                and(
                  eq(
                    sharedLearningScenarioTable.learningScenarioId,
                    sharedChatConversationTable.entityId,
                  ),
                  lt(sharedLearningScenarioTable.expiredAt, cutoffDate),
                ),
              ),
          ),
        ),
      ),
    )
    .returning({ id: sharedChatConversationTable.id });

  return deletedSessions.length;
}
