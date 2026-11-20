import { and, eq } from 'drizzle-orm';

import { db } from '..';
import { conversationTable, personalContextTable } from '../schema';

export async function dbGetPersonalContextByUserId({ userId }: { userId: string }) {
  const [personalContext] = await db
    .select()
    .from(personalContextTable)
    .where(eq(personalContextTable.userId, userId));

  return personalContext;
}

export async function dbUpsertPersonalContent({
  userId,
  content,
}: {
  userId: string;
  content: string;
}) {
  const [personalContext] = await db
    .insert(personalContextTable)
    .values({ userId, content })
    .onConflictDoUpdate({
      target: personalContextTable.userId,
      set: { content, updatedAt: new Date() },
    })
    .returning();

  return personalContext;
}

export async function dbSetPersonalContextEnabled({
  userId,
  enabled,
}: {
  userId: string;
  enabled: boolean;
}) {
  const [personalContext] = await db
    .insert(personalContextTable)
    .values({ userId, enabled })
    .onConflictDoUpdate({
      target: personalContextTable.userId,
      set: { enabled, updatedAt: new Date() },
    })
    .returning();

  return personalContext;
}

export async function dbSetConversationPersonalContextEnabled({
  conversationId,
  userId,
  enabled,
}: {
  conversationId: string;
  userId: string;
  enabled: boolean | null;
}) {
  const [conversation] = await db
    .update(conversationTable)
    .set({ personalContextEnabled: enabled })
    .where(and(eq(conversationTable.id, conversationId), eq(conversationTable.userId, userId)))
    .returning();

  return conversation;
}
