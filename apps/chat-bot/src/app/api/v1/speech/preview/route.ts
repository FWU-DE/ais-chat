import { getUser } from '@/auth/utils';
import { handleErrorInRoute } from '@/error/handle-error-in-route';
import { generateSpeechPreview } from '@shared/speech/speech-service';
import { requiredNonEmptyString } from '@shared/utils/zod';
import { getTranslations } from 'next-intl/server';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const speechPreviewRequestSchema = z.object({
  voice: requiredNonEmptyString('voice is required'),
});

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
