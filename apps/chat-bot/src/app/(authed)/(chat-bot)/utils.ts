import { conversationSelectSchema } from '@shared/db/schema';
import { ConversationModel } from '@shared/db/types';
import { conversationTypeSchema } from '@shared/utils/chat';
import { z } from 'zod';

// Dates arrive as ISO strings over JSON, so they have to be coerced back
const conversationsResponseSchema = z.object({
  conversations: z.array(
    conversationSelectSchema.extend({
      createdAt: z.coerce.date(),
      deletedAt: z.coerce.date().nullable(),
      type: conversationTypeSchema,
    }),
  ),
});

export async function fetchClientSideConversations(): Promise<ConversationModel[]> {
  const response = await fetch('/api/conversations', { cache: 'no-store' });

  if (!response.ok) {
    throw new Error(`Failed to fetch conversations: ${response.status} ${response.statusText}`);
  }

  return conversationsResponseSchema.parse(await response.json()).conversations;
}
