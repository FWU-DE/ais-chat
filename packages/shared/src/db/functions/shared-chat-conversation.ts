import { and, eq, exists, gte, lt, max, or } from 'drizzle-orm';

import { db } from '..';
import {
  sharedCharacter,
  SharedChatConversationMessageFileMappingTable,
  sharedChatConversationMessageTable,
  sharedChatConversationTable,
  sharedLearningScenarioTable,
} from '../schema';
import type { PgTransactionObject } from '../types';

async function lockSharedChatConversation(
  tx: PgTransactionObject,
  conversationId: string,
): Promise<void> {
  const [conversation] = await tx
    .select({ id: sharedChatConversationTable.id })
    .from(sharedChatConversationTable)
    .where(eq(sharedChatConversationTable.id, conversationId))
    .for('update');

  if (conversation === undefined) {
    throw new Error('Shared chat conversation no longer exists');
  }
}

async function getNextMessageOrderNumber(
  tx: PgTransactionObject,
  conversationId: string,
): Promise<number> {
  const [lastMessage] = await tx
    .select({ orderNumber: max(sharedChatConversationMessageTable.orderNumber) })
    .from(sharedChatConversationMessageTable)
    .where(eq(sharedChatConversationMessageTable.conversationId, conversationId));

  return (lastMessage?.orderNumber ?? -1) + 1;
}

async function findShareId({
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
    return share?.id;
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
  return share?.id;
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
  const shareId = await findShareId({ inviteCode, entityType, entityId });
  if (shareId === undefined) {
    return undefined;
  }

  await db
    .insert(sharedChatConversationTable)
    .values({ id: conversationId, entityType, shareId })
    .onConflictDoNothing();

  const [conversation] = await db
    .select()
    .from(sharedChatConversationTable)
    .where(eq(sharedChatConversationTable.id, conversationId));

  if (
    conversation === undefined ||
    conversation.entityType !== entityType ||
    conversation.shareId !== shareId
  ) {
    return undefined;
  }

  return conversation;
}

export async function dbGetSharedChatConversation({
  conversationId,
  inviteCode,
  entityType,
  entityId,
}: SharedChatConversationIdentity) {
  const shareId = await findShareId({ inviteCode, entityType, entityId });
  if (shareId === undefined) {
    return undefined;
  }

  const [conversation] = await db
    .select()
    .from(sharedChatConversationTable)
    .where(eq(sharedChatConversationTable.id, conversationId));

  if (
    conversation === undefined ||
    conversation.entityType !== entityType ||
    conversation.shareId !== shareId
  ) {
    return undefined;
  }

  return conversation;
}

export async function dbGetSharedChatConversationMessages(conversationId: string) {
  return db
    .select()
    .from(sharedChatConversationMessageTable)
    .where(eq(sharedChatConversationMessageTable.conversationId, conversationId))
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

    const conversationMessages = await tx
      .select()
      .from(sharedChatConversationMessageTable)
      .where(eq(sharedChatConversationMessageTable.conversationId, conversationId))
      .orderBy(sharedChatConversationMessageTable.orderNumber);

    const existingUserMessage = conversationMessages.find(
      (message) => message.id === userMessage.id,
    );

    if (existingUserMessage !== undefined) {
      await tx
        .delete(sharedChatConversationMessageTable)
        .where(
          and(
            eq(sharedChatConversationMessageTable.conversationId, conversationId),
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
      conversationId: conversationId,
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

function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: unknown; cause?: { code?: unknown } } | null)?.code;
  const causeCode = (error as { cause?: { code?: unknown } } | null)?.cause?.code;
  return code === '23505' || causeCode === '23505';
}

/**
 * Appends messages at the order numbers reserved when the turn was prepared.
 * Returns false if those positions were taken in the meantime (a retry or a newer turn),
 * in which case nothing is written.
 */
export async function dbAppendSharedChatConversationMessages({
  firstOrderNumber,
  messages,
}: {
  firstOrderNumber: number;
  messages: Array<Omit<typeof sharedChatConversationMessageTable.$inferInsert, 'orderNumber'>>;
}): Promise<boolean> {
  if (messages.length === 0) {
    return true;
  }

  try {
    await db.insert(sharedChatConversationMessageTable).values(
      messages.map((message, index) => ({
        ...message,
        orderNumber: firstOrderNumber + index,
      })),
    );
    return true;
  } catch (error) {
    if (isUniqueViolation(error)) {
      return false;
    }
    throw error;
  }
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
                  eq(sharedCharacter.id, sharedChatConversationTable.shareId),
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
                  eq(sharedLearningScenarioTable.id, sharedChatConversationTable.shareId),
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
