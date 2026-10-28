import { NextRequest, NextResponse } from 'next/server';
import { handleErrorInRoute } from '@/error/handle-error-in-route';
import { requireValidInviteCode } from '@/auth/requireValidInviteCode';
import { generateSharedChatInitialMessageSpeech } from '@/app/api/shared-chat/shared-chat-speech-service';
import { sharedChatInitialMessageSpeechRequestSchema } from '@/app/api/shared-chat/shared-chat-request-schemas';

export async function POST(req: NextRequest) {
  try {
    const parsed = sharedChatInitialMessageSpeechRequestSchema.parse(await req.json());

    await requireValidInviteCode(parsed.inviteCode);

    const { buffer, contentType } = await generateSharedChatInitialMessageSpeech({
      inviteCode: parsed.inviteCode,
      characterId: parsed.characterId,
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
