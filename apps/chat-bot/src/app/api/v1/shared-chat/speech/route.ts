import { NextRequest, NextResponse } from 'next/server';
import { handleErrorInRoute } from '@/error/handle-error-in-route';
import { requireValidInviteCode } from '@/auth/requireValidInviteCode';
import { generateSpeech } from '@/app/api/chat/speech-service';
import { sharedChatSpeechRequestSchema } from '@/app/api/shared-chat/shared-chat-request-schemas';

export async function POST(req: NextRequest) {
  try {
    const parsed = sharedChatSpeechRequestSchema.parse(await req.json());

    await requireValidInviteCode(parsed.inviteCode);

    const { buffer, contentType } = await generateSpeech({ text: parsed.text });

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
