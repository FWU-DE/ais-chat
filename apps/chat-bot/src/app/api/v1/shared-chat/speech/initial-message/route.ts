import { sharedChatInitialMessageSpeechRequestSchema } from '@/app/api/shared-chat/shared-chat-request-schemas';
import { requireValidInviteCode } from '@/auth/requireValidInviteCode';
import { handleErrorInRoute } from '@/error/handle-error-in-route';
import { logError } from '@shared/logging';
import { generateSharedChatSpeechStreamForInitialMessage } from '@shared/speech/shared-chat-speech-service';
import { NextRequest } from 'next/server';
import { buildSpeechStreamResponse } from '../../../../utils/response-builder';

export async function POST(req: NextRequest) {
  try {
    const parsed = sharedChatInitialMessageSpeechRequestSchema.parse(await req.json());

    await requireValidInviteCode(parsed.inviteCode);

    const { chunks, contentType, format } = await generateSharedChatSpeechStreamForInitialMessage({
      inviteCode: parsed.inviteCode,
      entityId: parsed.characterId,
      entityType: 'character',
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

    return buildSpeechStreamResponse({
      body,
      contentType,
      format,
    });
  } catch (error) {
    return handleErrorInRoute(error);
  }
}
