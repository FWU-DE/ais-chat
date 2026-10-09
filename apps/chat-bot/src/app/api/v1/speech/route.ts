import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/auth/utils';
import { handleErrorInRoute } from '@/error/handle-error-in-route';
import { generateSpeech } from '@/app/api/chat/speech-service';
import { speechRequestSchema } from '@/app/api/shared-chat/shared-chat-request-schemas';
import { dbInsertConversationUsage } from '@shared/db/functions/token-usage';
import { dbGetOrCreateConversation } from '@shared/db/functions/chat';
import { sendRabbitmqEvent } from '@/rabbitmq/send';
import { constructNewMessageEvent } from '@/rabbitmq/events/new-message';

export async function POST(req: NextRequest) {
  try {
    const user = await getUser();
    if (user === undefined) {
      return new NextResponse(null, { status: 401 });
    }

    const parsed = speechRequestSchema.parse(await req.json());

    const { buffer, contentType, costsInCent, modelId, provider } = await generateSpeech({
      text: parsed.text,
      voice: parsed.voice,
    });

    // Voice previews in the editors have no conversation, so they are not billed.
    if (parsed.conversationId !== undefined) {
      await dbInsertConversationUsage({
        conversationId: parsed.conversationId,
        userId: user.id,
        modelId,
        completionTokens: 0,
        promptTokens: 0,
        costsInCent,
      });

      const conversation = await dbGetOrCreateConversation({
        conversationId: parsed.conversationId,
        userId: user.id,
      });

      if (conversation) {
        await sendRabbitmqEvent(
          constructNewMessageEvent({
            user,
            promptTokens: 0,
            completionTokens: 0,
            costsInCent,
            provider,
            anonymous: false,
            conversation,
          }),
        );
      }
    }

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-store',
        'Content-Length': buffer.byteLength.toString(),
      },
    });
  } catch (error) {
    return handleErrorInRoute(error);
  }
}
