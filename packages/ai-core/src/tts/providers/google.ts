import { createRequire } from 'module';
import type { AiModel, SpeechGenerationFn } from '../types';
import { AiGenerationError, ProviderConfigurationError } from '../../errors';
import { createGoogleClient, formatGoogleError } from '../../google-client';

// wavefile is CommonJS, so require it at runtime.
const { WaveFile } = createRequire(import.meta.url)('wavefile') as typeof import('wavefile');

function pcmToWav(pcm: Buffer): Buffer {
  // Gemini TTS generates 24 kHz mono signed 16-bit little-endian PCM.
  // https://ai.google.dev/gemini-api/docs/speech-generation
  const SAMPLE_RATE = 24000; // samples per second
  const CHANNELS = 1;
  const BITS_PER_SAMPLE = 16;

  // Reinterpret the raw PCM bytes as 16-bit samples. Length is in samples, not
  // bytes, so divide by 2 (each 16-bit sample spans 2 bytes).
  const samples = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 2);
  const wav = new WaveFile();
  wav.fromScratch(CHANNELS, SAMPLE_RATE, String(BITS_PER_SAMPLE), samples);
  return Buffer.from(wav.toBuffer());
}

export function constructGoogleSpeechGenerationFn(model: AiModel): SpeechGenerationFn {
  if (model.setting.provider !== 'google') {
    throw new ProviderConfigurationError('Invalid model configuration for Google');
  }

  const { client } = createGoogleClient(model);
  const modelName = model.name;

  return async function getGoogleSpeech({ text, voice }) {
    let response;
    try {
      response = await client.models.generateContent({
        model: modelName,
        contents: [{ role: 'user', parts: [{ text }] }],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
          },
        },
      });
    } catch (error) {
      throw new AiGenerationError(formatGoogleError('Google Vertex AI Speech', error));
    }

    const parts = response.candidates?.[0]?.content?.parts ?? [];
    const inline = parts.find((p) => p.inlineData?.data)?.inlineData;
    if (!inline?.data) {
      throw new AiGenerationError('No audio data received from Vertex TTS');
    }

    const pcm = Buffer.from(inline.data, 'base64');
    const wavBuffer = pcmToWav(pcm);

    return { wavBuffer };
  };
}
