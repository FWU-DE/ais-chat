import { and, desc, eq, gt, isNull } from 'drizzle-orm';

import { logError } from '../../logging/logging';
import { isNotNull } from '../../utils/guard';
import { db } from '..';
import { conversationMessageTable, conversationTable } from '../schema';
import type { ConversationMessageModel, InsertConversationMessageModel } from '../types';

function logInsertConflicts({
  chatContents,
  insertedRows,
}: {
  chatContents: InsertConversationMessageModel[];
  insertedRows: Array<{ id: string; conversationId: string; orderNumber: number }>;
}) {
  const totalSkipped = chatContents.length - insertedRows.length;

  if (totalSkipped === 0) {
    return;
  }

  const insertedIds = new Set(insertedRows.map((row) => row.id));
  const insertedMessageKeys = new Set(
    insertedRows.map((row) => `${row.conversationId}:${row.orderNumber}`),
  );

  const skippedMessages = chatContents
    .filter((msg) => {
      if (msg.id) {
        return !insertedIds.has(msg.id);
      }
      return !insertedMessageKeys.has(`${msg.conversationId}:${msg.orderNumber}`);
    })
    .map((chatContent) => ({
      conversationId: chatContent.conversationId,
      messageId: chatContent.id,
      orderNumber: chatContent.orderNumber,
      role: chatContent.role,
      userId: chatContent.userId,
    }));

  if (chatContents.length === 1) {
    const skippedMessage = skippedMessages[0];

    if (skippedMessage) {
      logError('Skipped conversation message insert due to conflict.', undefined, skippedMessage);
      return;
    }

    logError('Skipped conversation message insert due to conflict.', undefined, { totalSkipped });
    return;
  }

  type LogDataType = Record<string, unknown>;
  const logData: LogDataType = {
    totalSkipped,
  };

  if (skippedMessages.length > 0) {
    logData.skippedMessages = skippedMessages;
  }

  logError('Skipped conversation message batch inserts due to conflict.', undefined, logData);
}

export async function dbGetOrCreateConversation({
  conversationId,
  userId,
  characterId,
  learningScenarioId,
  assistantId,
  type,
  name,
}: {
  conversationId: string;
  userId: string;
  characterId?: string;
  learningScenarioId?: string;
  assistantId?: string;
  type?: 'chat' | 'image-generation';
  name?: string;
}) {
  return (
    await db
      .insert(conversationTable)
      .values({
        id: conversationId,
        userId,
        characterId: characterId ?? null,
        learningScenarioId: learningScenarioId ?? null,
        assistantId: assistantId ?? null,
        type: type ?? 'chat',
        name: name ?? null,
      })
      .onConflictDoUpdate({
        target: conversationTable.id,
        set: { id: conversationId },
      })
      .returning()
  )[0];
}

export async function dbGetConversationMessages({
  userId,
  conversationId,
}: {
  userId: string;
  conversationId: string;
}): Promise<ConversationMessageModel[]> {
  const messages = await db
    .select()
    .from(conversationMessageTable)
    .innerJoin(conversationTable, eq(conversationMessageTable.conversationId, conversationTable.id))
    .where(
      and(
        eq(conversationMessageTable.conversationId, conversationId),
        eq(conversationTable.userId, userId),
        isNull(conversationMessageTable.deletedAt),
      ),
    )
    .orderBy(conversationMessageTable.orderNumber);

  return messages.map((message) => message.conversation_message);
}

export async function dbGetConversationMessageById({
  userId,
  conversationId,
  messageId,
}: {
  userId: string;
  conversationId: string;
  messageId: string;
}) {
  const [message] = await db
    .select({ message: conversationMessageTable })
    .from(conversationMessageTable)
    .innerJoin(conversationTable, eq(conversationMessageTable.conversationId, conversationTable.id))
    .where(
      and(
        eq(conversationMessageTable.id, messageId),
        eq(conversationMessageTable.conversationId, conversationId),
        eq(conversationTable.userId, userId),
        isNull(conversationMessageTable.deletedAt),
      ),
    );

  return message?.message;
}

export async function dbInsertChatContent(chatContent: InsertConversationMessageModel) {
  const [insertedMessage] = await db
    .insert(conversationMessageTable)
    .values(chatContent)
    .onConflictDoNothing()
    .returning();

  if (!insertedMessage) {
    logInsertConflicts({
      chatContents: [chatContent],
      insertedRows: [],
    });
  }

  return insertedMessage;
}

export async function dbInsertChatContentBatch(chatContents: InsertConversationMessageModel[]) {
  const insertedRows = await db
    .insert(conversationMessageTable)
    .values(chatContents)
    .onConflictDoNothing()
    .returning({
      id: conversationMessageTable.id,
      conversationId: conversationMessageTable.conversationId,
      orderNumber: conversationMessageTable.orderNumber,
    });

  if (insertedRows.length !== chatContents.length) {
    logInsertConflicts({ chatContents, insertedRows });
  }

  return insertedRows;
}

export async function dbGetConversations(userId: string) {
  return db
    .select()
    .from(conversationTable)
    .where(and(eq(conversationTable.userId, userId), isNull(conversationTable.deletedAt)))
    .orderBy(desc(conversationTable.createdAt));
}

export async function dbGetConversationById(conversationId: string) {
  return (
    await db
      .select()
      .from(conversationTable)
      .where(and(eq(conversationTable.id, conversationId), isNull(conversationTable.deletedAt)))
  )[0];
}

export async function dbUpdateConversationTitle({
  conversationId,
  name,
  userId,
}: {
  name: string;
  conversationId: string;
  userId: string;
}) {
  const [updatedRow] = await db
    .update(conversationTable)
    .set({ name })
    .where(
      and(
        eq(conversationTable.id, conversationId),
        isNull(conversationTable.deletedAt),
        eq(conversationTable.userId, userId),
      ),
    )
    .returning();

  return updatedRow;
}

export async function dbDeleteConversation(conversationId: string) {
  await db
    .update(conversationMessageTable)
    .set({ content: ' ', deletedAt: new Date() })
    .where(eq(conversationMessageTable.conversationId, conversationId));
  await db
    .update(conversationTable)
    .set({ name: ' ', deletedAt: new Date() })
    .where(eq(conversationTable.id, conversationId));
}

export async function dbDeleteRegeneratedConversationMessage({
  conversationId,
  orderNumber,
}: {
  conversationId: string;
  orderNumber: number;
}) {
  await db
    .update(conversationMessageTable)
    .set({ content: ' ', deletedAt: new Date() })
    .where(
      and(
        eq(conversationMessageTable.conversationId, conversationId),
        gt(conversationMessageTable.orderNumber, orderNumber),
        isNull(conversationMessageTable.deletedAt),
      ),
    );
}

export async function dbGetConversationAndMessages({
  conversationId,
  userId,
}: {
  conversationId: string;
  userId: string;
}) {
  const rows = await db
    .select()
    .from(conversationTable)
    .leftJoin(
      conversationMessageTable,
      and(
        eq(conversationTable.id, conversationMessageTable.conversationId),
        isNull(conversationMessageTable.deletedAt),
      ),
    )
    .where(
      and(
        eq(conversationTable.id, conversationId),
        eq(conversationTable.userId, userId),
        isNull(conversationTable.deletedAt),
      ),
    )
    .orderBy(conversationMessageTable.orderNumber);

  const firstRow = rows[0];

  if (firstRow === undefined) {
    return undefined;
  }

  const nonNullMessages = rows.map((r) => r.conversation_message).filter(isNotNull);
  return {
    conversation: firstRow.conversation,
    messages: nonNullMessages,
  };
}
