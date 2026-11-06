import { and, eq, exists, gte, lt, max, or, sql } from 'drizzle-orm';

import { db } from '..';
import {
  sharedCharacter,
  SharedChatConversationMessageFileMappingTable,
  sharedChatConversationMessageTable,
  sharedChatConversationTable,
  sharedLearningScenarioTable,
} from '../schema';
import type { PgTransactionObject } from '../types';

/**
 * Takes the row lock for the conversation and returns its current generation.
 * With `bumpGeneration`, the generation is incremented so that earlier in-flight
 * generations can no longer append their results.
 */
async function lockSharedChatConversation(
  tx: PgTransactionObject,
  conversationId: string,
  { bumpGeneration = false }: { bumpGeneration?: boolean } = {},
): Promise<number> {
  const [conversation] = await tx
    .update(sharedChatConversationTable)
    .set({
      updatedAt: new Date(),
      ...(bumpGeneration ? { generation: sql`${sharedChatConversationTable.generation} + 1` } : {}),
    })
    .where(eq(sharedChatConversationTable.id, conversationId))
    .returning({ generation: sharedChatConversationTable.generation });

  if (conversation === undefined) {
    throw new Error('Shared chat conversation no longer exists');
  }

  return conversation.generation;
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

  const [conversation] = await db
    .select()
    .from(sharedChatConversationTable)
    .where(eq(sharedChatConversationTable.id, conversationId));

  if (
    conversation === undefined ||
    conversation.entityType !== entityType ||
    conversation.entityId !== entityId
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
  if (!(await sharedChatInviteMatches({ inviteCode, entityType, entityId }))) {
    return undefined;
  }

  const [conversation] = await db
    .select()
    .from(sharedChatConversationTable)
    .where(eq(sharedChatConversationTable.id, conversationId));

  if (
    conversation === undefined ||
    conversation.entityType !== entityType ||
    conversation.entityId !== entityId
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
    const generation = await lockSharedChatConversation(tx, conversationId, {
      bumpGeneration: true,
    });

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
        generation,
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
      generation,
    };
  });
}

/**
 * Appends messages unless a newer turn was prepared since `expectedGeneration` was issued.
 * Returns false if the completion was stale and nothing was written.
 */
export async function dbAppendSharedChatConversationMessages({
  conversationId,
  expectedGeneration,
  messages,
}: {
  conversationId: string;
  expectedGeneration: number;
  messages: Array<Omit<typeof sharedChatConversationMessageTable.$inferInsert, 'orderNumber'>>;
}): Promise<boolean> {
  return db.transaction(async (tx) => {
    const generation = await lockSharedChatConversation(tx, conversationId);
    if (generation !== expectedGeneration) {
      return false;
    }
    const firstOrderNumber = await getNextMessageOrderNumber(tx, conversationId);

    if (messages.length > 0) {
      await tx.insert(sharedChatConversationMessageTable).values(
        messages.map((message, index) => ({
          ...message,
          orderNumber: firstOrderNumber + index,
        })),
      );
    }

    return true;
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
