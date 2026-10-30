import { requireValidInviteCode } from '@/auth/requireValidInviteCode';
import { handleErrorInRoute } from '@/error/handle-error-in-route';
import { logError } from '@shared/logging';
import { generateSharedChatSpeechStream } from '@shared/speech/shared-chat-speech-service';
import { requiredNonEmptyString } from '@shared/utils/zod';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { buildSpeechStreamResponse } from '../../../../utils/response-builder';

const sharedChatSpeechRequestSchema = z.object({
  inviteCode: requiredNonEmptyString('inviteCode is required'),
  entityType: z.union([z.literal('character'), z.literal('learningScenario')]),
  entityId: requiredNonEmptyString('entityId is required'),
  text: requiredNonEmptyString('text is required'),
});

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
          logError('Error while streaming shared chat speech audio', error);
          controller.error(error);
        }
      },
      async cancel() {
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
