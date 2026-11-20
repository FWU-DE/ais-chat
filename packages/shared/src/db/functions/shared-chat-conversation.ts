import { and, eq, exists, gt, inArray, lt, notExists, or } from 'drizzle-orm';

import { db } from '..';
import {
  InsertSharedChatConversationMessageModel,
  sharedCharacter,
  SharedChatConversationMessageFileMappingTable,
  sharedChatConversationMessageTable,
  sharedChatConversationTable,
  sharedLearningScenarioTable,
} from '../schema';

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
  const mappings = await db
    .select({
      messageId: SharedChatConversationMessageFileMappingTable.conversationMessageId,
      fileId: SharedChatConversationMessageFileMappingTable.fileId,
    })
    .from(SharedChatConversationMessageFileMappingTable)
    .where(eq(SharedChatConversationMessageFileMappingTable.conversationId, conversationId));

  // Files that are uploaded but not attached to a message yet have no message id
  return mappings.flatMap(({ messageId, fileId }) =>
    messageId === null ? [] : [{ messageId, fileId }],
  );
}

export async function dbDeleteRegeneratedSharedChatMessages({
  conversationId,
  orderNumber,
}: {
  conversationId: string;
  orderNumber: number;
}) {
  await db
    .delete(sharedChatConversationMessageTable)
    .where(
      and(
        eq(sharedChatConversationMessageTable.conversationId, conversationId),
        gt(sharedChatConversationMessageTable.orderNumber, orderNumber),
      ),
    );
}

export async function dbInsertSharedChatContent(
  chatContent: InsertSharedChatConversationMessageModel,
) {
  const [insertedMessage] = await db
    .insert(sharedChatConversationMessageTable)
    .values(chatContent)
    .onConflictDoNothing()
    .returning();

  return insertedMessage;
}

export async function dbInsertSharedChatContentBatch(
  chatContents: InsertSharedChatConversationMessageModel[],
) {
  if (chatContents.length === 0) {
    return [];
  }

  return db
    .insert(sharedChatConversationMessageTable)
    .values(chatContents)
    .onConflictDoNothing()
    .returning({
      id: sharedChatConversationMessageTable.id,
      conversationId: sharedChatConversationMessageTable.conversationId,
      orderNumber: sharedChatConversationMessageTable.orderNumber,
    });
}

export async function dbGetSharedChatFileConversationIds(fileIds: string[]) {
  if (fileIds.length === 0) return [];

  return db
    .selectDistinct({
      fileId: SharedChatConversationMessageFileMappingTable.fileId,
      conversationId: SharedChatConversationMessageFileMappingTable.conversationId,
    })
    .from(SharedChatConversationMessageFileMappingTable)
    .where(inArray(SharedChatConversationMessageFileMappingTable.fileId, fileIds));
}

/**
 * Deletes conversations whose share expired before the cutoff and returns the ids of the
 * files that were attached to them. The files are no longer referenced afterwards.
 */
export async function dbDeleteExpiredSharedChatConversations(
  cutoffDate: Date,
): Promise<{ deletedConversations: number; fileIds: string[] }> {
  const expiredCondition = or(
    and(
      eq(sharedChatConversationTable.entityType, 'character'),
      or(
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
        // The share was deleted together with its character
        notExists(
          db
            .select({ id: sharedCharacter.id })
            .from(sharedCharacter)
            .where(eq(sharedCharacter.id, sharedChatConversationTable.shareId)),
        ),
      ),
    ),
    and(
      eq(sharedChatConversationTable.entityType, 'learningScenario'),
      or(
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
        // The share was deleted together with its learning scenario
        notExists(
          db
            .select({ id: sharedLearningScenarioTable.id })
            .from(sharedLearningScenarioTable)
            .where(eq(sharedLearningScenarioTable.id, sharedChatConversationTable.shareId)),
        ),
      ),
    ),
  );

  return db.transaction(async (tx) => {
    const expired = await tx
      .select({ id: sharedChatConversationTable.id })
      .from(sharedChatConversationTable)
      .where(expiredCondition);
    const conversationIds = expired.map((conversation) => conversation.id);
    if (conversationIds.length === 0) {
      return { deletedConversations: 0, fileIds: [] };
    }

    const files = await tx
      .selectDistinct({ fileId: SharedChatConversationMessageFileMappingTable.fileId })
      .from(SharedChatConversationMessageFileMappingTable)
      .where(
        inArray(SharedChatConversationMessageFileMappingTable.conversationId, conversationIds),
      );

    await tx
      .delete(sharedChatConversationTable)
      .where(inArray(sharedChatConversationTable.id, conversationIds));

    return {
      deletedConversations: conversationIds.length,
      fileIds: files.map((file) => file.fileId),
    };
  });
}
