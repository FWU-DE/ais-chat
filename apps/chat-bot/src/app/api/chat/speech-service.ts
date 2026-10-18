import {
  getCachedSpeechPreview,
  setCachedSpeechPreview,
} from '@/app/api/utils/speech-preview-cache';
import { calculateSpeechCostsInCent } from '@/app/api/utils/utils';
import { UserAndContext } from '@/auth/types';
import { constructTokenBudgetExceededEvent } from '@/rabbitmq/events/budget-exceeded';
import { constructNewMessageEvent } from '@/rabbitmq/events/new-message';
import { sendRabbitmqEvent } from '@/rabbitmq/send';
import { generateSpeechById, TokenPointsExceededError } from '@ais-chat/ai-core';
import { getConversation } from '@shared/conversation/conversation-service';
import { dbGetSpeechModel } from '@shared/db/functions/llm-model';
import { dbInsertConversationUsage } from '@shared/db/functions/token-usage';
import { InvalidArgumentError } from '@shared/error';
import { userHasReachedTokenPointsLimit } from '@shared/users/usage';

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
 * Generates speech for a static, non-conversational message (e.g. a character's initial message).
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
