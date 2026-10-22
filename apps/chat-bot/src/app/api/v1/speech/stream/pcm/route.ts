import { getUser } from '@/auth/utils';
import { handleErrorInRoute } from '@/error/handle-error-in-route';
import {
  constructGoogleCloudTtsStreamingSpeechGenerationFn,
  getSpeechModelById,
} from '@ais-chat/ai-core';
import { dbGetSpeechModel } from '@shared/db/functions/llm-model';
import { logError } from '@shared/logging';
import { requiredNonEmptyString } from '@shared/utils/zod';
import { NextRequest } from 'next/server';
import { z } from 'zod';

// Chirp 3: HD voices share the same names across languages (see
// `constructGoogleCloudTtsStreamingSpeechGenerationFn`'s JSDoc), so this is just a fixed voice to
// exercise the provider; it isn't user-selectable here.
const TEST_VOICE = 'de-DE-Chirp3-HD-Aoede';

const pcmStreamTestRequestSchema = z.object({
  text: requiredNonEmptyString('text is required'),
});

/**
 * Test-only endpoint for `constructGoogleCloudTtsStreamingSpeechGenerationFn` (the Google Cloud
 * Text-to-Speech Chirp 3: HD streaming provider), which isn't wired into the regular speech
 * generation flow yet. Unlike the other `/api/v1/speech/*` routes, this calls the provider
 * function directly instead of going through the speech service layer, so there's no conversation
 * ownership check, billing, or usage tracking.
 *
 * Returns a headerless raw PCM (16-bit LE, 24 kHz, mono) stream.
 */
export async function POST(req: NextRequest) {
  try {
    await getUser();

    const { text } = pcmStreamTestRequestSchema.parse(await req.json());

    const speechModel = await dbGetSpeechModel();
    if (!speechModel) {
      throw new Error('No speech model configured');
    }

    const model = await getSpeechModelById(speechModel.id);
    const generateSpeechStream = constructGoogleCloudTtsStreamingSpeechGenerationFn(model);

    const { chunks, format } = await generateSpeechStream({
      text,
      voice: TEST_VOICE,
      abortSignal: req.signal,
      audioFormat: 'pcm',
    });
    // `format` is typed as the `GoogleCloudTtsAudioFormat` union since it isn't narrowed by the
    // `audioFormat: 'pcm'` argument above, even though it's always `PCM_STREAM_AUDIO_FORMAT` here.
    if (format.encoding !== 'pcm_s16le') {
      throw new Error(`Expected raw PCM audio, got encoding "${format.encoding}"`);
    }

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
          logError('Error while streaming Google Cloud TTS test audio', error);
          controller.error(error);
        }
      },
      async cancel() {
        // The client stopped reading — let the generator run its `finally` block instead of
        // leaking the upstream gRPC stream.
        await chunks.return?.();
      },
    });

    return new Response(body, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Cache-Control': 'no-store',
        'X-Audio-Encoding': format.encoding,
        'X-Audio-Sample-Rate': String(format.sampleRate),
        'X-Audio-Channels': String(format.channels),
      },
    });
  } catch (error) {
    return handleErrorInRoute(error);
  }
}
