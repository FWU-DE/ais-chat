import { streamSpeechById } from '@ais-chat/ai-core';
import { LlmModelSelectModel } from '@shared/db/schema';

import { ChatSpeechStreamResult } from '../types';
import { calculateSpeechCostsInCent, resolveSpeechVoice } from '../utils';
import type { SpeechStreamingPipelineParams } from './speech-pipeline';

export const startStream = async (
  params: SpeechStreamingPipelineParams,
  model: LlmModelSelectModel,
  onStreamFinished: (result: ChatSpeechStreamResult) => Promise<void>,
): Promise<ChatSpeechStreamResult> => {
  const { chunks, usage, mimeType } = await streamSpeechById({
    modelId: model.id,
    text: params.input,
    voice: resolveSpeechVoice(model, params.voice),
    abortSignal: params.abortSignal,
  });

  const result: ChatSpeechStreamResult = {
    chunks,
    contentType: mimeType,
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
    costsInCent: result.costsInCent,
    modelId: result.modelId,
    modelName: result.modelName,
    provider: result.provider,
  };
};
