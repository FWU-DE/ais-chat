import { initialMessageSpeechRequestSchema } from '@/app/api/chat/speech-request-schemas';
import { generateStaticMessageSpeech } from '@/app/api/chat/speech-service';
import { getUser } from '@/auth/utils';
import { handleErrorInRoute } from '@/error/handle-error-in-route';
import { getCharacterForChatSession } from '@shared/characters/character-service';
import { ForbiddenError, NotFoundError } from '@shared/error';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const user = await getUser();

    const parsed = initialMessageSpeechRequestSchema.parse(await req.json());

    const character = await getCharacterForChatSession({
      characterId: parsed.characterId,
      user,
    });

    if (
      user.federalState.featureToggles.isSpeechModelEnabled !== true ||
      !character.isSpeechEnabled
    ) {
      throw new ForbiddenError('Speech is not enabled for this character');
    }

    if (!character.initialMessage) {
      throw new NotFoundError('Character has no initial message');
    }

    const { buffer, contentType } = await generateStaticMessageSpeech({
      text: character.initialMessage,
      voice: character.voice,
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
