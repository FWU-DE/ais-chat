import { generateSpeechById, TokenPointsExceededError } from '@ais-chat/ai-core';
import { dbGetSpeechModel } from '@shared/db/functions/llm-model';
import { InvalidArgumentError } from '@shared/error';
import { calculateSpeechCostsInCent } from '@/app/api/utils/utils';
import {
  getCachedSpeechPreview,
  setCachedSpeechPreview,
} from '@/app/api/utils/speech-preview-cache';
import { getConversation } from '@shared/conversation/conversation-service';
import { dbInsertConversationUsage } from '@shared/db/functions/token-usage';
import { userHasReachedTokenPointsLimit } from '@shared/users/usage';
import { sendRabbitmqEvent } from '@/rabbitmq/send';
import { constructNewMessageEvent } from '@/rabbitmq/events/new-message';
import { constructTokenBudgetExceededEvent } from '@/rabbitmq/events/budget-exceeded';
import { UserAndContext } from '@/auth/types';

export async function generateSpeech({ text, voice }: { text: string; voice?: string }) {
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
