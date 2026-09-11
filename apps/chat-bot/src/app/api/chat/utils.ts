import { logError } from '@shared/logging';
import { env as imageAttachmentEnv } from './image-attachment-env';
import { type ChatMessage } from '@/types/chat';
import {
  generateTextWithBilling,
  type Message as AiCoreMessage,
  isChatImageAttachment,
} from '@ais-chat/ai-core';
import { TOTAL_CHAT_LENGTH_LIMIT } from '@/configuration-text-inputs/const';
import { type FileModel, LlmModelSelectModel } from '@shared/db/schema';
import { UnexpectedError } from '@shared/error/unexpected-error';
import { ChatAttachmentWithMessageId } from '../file-operations/preprocess-image';
import he from 'he';

export type FileWithConversationMessageId = FileModel & { conversationMessageId?: string };

/**
 * Adds attached filenames to copies of user messages before they are sent to the model.
 * The original messages remain unchanged, and files without a matching message are ignored.
 */
export function annotateMessageAttachmentNames(
  messages: ChatMessage[],
  files: FileWithConversationMessageId[],
): ChatMessage[] {
  // Group filenames by the message they were attached to.
  const namesByMessageId = new Map<string, string[]>();
  for (const file of files) {
    if (file.conversationMessageId === undefined) {
      continue;
    }
    const names = namesByMessageId.get(file.conversationMessageId) ?? [];
    names.push(file.name);
    namesByMessageId.set(file.conversationMessageId, names);
  }

  // Add each group of filenames to a copy of its matching user message.
  return messages.map((message) => {
    if (message.role !== 'user') {
      return message;
    }
    const names = namesByMessageId.get(message.id);
    if (names === undefined || names.length === 0) {
      return message;
    }
    const attachmentData = names
      .sort()
      .map((name) => `  <attachment>${he.escape(name)}</attachment>`)
      .join('\n');
    return {
      ...message,
      content: `${message.content}\n\n<attachments>\n${attachmentData}\n</attachments>`,
    };
  });
}

/**
 * Enrich messages with image data from attachments.
 * If the model supports images, it adds either the image URL
 * or the base64-encoded image data to the message, depending on the model's requirements.
 */
export function enrichMessagesWithImageData(
  messages: ChatMessage[],
  images: ChatAttachmentWithMessageId[],
  modelSupportsImages: boolean,
  imageIntegrationType: 'url' | 'base64',
): ChatMessage[] {
  if (!modelSupportsImages || images.length === 0) {
    return messages;
  }

  const messagesWithImages: ChatMessage[] = [...messages];

  for (const message of messagesWithImages) {
    if (message.role !== 'user') {
      continue;
    }

    const relatedImages = images.filter((img) => img.messageId === message.id);

    if (relatedImages.length === 0) {
      continue;
    }
    message.attachments = relatedImages.map((image) => {
      if (isChatImageAttachment(image)) return image;

      throw new UnexpectedError(`Unsupported image integration type: ${imageIntegrationType}`);
    });
  }

  return messagesWithImages;
}

export function getMostRecentUserMessage(messages: Array<ChatMessage>) {
  const userMessages = messages.filter((message) => message.role === 'user');
  return userMessages.at(-1);
}

export function consolidateMessages(messages: Array<ChatMessage>): Array<ChatMessage> {
  const consolidatedMessages: Array<ChatMessage> = [];

  for (let i = 0; i < messages.length; i++) {
    const currentMessage = messages[i];
    if (currentMessage === undefined) {
      continue;
    }
    const prevMessage = consolidatedMessages[consolidatedMessages.length - 1];

    // If this message has the same role as the previous one, merge them
    // Do not merge tool-related messages (they carry toolCalls/toolCallId that must stay separate)
    const isToolRelated =
      currentMessage.role === 'tool' ||
      currentMessage.toolCalls?.length ||
      prevMessage?.toolCalls?.length;

    if (prevMessage && prevMessage.role === currentMessage?.role && !isToolRelated) {
      prevMessage.content += '\n\n' + currentMessage.content;
    } else {
      // Otherwise add as a new message
      consolidatedMessages.push({ ...currentMessage });
    }
  }

  return consolidatedMessages;
}

export type MessageBlock = {
  messages: ChatMessage[];
  charCount: number;
};

/**
 * Groups messages into atomic blocks, splitting at each user message.
 * A block contains the user message and all subsequent messages until the next user message.
 * This ensures tool call sequences (assistant with toolCalls + tool results + final response)
 * are never split from their initiating user message.
 */
export function groupIntoBlocks(messages: Array<ChatMessage>): MessageBlock[] {
  const blocks: MessageBlock[] = [];
  let current: ChatMessage[] = [];

  for (const msg of messages) {
    // A new user message starts a new block (flush previous)
    if (msg.role === 'user' && current.length > 0) {
      blocks.push({
        messages: current,
        charCount: current.reduce((s, m) => s + m.content.length, 0),
      });
      current = [];
    }
    current.push(msg);
  }

  if (current.length > 0) {
    blocks.push({
      messages: current,
      charCount: current.reduce((s, m) => s + m.content.length, 0),
    });
  }

  return blocks;
}

