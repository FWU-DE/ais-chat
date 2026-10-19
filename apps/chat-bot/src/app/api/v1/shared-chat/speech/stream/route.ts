import { sharedChatSpeechRequestSchema } from '@/app/api/shared-chat/shared-chat-request-schemas';
import { generateSharedChatSpeechStream } from '@/app/api/shared-chat/shared-chat-speech-service';
import { requireValidInviteCode } from '@/auth/requireValidInviteCode';
import { handleErrorInRoute } from '@/error/handle-error-in-route';
import { logError } from '@shared/logging';
import { NextRequest } from 'next/server';

/**
 * Streaming counterpart of /api/v1/shared-chat/speech.
 */
export async function POST(req: NextRequest) {
  try {
    const parsed = sharedChatSpeechRequestSchema.parse(await req.json());

    await requireValidInviteCode(parsed.inviteCode);

    const { chunks, contentType, format } = await generateSharedChatSpeechStream({
      inviteCode: parsed.inviteCode,
      entityType: parsed.entityType,
      entityId: parsed.entityId,
      text: parsed.text,
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
          logError('Error while streaming shared chat speech audio', error);
          controller.error(error);
        }
      },
      async cancel() {
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
