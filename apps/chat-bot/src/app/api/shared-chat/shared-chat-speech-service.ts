import { generateSpeech } from '@/app/api/chat/speech-service';
import { getUserAndContextByUserId } from '@/auth/utils';
import { checkProductAccess } from '@/utils/vidis/access';
import { requireTeacherRole } from '@shared/auth/authorization-service';
import { dbUpdateTokenUsageByCharacterChatId } from '@shared/db/functions/character';
import { dbUpdateTokenUsageBySharedLearningScenarioId } from '@shared/db/functions/learning-scenario';
import { ForbiddenError } from '@shared/error';
import { TokenPointsExceededError } from '@ais-chat/ai-core';
import {
  sharedCharacterChatHasReachedTokenPointsLimit,
  sharedChatHasExpired,
  sharedLearningScenarioChatHasReachedTokenPointsLimit,
  userHasReachedTokenPointsLimit,
} from '@shared/users/usage';
import { sendRabbitmqEvent } from '@/rabbitmq/send';
import { constructTokenBudgetExceededEvent } from '@/rabbitmq/events/budget-exceeded';
import { constructNewMessageEvent } from '@/rabbitmq/events/new-message';
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