/**
 * Limits chat history by keeping as many recent message blocks as fit within the character limit.
 * Messages are grouped into blocks at each user message, so tool call sequences are never split.
 * Always keeps at least the last block (the most recent user message),
 * so the model always has some input.
 *
 * @param messages - The messages to limit
 * @param characterLimit - Maximum total characters allowed
 * @returns Limited message array with the most recent context that fits
 */
export function limitChatHistory(
  messages: Array<ChatMessage>,
  characterLimit: number = TOTAL_CHAT_LENGTH_LIMIT,
): Array<ChatMessage> {
  const consolidated = consolidateMessages(messages);
  if (consolidated.length === 0) return [];

  const blocks = groupIntoBlocks(consolidated);
  if (blocks.length === 0) return [];

  // Always keep at least the last block
  let startIndex = blocks.length - 1;
  let charCount = blocks[startIndex]!.charCount;

  // Include older blocks while within character limit
  while (startIndex > 0) {
    const block = blocks[startIndex - 1]!;
    if (charCount + block.charCount > characterLimit) break;
    charCount += block.charCount;
    startIndex--;
  }

  return blocks.slice(startIndex).flatMap((b) => b.messages);
}

/**
 * Generate a chat title based on the first user message
 * @param message - The first user message
 * @param modelId - The ID of the model to use for title generation
 * @param apiKeyId - The API key ID for billing
 * @returns A string representing the generated chat title
 */
export async function getChatTitle({
  message,
  modelId,
  apiKeyId,
}: {
  message: ChatMessage;
  modelId: string;
  apiKeyId: string;
}): Promise<string> {
  const maxTitleLength = 50;
  const fallbackTitle = 'Neue Konversation';

  try {
    const { text } = await generateTextWithBilling(
      modelId,
      [
        {
          role: 'system',
          content: `Erstelle einen kurzen Titel basierend auf der Nachricht eines Nutzers
  
## Regeln
- Der Titel soll das zentrale Thema der Nachricht erfassen und Interesse wecken, damit der Nutzer die Konversation später leicht wiederfinden kann.
- Verwende keine Anführungszeichen oder Doppelpunkte.
- Verwende keine Emojis oder Sonderzeichen.
- Verwende reinen Text ohne Formatierungen.
- Der Titel sollte nicht länger als ${maxTitleLength} Zeichen sein.
- Antworte nur mit dem Titel, ohne weitere Erklärungen oder Einleitungen.
- Antworte nicht auf die Nachricht des Nutzers, sondern generiere ausschließlich einen passenden Titel dafür.
- Wenn die Nachricht des Nutzers kein klares Thema hat, generiere einen allgemeinen Titel wie "Neue Konversation".
`,
        },
        {
          role: 'user',
          content: message.content,
        },
      ],
      apiKeyId,
    );

    // Remove whitespace, then cut to the length limit character-by-character
    const title = Array.from(text.replace(/\s+/g, ' ').trim()).slice(0, maxTitleLength).join('');
    return title || fallbackTitle;
  } catch (error) {
    logError('Error generating chat title, using default title as fallback:', error);
    return fallbackTitle;
  }
}

// Vertex-hosted models (Anthropic Claude, Google Gemini) cannot fetch attachment urls themselves.
const BASE64_ONLY_MODEL_NAME_PATTERNS = [/^anthropic\//i, /gemini/i];

/**
 * Some models (like Anthropic and Gemini models on Vertex) require the image data to be included in the message as a
 * base64 encoded string, while others can work with just the image url. This function conditionally includes the
 * base64 encoded data if required by the model.
 * Setting IMAGE_ATTACHMENT_MODE=base64 forces base64 for all models (e.g. when the S3 storage isn't publicly reachable by the LLM provider).
 */
export function determineImageAttachmentTypeForModel(model: LlmModelSelectModel): 'url' | 'base64' {
  if (imageAttachmentEnv.imageAttachmentMode === 'base64') {
    return 'base64';
  }
  if (model.provider === 'google') {
    return 'base64';
  }
  // we do not have settings on the LlmModelSelectModel to determine if the model needs image data,
  // so we will use the model name as a heuristic for now
  if (BASE64_ONLY_MODEL_NAME_PATTERNS.some((pattern) => pattern.test(model.name))) {
    return 'base64';
  }
  return 'url';
}

/**
 *  Converts frontend messages to ai-core message format
 */
export function convertToAiCoreMessages(
  systemPrompt: string,
  messages: ChatMessage[],
): AiCoreMessage[] {
  return [
    { role: 'system', content: systemPrompt },
    ...messages
      .filter((msg) => msg.role !== 'system')
      .map(({ role, content, attachments, toolCalls, toolCallId }) => ({
        role,
        content,
        attachments,
        toolCalls,
        toolCallId,
      })),
  ];
}
