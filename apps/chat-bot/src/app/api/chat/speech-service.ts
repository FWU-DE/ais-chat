import {
  getCachedSpeechPreview,
  setCachedSpeechPreview,
} from '@/app/api/utils/speech-preview-cache';
import { calculateSpeechCostsInCent } from '@/app/api/utils/utils';
import { UserAndContext } from '@/auth/types';
import { constructTokenBudgetExceededEvent } from '@shared/rabbitmq/events/budget-exceeded';
import { constructNewMessageEvent } from '@shared/rabbitmq/events/new-message';
import { sendRabbitmqEvent } from '@shared/rabbitmq/send';
import type { AudioFormat } from '@ais-chat/ai-core';
import { generateSpeechById, streamSpeechById, TokenPointsExceededError } from '@ais-chat/ai-core';
import { getConversation } from '@shared/conversation/conversation-service';
import { dbGetSpeechModel } from '@shared/db/functions/llm-model';
import { dbInsertConversationUsage } from '@shared/db/functions/token-usage';
import { InvalidArgumentError } from '@shared/error';
import { userHasReachedTokenPointsLimit } from '@shared/users/usage';
/**
 * Public result of the chat-facing streaming speech functions.
 * Raw PCM `chunks` in `format`, plus the `contentType` to send back.
 */
export type ChatSpeechStreamResult = {
  chunks: AsyncGenerator<Buffer, void, unknown>;
  contentType: string;
  format: AudioFormat;
};

async function resolveSpeechModelAndVoice(voice?: string) {
  const speechModel = await dbGetSpeechModel();

  if (!speechModel) {
    throw new Error('No speech model configured');
  }

  const voices = speechModel.modelConfig?.voices ?? [];
  const [firstVoice] = voices;

  if (firstVoice === undefined) {
    throw new Error('No voices configured for the speech model');
  }

  const selectedVoice = voice && voices.some((v) => v.name === voice) ? voice : firstVoice.name;

  return { speechModel, selectedVoice };
}

export async function generateSpeech({ text, voice }: { text: string; voice?: string }) {
  const { speechModel, selectedVoice } = await resolveSpeechModelAndVoice(voice);

  const { wavBuffer, usage } = await generateSpeechById({
    modelId: speechModel.id,
    text,
    voice: selectedVoice,
  });

  const costsInCent = calculateSpeechCostsInCent(speechModel, usage);

  return {
    buffer: wavBuffer,
    contentType: 'audio/wav',
    costsInCent,
    modelId: speechModel.id,
    provider: speechModel.provider,
    modelName: speechModel.name,
  };
}

/**
 * Streaming counterpart of `generateSpeech`. Yields raw PCM chunks as they arrive instead of
 * waiting for the full audio, and exposes `costsInCent` as a promise that only resolves once the
 * stream is fully drained (provider usage is only known after the last chunk).
 */
export async function generateSpeechStream({
  text,
  voice,
  abortSignal,
}: {
  text: string;
  voice?: string;
  abortSignal?: AbortSignal;
}) {
  const speechModelOrUndefined = await dbGetSpeechModel();

  if (!speechModelOrUndefined) {
    throw new Error('No speech model configured');
  }
  // Rebound to a new const so the non-undefined narrowing survives being captured by the
  // closures below (narrowing doesn't flow into nested closures/generators).
  const speechModel = speechModelOrUndefined;

  const voices = speechModel.modelConfig?.voices ?? [];
  const [firstVoice] = voices;

  if (firstVoice === undefined) {
    throw new Error('No voices configured for the speech model');
  }

  const selectedVoice = voice && voices.some((v) => v.name === voice) ? voice : firstVoice.name;

  const { chunks, usage, format } = await streamSpeechById({
    modelId: speechModel.id,
    text,
    voice: selectedVoice,
    abortSignal,
  });

  const costsInCent = usage.then((resolvedUsage) =>
    calculateSpeechCostsInCent(speechModel, resolvedUsage),
  );

  return {
    chunks,
    contentType: 'application/octet-stream',
    format,
    costsInCent,
    modelId: speechModel.id,
    provider: speechModel.provider,
    modelName: speechModel.name,
  };
}

