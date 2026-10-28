import { streamSpeechById } from '@ais-chat/ai-core';
import { LlmModelSelectModel } from '@shared/db/schema';
import { ChatSpeechStreamResult } from '../types';
import { calculateSpeechCostsInCent } from '../utils';
import type { SpeechStreamingPipelineParams } from './speech-pipeline';

export const startStream = async (
  params: SpeechStreamingPipelineParams,
  model: LlmModelSelectModel,
  onStreamFinished: (result: ChatSpeechStreamResult) => Promise<void>,
): Promise<ChatSpeechStreamResult> => {
  const voices = model.modelConfig?.voices ?? [];
  const firstVoice = voices.at(0);

  if (firstVoice === undefined) {
    throw new Error('No voices configured for the speech model');
  }

  const selectedVoice =
    params.voice && voices.some((voice) => voice.name === params.voice)
      ? params.voice
      : firstVoice.name;

  const { chunks, usage, format } = await streamSpeechById({
    modelId: model.id,
    text: params.input,
    voice: selectedVoice,
    abortSignal: params.abortSignal,
  });

  const result: ChatSpeechStreamResult = {
    chunks,
    contentType: 'application/octet-stream',
    format,
    costsInCent: usage.then((resolvedUsage) => calculateSpeechCostsInCent(model, resolvedUsage)),
    modelId: model.id,
    provider: model.provider,
    modelName: model.name,
  };

  // Usage is only known once the stream has actually been consumed (or cancelled), so
  // reporting is deferred to the generator's `finally` block instead of firing as soon as
  // the stream is created.
  async function* chunksWithUsageReporting() {
    try {
      yield* result.chunks;
    } finally {
      await onStreamFinished(result);
    }
  }

  return {
    chunks: chunksWithUsageReporting(),
    contentType: result.contentType,
    format: result.format,
    costsInCent: result.costsInCent,
    modelId: result.modelId,
    modelName: result.modelName,
    provider: result.provider,
  };
};
