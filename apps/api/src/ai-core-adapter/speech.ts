import { generateSpeechStreamByNameWithBilling } from '@ais-chat/ai-core';

export type SpeechStream = Awaited<ReturnType<typeof generateSpeechStreamByNameWithBilling>>;

export async function createSpeechStream({
  modelName,
  input,
  voice,
  apiKeyId,
}: {
  modelName: string;
  input: string;
  voice: string;
  apiKeyId: string;
}): Promise<SpeechStream> {
  return generateSpeechStreamByNameWithBilling(modelName, input, voice, apiKeyId);
}

export type SpeechAudioDeltaEvent = { type: 'speech.audio.delta'; audio: string };
export type SpeechAudioDoneEvent = {
  type: 'speech.audio.done';
  usage: { input_tokens: 0; output_tokens: 0; total_tokens: 0 };
};

export function createSpeechAudioDeltaEvent(chunk: Buffer): SpeechAudioDeltaEvent {
  return { type: 'speech.audio.delta', audio: chunk.toString('base64') };
}

export function createSpeechAudioDoneEvent(): SpeechAudioDoneEvent {
  return {
    type: 'speech.audio.done',
    usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
  };
}
