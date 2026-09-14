import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '..';
import {
  ConversationMessageFileMappingTable,
  conversationMessageTable,
  conversationTable,
  fileTable,
  sharedCharacterConversation,
  sharedLearningScenarioTable,
} from '../schema';
import { deleteFilesFromS3 } from '../../s3';

export async function dbDeleteConversationByIdAndUserId({
  conversationId,
  userId,
}: {
  conversationId: string;
  userId: string;
}) {
  return await db.transaction(async (tx) => {
    await tx
      .update(conversationMessageTable)
      .set({ content: ' ', deletedAt: new Date() })
      .where(eq(conversationMessageTable.conversationId, conversationId));
    const deletedConversation = (
      await tx
        .update(conversationTable)
        .set({ name: ' ', deletedAt: new Date() })
        .where(and(eq(conversationTable.id, conversationId), eq(conversationTable.userId, userId)))
        .returning()
    )[0];

    if (deletedConversation === undefined) {
      throw new Error('Could not delete the conversation');
    }

    const filesToDelete = Array.from(
      new Set(
        (
          await tx
            .select({ fileId: ConversationMessageFileMappingTable.fileId })
            .from(ConversationMessageFileMappingTable)
            .where(eq(ConversationMessageFileMappingTable.conversationId, conversationId))
        ).map((f) => f.fileId),
      ),
    );
    await deleteFilesFromS3(filesToDelete);
    await tx
      .delete(ConversationMessageFileMappingTable)
      .where(inArray(ConversationMessageFileMappingTable.fileId, filesToDelete));
    await tx.delete(fileTable).where(inArray(fileTable.id, filesToDelete));

    return deletedConversation;
  });
}

export async function dbDeleteOutdatedConversations() {
  const query = sql`
WITH updated_conversations AS (
  UPDATE conversation c
  SET deleted_at = CURRENT_TIMESTAMP
  FROM user_entity u
  LEFT JOIN federal_state fs ON u.federal_state_id = fs.id
  WHERE c.user_id = u.id
    AND c.deleted_at IS NULL
    AND (
      u.federal_state_id IS NULL
      OR c.created_at < CURRENT_TIMESTAMP - (fs.chat_storage_time * INTERVAL '1 day')
    )
  RETURNING c.id
),
updated_messages AS (
  UPDATE conversation_message cm
  SET content = ''
  FROM updated_conversations uc
  WHERE cm.conversation_id = uc.id
  RETURNING cm.id
)
SELECT
  (SELECT COUNT(*) FROM updated_conversations) AS conversations_deleted,
  (SELECT COUNT(*) FROM updated_messages) AS messages_emptied;`;

  const result = await db.execute(query);

  const deletedCount = Number(result.rows[0]?.['conversations_deleted']);
  return deletedCount;
}

/**
 * @returns true if the invite code exists in either the sharedCharacterConversation
 * or sharedLearningScenarioTable, false otherwise.
 */
export async function dbDoesInviteCodeExist(inviteCode: string) {
  const result = await db
    .select({ inviteCode: sharedCharacterConversation.inviteCode })
    .from(sharedCharacterConversation)
    .where(eq(sharedCharacterConversation.inviteCode, inviteCode))
    .union(
      db
        .select({ inviteCode: sharedLearningScenarioTable.inviteCode })
        .from(sharedLearningScenarioTable)
        .where(eq(sharedLearningScenarioTable.inviteCode, inviteCode)),
    );
  return result.length > 0;
}
