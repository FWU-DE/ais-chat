import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/auth/utils';
import { handleErrorInRoute } from '@/error/handle-error-in-route';
import { generateChatSpeech } from '@/app/api/chat/speech-service';
import { speechRequestSchema } from '@/app/api/chat/speech-request-schemas';

export async function POST(req: NextRequest) {
  try {
    const user = await getUser();

    const parsed = speechRequestSchema.parse(await req.json());

    const { buffer, contentType } = await generateChatSpeech({
      user,
      conversationId: parsed.conversationId,
      text: parsed.text,
      voice: parsed.voice,
      abortSignal: req.signal,
    });

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
