import { anonymizeText } from '@shared/anonymization/anonymize';
import type { AnonymizationMode } from '@shared/anonymization/types';

import { env } from '@/env';
import type { ChatMessage } from '@/types/chat';

/**
 * Anonymizes user-provided text before it is persisted or processed by AI services
 * (see docs/pii-anonymization.md). Uses the built-in pattern recognizers and, when
 * ANONYMIZATION_SERVICE_URL is configured, a Presidio analyzer for NER-based
 * detection of person names. Presidio failures propagate so the request fails closed.
 */
export async function anonymizeUserContent(
  text: string,
  mode: AnonymizationMode = 'placeholder',
): Promise<string> {
  return anonymizeText({
    text,
    mode,
    presidioUrl: env.anonymizationServiceUrl,
    language: env.anonymizationLanguage,
  });
}

/**
 * Anonymizes all user messages in a chat history. Needed for the shared chat flows
 * (character / learning scenario), where the history is not persisted server-side
 * and the client resends the original messages on every turn.
 */
export async function anonymizeChatMessages(
  messages: ChatMessage[],
  mode: AnonymizationMode = 'placeholder',
): Promise<ChatMessage[]> {
  return Promise.all(
    messages.map(async (message) =>
      message.role === 'user'
        ? { ...message, content: await anonymizeUserContent(message.content, mode) }
        : message,
    ),
  );
}
