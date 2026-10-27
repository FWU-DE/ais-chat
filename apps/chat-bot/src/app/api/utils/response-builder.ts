import { ChatSpeechStreamResult } from '@shared/speech/types';

/**
 * Builds a Response object for streaming audio with appropriate headers.
 */
export function buildSpeechStreamResponse({
  body,
  contentType,
  format,
}: Pick<ChatSpeechStreamResult, 'contentType' | 'format'> & { body: ReadableStream<Uint8Array> }) {
  return new Response(body, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'no-store',
      'X-Audio-Encoding': format.encoding,
      'X-Audio-Sample-Rate': String(format.sampleRate),
      'X-Audio-Channels': String(format.channels),
    },
  });
}
