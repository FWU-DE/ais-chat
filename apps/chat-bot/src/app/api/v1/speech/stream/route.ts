import { speechRequestSchema } from '@/app/api/chat/speech-request-schemas';
import { generateChatSpeechStream } from '@/app/api/chat/speech-service';
import { getUser } from '@/auth/utils';
import { handleErrorInRoute } from '@/error/handle-error-in-route';
import { logError } from '@shared/logging';
import { NextRequest } from 'next/server';

/**
 * Streaming endpoint for speech.
 * It is recommended to use an endpoint for cancellable streaming requests
 * instead of a server action.
 *
 * Returns headerless raw PCM (16-bit LE, 24 kHz, mono) as a chunked response
 * instead of a single WAV blob, so the client can start playback before the
 * full audio has been synthesized.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getUser();

    const parsed = speechRequestSchema.parse(await req.json());

    const { chunks, contentType, format } = await generateChatSpeechStream({
      user,
      conversationId: parsed.conversationId,
      text: parsed.text,
      voice: parsed.voice,
      abortSignal: req.signal,
    });

    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const { value, done } = await chunks.next();
          if (done) {
            controller.close();
            return;
          }
          controller.enqueue(new Uint8Array(value));
        } catch (error) {
          logError('Error while streaming speech audio', error);
          controller.error(error);
        }
      },
      async cancel() {
        // The client stopped reading (e.g. navigated away or hit pause-and-discard) — let the
        // generator run its `finally` block (usage logging) instead of leaking the upstream call.
        await chunks.return?.();
      },
    });

    return new Response(body, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-store',
        'X-Audio-Encoding': format.encoding,
        'X-Audio-Sample-Rate': String(format.sampleRate),
        'X-Audio-Channels': String(format.channels),
      },
    });
  } catch (error) {
    return handleErrorInRoute(error);
  }
}
