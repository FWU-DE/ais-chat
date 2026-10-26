import { generateSpeech, generateStaticMessageSpeech } from '@/app/api/chat/speech-service';
import { type UserAndContext } from '@/auth/types';
import { getUserAndContextByUserId } from '@/auth/utils';
import { checkProductAccess } from '@/utils/vidis/access';
import { TokenPointsExceededError } from '@ais-chat/ai-core';
import { requireTeacherRole } from '@shared/auth/authorization-service';
import { dbUpdateTokenUsageByCharacterChatId } from '@shared/db/functions/character';
import { dbUpdateTokenUsageBySharedLearningScenarioId } from '@shared/db/functions/learning-scenario';
import { ForbiddenError, NotFoundError } from '@shared/error';
import {
  constructNewMessageEvent,
  constructTokenBudgetExceededEvent,
  sendRabbitmqEvent,
} from '@shared/rabbitmq';
import {
  sharedCharacterChatHasReachedTokenPointsLimit,
  sharedChatHasExpired,
  sharedLearningScenarioChatHasReachedTokenPointsLimit,
  userHasReachedTokenPointsLimit,
} from '@shared/users/usage';
import { verify } from '.';
import { getSharedChatEntity } from './shared-chat-get-entity';
import {
  SharedChatCharacter,
  SharedChatEntity,
  SharedChatLearningScenario,
} from './shared-chat-types';

export async function generateSharedChatSpeech({
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
}): Promise<{ buffer: Buffer; contentType: string }> {
  const { entity, teacher } = await verifySharedChatSpeechAccess({
    inviteCode,
    entityType,
    entityId,
  });

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
    await sendRabbitmqEvent(constructTokenBudgetExceededEvent({ user: teacher }));
  }

  if (sharedChatLimitReached || userLimitReached) {
    throw new TokenPointsExceededError();
  }

  const speechResult = await generateSpeech({ text, voice: entity.voice, abortSignal });

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

async function verifySharedChatSpeechAccess({
  inviteCode,
  entityType,
  entityId,
}: {
  inviteCode: string;
  entityType: 'character' | 'learningScenario';
  entityId: string;
}): Promise<{ entity: SharedChatEntity; teacher: UserAndContext }> {
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

  return { entity, teacher };
}

/**
 * Generates speech for a shared character's initial message. The text is resolved server-side from
 * the character (not accepted from the client), and the result is cached and unbilled.
 */
export async function generateSharedChatInitialMessageSpeech({
  inviteCode,
  characterId,
  abortSignal,
}: {
  inviteCode: string;
  characterId: string;
  abortSignal?: AbortSignal;
}): Promise<{ buffer: Buffer; contentType: string }> {
  const { entity } = await verifySharedChatSpeechAccess({
    inviteCode,
    entityType: 'character',
    entityId: characterId,
  });

  const character = entity as SharedChatCharacter;

  if (!character.initialMessage) {
    throw new NotFoundError('Character has no initial message');
  }

  return generateStaticMessageSpeech({
    text: character.initialMessage,
    voice: character.voice,
    abortSignal,
  });
}
