import type { ChatAttachment, Message } from '@ais-chat/ai-core';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions.js';

const extensionToMime: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
};

/**
 * Infers the image MIME type from a URL.
 * Supports data-URLs (`data:image/jpeg;base64,…`) and file extensions.
 * Falls back to `image/png` when the type cannot be determined.
 */
function inferImageContentType(url: string): string {
  // data-URL: extract MIME type directly
  const dataMatch = url.match(/^data:(image\/[^;,]+)/i);
  if (dataMatch?.[1]) {
    return dataMatch[1];
  }

  // Regular URL: check file extension
  try {
    const pathname = new URL(url).pathname;
    const ext = pathname.split('.').pop()?.toLowerCase();
    if (ext && extensionToMime[ext]) {
      return extensionToMime[ext];
    }
  } catch {
    // not a valid URL – fall through
  }

  return 'image/png';
}

/**
 * Converts OpenAI-format messages to ai-core's Message format.
 * Handles both string content and structured content parts (text + image_url).
 */
export function convertToAiCoreMessages(messages: ChatCompletionMessageParam[]): Message[] {
  return messages
    .filter(
      (m) =>
        m.role === 'system' ||
        m.role === 'developer' ||
        m.role === 'user' ||
        m.role === 'assistant',
    )
    .map((m): Message => {
      // Map 'developer' role to 'system' since ai-core doesn't have a developer role
      const role: Message['role'] = m.role === 'developer' ? 'system' : m.role;

      if (typeof m.content === 'string') {
        return {
          role,
          content: m.content,
        };
      }

      if (Array.isArray(m.content)) {
        const textParts: string[] = [];
        const attachments: ChatAttachment[] = [];

        for (const part of m.content) {
          if (part.type === 'text') {
            textParts.push(part.text);
          } else if (part.type === 'image_url') {
            attachments.push({
              type: 'image',
              url: part.image_url.url,
              contentType: inferImageContentType(part.image_url.url),
            });
          }
        }

        return {
          role,
          content: textParts.join('\n'),
          ...(attachments.length > 0 ? { attachments } : {}),
        };
      }

      return {
        role,
        content: m.content ?? '',
      };
    });
}
