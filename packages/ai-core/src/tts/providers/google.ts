import type { AiModel, SpeechGenerationFn } from '../types';
import { AiGenerationError, ProviderConfigurationError } from '../../errors';
import { createGoogleClient, formatGoogleError } from '../../google-client';

function pcmToWav(pcm: Buffer): Buffer {
  // Gemini TTS generates 24 kHz mono signed 16-bit little-endian PCM:
  // https://ai.google.dev/gemini-api/docs/speech-generation
  const SAMPLE_RATE = 24000; // samples per second
  const CHANNELS = 1;
  const BITS_PER_SAMPLE = 16;
  const BYTES_PER_SAMPLE = BITS_PER_SAMPLE / 8;

  // Drop trailing odd byte to keep samples 16-bit aligned.
  const dataLength = Math.floor(pcm.byteLength / BYTES_PER_SAMPLE) * BYTES_PER_SAMPLE;
  const byteRate = SAMPLE_RATE * CHANNELS * BYTES_PER_SAMPLE;
  const blockAlign = CHANNELS * BYTES_PER_SAMPLE;

  // Canonical 44-byte WAV header for PCM: https://docs.fileformat.com/audio/wav/
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + dataLength, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(CHANNELS, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(BITS_PER_SAMPLE, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(dataLength, 40);

  return Buffer.concat([header, pcm.subarray(0, dataLength)]);
}

export function constructGoogleSpeechGenerationFn(model: AiModel): SpeechGenerationFn {
  if (model.setting.provider !== 'google') {
    throw new ProviderConfigurationError('Invalid model configuration for Google');
  }

  const { client } = createGoogleClient(model);
  const modelName = model.name;

  return async function getGoogleSpeech({ text, voice, abortSignal }) {
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
          abortSignal,
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
