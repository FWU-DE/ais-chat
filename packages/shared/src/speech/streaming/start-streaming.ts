import { streamSpeechById, streamSsmlSpeechById } from '@ais-chat/ai-core';
import { LlmModelSelectModel } from '@shared/db/schema';

import { ChatSpeechStreamResult } from '../types';
import { calculateSpeechCostsInCent, resolveSpeechVoice } from '../utils';
import type { SpeechStreamingPipelineParams } from './speech-pipeline';

export const startStream = async (
  params: SpeechStreamingPipelineParams,
  model: LlmModelSelectModel,
  /** When set, the SSML body is synthesized instead of the plain text input. */
  ssmlBody: string | undefined,
  onStreamFinished: (result: ChatSpeechStreamResult) => Promise<void>,
): Promise<ChatSpeechStreamResult> => {
  const voice = resolveSpeechVoice(model, params.voice);
  const { chunks, usage, mimeType } =
    ssmlBody !== undefined
      ? await streamSsmlSpeechById({
          modelId: model.id,
          ssmlBody,
          voice,
          abortSignal: params.abortSignal,
        })
      : await streamSpeechById({
          modelId: model.id,
          text: params.input,
          voice,
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

  const reportedChunks = chunksWithUsageReporting();
  // Errors raised before the first audio chunk must surface here so the caller can retry.
  // If this throws, the generator has already finished and reported its usage.
  const firstChunk = await reportedChunks.next();

  return {
    chunks: replayFirstChunk(firstChunk, reportedChunks),
    contentType: result.contentType,
    costsInCent: result.costsInCent,
    modelId: result.modelId,
    modelName: result.modelName,
    provider: result.provider,
  };
};

/**
 * Yields the already consumed first chunk before delegating to the remaining stream.
 * Implemented manually instead of as a generator function, so `return()`/`throw()` reach the
 * started inner stream even if the caller never calls `next()`, keeping cleanup and usage reporting.
 */
function replayFirstChunk(
  firstChunk: IteratorResult<Buffer, void>,
  rest: AsyncGenerator<Buffer, void, unknown>,
): AsyncGenerator<Buffer, void, unknown> {
  let pending: IteratorResult<Buffer, void> | undefined = firstChunk;
  const generator: AsyncGenerator<Buffer, void, unknown> = {
    next: async () => {
      if (pending) {
        const chunk = pending;
        pending = undefined;
        return chunk;
      }
      return rest.next();
    },
    return: async (value) => {
      pending = undefined;
      return rest.return(value);
    },
    throw: async (error) => {
      pending = undefined;
      return rest.throw(error);
    },
    [Symbol.asyncIterator]: () => generator,
    [Symbol.asyncDispose]: async () => {
      await generator.return();
    },
  };
  return generator;
}
