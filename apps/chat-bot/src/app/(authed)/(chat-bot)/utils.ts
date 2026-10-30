import { ConversationModel } from '@shared/db/types';

export async function fetchClientSideConversations(): Promise<ConversationModel[]> {
  const response = await fetch('/api/conversations', { cache: 'no-store' });

  if (!response.ok) {
    throw new Error(`Failed to fetch conversations: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const conversations = data.conversations as ConversationModel[];

  return Array.isArray(conversations)
    ? conversations.map((conversation) => ({
        ...conversation,
        createdAt: new Date(conversation.createdAt),
      }))
    : [];
}