export async function generateChatSpeech({
  user,
  conversationId,
  text,
  voice,
}: {
  user: UserAndContext;
  conversationId: string;
  text: string;
  voice?: string;
}): Promise<{ buffer: Buffer; contentType: string }> {
  const conversation = await getConversation({
    conversationId,
    userId: user.id,
  });

  if (await userHasReachedTokenPointsLimit({ user })) {
    await sendRabbitmqEvent(
      constructTokenBudgetExceededEvent({
        anonymous: false,
        user,
        conversation,
      }),
    );
    throw new TokenPointsExceededError();
  }

  const speechResult = await generateSpeech({ text, voice });

  await dbInsertConversationUsage({
    conversationId,
    userId: user.id,
    modelId: speechResult.modelId,
    completionTokens: 0,
    promptTokens: 0,
    costsInCent: speechResult.costsInCent,
  });

  await sendRabbitmqEvent(
    constructNewMessageEvent({
      user,
      promptTokens: 0,
      completionTokens: 0,
      costsInCent: speechResult.costsInCent,
      provider: speechResult.provider,
      modelName: speechResult.modelName,
      anonymous: false,
      conversation,
    }),
  );

  return { buffer: speechResult.buffer, contentType: speechResult.contentType };
}

/**
 * Streaming counterpart of `generateChatSpeech`. Reuses the same pre-checks (conversation
 * ownership, token budget), but yields raw PCM chunks as they arrive from the provider instead of
 * waiting for the full audio to be generated, so the client can start playback sooner.
 */
export async function generateChatSpeechStream({
  user,
  conversationId,
  text,
  voice,
  abortSignal,
}: {
  user: UserAndContext;
  conversationId: string;
  text: string;
  voice?: string;
  abortSignal?: AbortSignal;
}): Promise<ChatSpeechStreamResult> {
  const conversation = await getConversation({
    conversationId,
    userId: user.id,
  });

  if (await userHasReachedTokenPointsLimit({ user })) {
    await sendRabbitmqEvent(
      constructTokenBudgetExceededEvent({
        anonymous: false,
        user,
        conversation,
      }),
    );
    throw new TokenPointsExceededError();
  }

  const speechResult = await generateSpeechStream({ text, voice, abortSignal });

  async function* chunksWithUsageLogging() {
    try {
      yield* speechResult.chunks;
    } finally {
      const costsInCent = await speechResult.costsInCent;

      await dbInsertConversationUsage({
        conversationId,
        userId: user.id,
        modelId: speechResult.modelId,
        completionTokens: 0,
        promptTokens: 0,
        costsInCent,
      });

      await sendRabbitmqEvent(
        constructNewMessageEvent({
          user,
          promptTokens: 0,
          completionTokens: 0,
          costsInCent,
          provider: speechResult.provider,
          modelName: speechResult.modelName,
          anonymous: false,
          conversation,
        }),
      );
    }
  }

  return {
    chunks: chunksWithUsageLogging(),
    contentType: speechResult.contentType,
    format: speechResult.format,
  };
}

export async function generateSpeechPreview({ text, voice }: { text: string; voice: string }) {
  const speechModel = await dbGetSpeechModel();

  if (!speechModel) {
    throw new Error('No speech model configured');
  }

  const voices = speechModel.modelConfig?.voices ?? [];

  if (!voices.some((v) => v.name === voice)) {
    throw new InvalidArgumentError(`Unknown voice: ${voice}`);
  }

  const cached = await getCachedSpeechPreview(speechModel.id, voice, text);
  if (cached !== undefined) {
    return {
      buffer: cached,
      contentType: 'audio/wav',
    };
  }

  const { wavBuffer } = await generateSpeechById({
    modelId: speechModel.id,
    text,
    voice,
  });

  await setCachedSpeechPreview(speechModel.id, voice, text, wavBuffer);

  return {
    buffer: wavBuffer,
    contentType: 'audio/wav',
  };
}

/**
 * Generates speech for a static message (e.g. a character's initial message).
 * The result is cached because the text is identical for every listener, and generation is unbilled.
 */
export async function generateStaticMessageSpeech({
  text,
  voice,
}: {
  text: string;
  voice?: string;
}): Promise<{ buffer: Buffer; contentType: string }> {
  const { speechModel, selectedVoice } = await resolveSpeechModelAndVoice(voice);

  const cached = await getCachedSpeechPreview(speechModel.id, selectedVoice, text);
  if (cached !== undefined) {
    return {
      buffer: cached,
      contentType: 'audio/wav',
    };
  }

  const { wavBuffer } = await generateSpeechById({
    modelId: speechModel.id,
    text,
    voice: selectedVoice,
  });

  await setCachedSpeechPreview(speechModel.id, selectedVoice, text, wavBuffer);

  return {
    buffer: wavBuffer,
    contentType: 'audio/wav',
  };
}
