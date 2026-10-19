import type { ChatSpeechStreamResult } from '@/app/api/chat/speech-service';
import { generateSpeech, generateSpeechStream } from '@/app/api/chat/speech-service';
import { getUserAndContextByUserId } from '@/auth/utils';
import { constructTokenBudgetExceededEvent } from '@/rabbitmq/events/budget-exceeded';
import { constructNewMessageEvent } from '@/rabbitmq/events/new-message';
import { sendRabbitmqEvent } from '@/rabbitmq/send';
import { checkProductAccess } from '@/utils/vidis/access';
import { TokenPointsExceededError } from '@ais-chat/ai-core';
import { requireTeacherRole } from '@shared/auth/authorization-service';
import { dbUpdateTokenUsageByCharacterChatId } from '@shared/db/functions/character';
import { dbUpdateTokenUsageBySharedLearningScenarioId } from '@shared/db/functions/learning-scenario';
import { ForbiddenError } from '@shared/error';
import {
  sharedCharacterChatHasReachedTokenPointsLimit,
  sharedChatHasExpired,
  sharedLearningScenarioChatHasReachedTokenPointsLimit,
  userHasReachedTokenPointsLimit,
} from '@shared/users/usage';
import { verify } from '.';
import { getSharedChatEntity } from './shared-chat-get-entity';
import { SharedChatCharacter, SharedChatLearningScenario } from './shared-chat-types';

export async function generateSharedChatSpeech({
  inviteCode,
  entityType,
  entityId,
  text,
}: {
  inviteCode: string;
  entityType: 'character' | 'learningScenario';
  entityId: string;
  text: string;
}): Promise<{ buffer: Buffer; contentType: string }> {
  const entity = await getSharedChatEntity({ inviteCode, entityType, entityId });

  verify.sharedChatEntityIsAccessible(entity);

  if (entity.startedBy === null) {
    throw new ForbiddenError('Shared chat has no owner');
  }

  const teacher = await getUserAndContextByUserId({ userId: entity.startedBy });

  const productAccess = checkProductAccess(teacher);
  if (!productAccess.hasAccess) {
    throw new ForbiddenError(`Owner has no product access: ${productAccess.errorType}`);
  }

  requireTeacherRole(teacher.userRole);

  if (
    teacher.federalState.featureToggles.isSpeechModelEnabled !== true ||
    !entity.isSpeechEnabled
  ) {
    throw new ForbiddenError('Speech is not enabled for this shared chat');
  }

  if (sharedChatHasExpired(entity)) {
    throw new ForbiddenError('Shared chat has expired');
  }

  const [sharedChatLimitReached, userLimitReached] = await Promise.all([
    entityType === 'character'
      ? sharedCharacterChatHasReachedTokenPointsLimit({ user: teacher, character: entity })
      : sharedLearningScenarioChatHasReachedTokenPointsLimit({
          user: teacher,
          learningScenario: entity,
        }),
    userHasReachedTokenPointsLimit({ user: teacher }),
  ]);

  if (userLimitReached) {
    await sendRabbitmqEvent(
      constructTokenBudgetExceededEvent(
        entityType === 'character'
          ? { anonymous: true, user: teacher, character: entity as SharedChatCharacter }
          : { anonymous: true, user: teacher, sharedChat: entity as SharedChatLearningScenario },
      ),
    );
  }

  if (sharedChatLimitReached || userLimitReached) {
    throw new TokenPointsExceededError();
  }

  const speechResult = await generateSpeech({ text, voice: entity.voice });

  if (entityType === 'character') {
    await dbUpdateTokenUsageByCharacterChatId({
      characterId: entityId,
      userId: entity.startedBy,
      modelId: speechResult.modelId,
      completionTokens: 0,
      promptTokens: 0,
      costsInCent: speechResult.costsInCent,
    });

    await sendRabbitmqEvent(
      constructNewMessageEvent({
        user: teacher,
        anonymous: true,
        character: entity as SharedChatCharacter,
        provider: speechResult.provider,
        modelName: speechResult.modelName,
        promptTokens: 0,
        completionTokens: 0,
        costsInCent: speechResult.costsInCent,
      }),
    );
  } else {
    await dbUpdateTokenUsageBySharedLearningScenarioId({
      learningScenarioId: entityId,
      userId: entity.startedBy,
      modelId: speechResult.modelId,
      completionTokens: 0,
      promptTokens: 0,
      costsInCent: speechResult.costsInCent,
    });

    await sendRabbitmqEvent(
      constructNewMessageEvent({
        user: teacher,
        anonymous: true,
        sharedChat: entity as SharedChatLearningScenario,
        provider: speechResult.provider,
        modelName: speechResult.modelName,
        promptTokens: 0,
        completionTokens: 0,
        costsInCent: speechResult.costsInCent,
      }),
    );
  }

  return { buffer: speechResult.buffer, contentType: speechResult.contentType };
}

