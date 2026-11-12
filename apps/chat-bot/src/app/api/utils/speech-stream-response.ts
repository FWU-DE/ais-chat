import { ChatSpeechStreamResult } from '@shared/speech/types';

/**
 * Builds a Response object for streaming audio with appropriate headers.
 */
export function buildSpeechStreamResponse({
  body,
  contentType,
}: Pick<ChatSpeechStreamResult, 'contentType'> & { body: ReadableStream<Uint8Array> }) {
  return new Response(body, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'no-store',
    },
  });
}
