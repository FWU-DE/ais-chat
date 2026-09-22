import type { AiModel, SpeechGenerationFn } from '../types';
import { AiGenerationError, ProviderConfigurationError } from '../../errors';
import { createGoogleClient } from '../../google-client';

// Gemini TTS always emits 24 kHz mono signed 16-bit little-endian PCM.
const SAMPLE_RATE = 24000;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;

function pcmToWav(pcm: Buffer): Buffer {
  const byteRate = (SAMPLE_RATE * CHANNELS * BITS_PER_SAMPLE) / 8;
  const blockAlign = (CHANNELS * BITS_PER_SAMPLE) / 8;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(CHANNELS, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(BITS_PER_SAMPLE, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

export function constructVertexSpeechGenerationFn(model: AiModel): SpeechGenerationFn {
  if (model.setting.provider !== 'google') {
    throw new ProviderConfigurationError('Invalid model configuration for Vertex TTS');
  }

  const { client } = createGoogleClient(model);
  const modelName = model.name;

  return async function getVertexSpeech({ text, voice }) {
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
      throw new AiGenerationError(
        `Vertex TTS generateContent failed: ${error instanceof Error ? error.message : String(error)}`,
      );
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