/**
 * Streaming counterpart of `generateSharedChatSpeech`. Reuses the same accessibility/role/expiry/
 * budget pre-checks, but yields raw PCM chunks as they arrive instead of waiting for the full
 * audio. This is a new, additive function — `generateSharedChatSpeech`/its route is untouched.
 */
export async function generateSharedChatSpeechStream({
  inviteCode,
  entityType,
  entityId,
  text,
  abortSignal,
}: {
  inviteCode: string;
  entityType: 'character' | 'learningScenario';
  entityId: string;
  text: string;
  abortSignal?: AbortSignal;
}): Promise<ChatSpeechStreamResult> {
  const entity = await getSharedChatEntity({ inviteCode, entityType, entityId });

  verify.sharedChatEntityIsAccessible(entity);

  if (entity.startedBy === null) {
    throw new ForbiddenError('Shared chat has no owner');
  }

  const teacher = await getUserAndContextByUserId({ userId: entity.startedBy });

  const productAccess = checkProductAccess(teacher);
  if (!productAccess.hasAccess) {
    throw new ForbiddenError(`Owner has no product access: ${productAccess.errorType}`);
  }

  requireTeacherRole(teacher.userRole);

  if (
    teacher.federalState.featureToggles.isSpeechModelEnabled !== true ||
    !entity.isSpeechEnabled
  ) {
    throw new ForbiddenError('Speech is not enabled for this shared chat');
  }

  if (sharedChatHasExpired(entity)) {
    throw new ForbiddenError('Shared chat has expired');
  }

  const [sharedChatLimitReached, userLimitReached] = await Promise.all([
    entityType === 'character'
      ? sharedCharacterChatHasReachedTokenPointsLimit({ user: teacher, character: entity })
      : sharedLearningScenarioChatHasReachedTokenPointsLimit({
          user: teacher,
          learningScenario: entity,
        }),
    userHasReachedTokenPointsLimit({ user: teacher }),
  ]);

  if (userLimitReached) {
    await sendRabbitmqEvent(
      constructTokenBudgetExceededEvent(
        entityType === 'character'
          ? { anonymous: true, user: teacher, character: entity as SharedChatCharacter }
          : { anonymous: true, user: teacher, sharedChat: entity as SharedChatLearningScenario },
      ),
    );
  }

  if (sharedChatLimitReached || userLimitReached) {
    throw new TokenPointsExceededError();
  }

  const speechResult = await generateSpeechStream({ text, voice: entity.voice, abortSignal });
  const startedBy = entity.startedBy;

  async function* chunksWithUsageLogging() {
    try {
      yield* speechResult.chunks;
    } finally {
      const costsInCent = await speechResult.costsInCent;

      if (entityType === 'character') {
        await dbUpdateTokenUsageByCharacterChatId({
          characterId: entityId,
          userId: startedBy,
          modelId: speechResult.modelId,
          completionTokens: 0,
          promptTokens: 0,
          costsInCent,
        });

        await sendRabbitmqEvent(
          constructNewMessageEvent({
            user: teacher,
            anonymous: true,
            character: entity as SharedChatCharacter,
            provider: speechResult.provider,
            modelName: speechResult.modelName,
            promptTokens: 0,
            completionTokens: 0,
            costsInCent,
          }),
        );
      } else {
        await dbUpdateTokenUsageBySharedLearningScenarioId({
          learningScenarioId: entityId,
          userId: startedBy,
          modelId: speechResult.modelId,
          completionTokens: 0,
          promptTokens: 0,
          costsInCent,
        });

        await sendRabbitmqEvent(
          constructNewMessageEvent({
            user: teacher,
            anonymous: true,
            sharedChat: entity as SharedChatLearningScenario,
            provider: speechResult.provider,
            modelName: speechResult.modelName,
            promptTokens: 0,
            completionTokens: 0,
            costsInCent,
          }),
        );
      }
    }
  }

  return {
    chunks: chunksWithUsageLogging(),
    contentType: speechResult.contentType,
    format: speechResult.format,
  };
}
