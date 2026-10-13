import { NextRequest, NextResponse } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { getUser } from '@/auth/utils';
import { handleErrorInRoute } from '@/error/handle-error-in-route';
import { generateSpeechPreview } from '@/app/api/chat/speech-service';
import { speechPreviewRequestSchema } from '@/app/api/chat/speech-request-schemas';

export async function POST(req: NextRequest) {
  try {
    await getUser();

    const parsed = speechPreviewRequestSchema.parse(await req.json());

    const t = await getTranslations('custom-chat.speech');

    const { buffer, contentType } = await generateSpeechPreview({
      text: t('voice-preview-text'),
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
