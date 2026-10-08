import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/auth/utils';
import { handleErrorInRoute } from '@/error/handle-error-in-route';
import { generateSpeech } from '@/app/api/chat/speech-service';
import { speechRequestSchema } from '@/app/api/shared-chat/shared-chat-request-schemas';

export async function POST(req: NextRequest) {
  try {
    const user = await getUser();
    if (user === undefined) {
      return new NextResponse(null, { status: 401 });
    }

    const parsed = speechRequestSchema.parse(await req.json());

    const { buffer, contentType } = await generateSpeech({
      text: parsed.text,
      voice: parsed.voice,
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
