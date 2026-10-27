import { requireTeacherRole } from '@shared/auth/authorization-service';
import { UserModel } from '@shared/auth/user-model';
import { dbUpdateTokenUsageByCharacterChatId } from '@shared/db/functions/character';
import { dbUpdateTokenUsageBySharedLearningScenarioId } from '@shared/db/functions/learning-scenario';
import { ForbiddenError, NotFoundError } from '@shared/error';
import { FederalStateModel } from '@shared/federal-states/types';
import { constructNewMessageEvent, sendRabbitmqEvent } from '@shared/rabbitmq';
import { verify } from '@shared/shared-chat';
import {
  sharedCharacterChatHasReachedTokenPointsLimit,
  sharedChatHasExpired,
  sharedLearningScenarioChatHasReachedTokenPointsLimit,
  userHasReachedTokenPointsLimit,
} from '@shared/users/usage';
import { getUserWithFederalState } from '@shared/users/user-service';
import { getSharedChatEntity } from './shared-chat-get-entity';
import {
  SharedChatCharacter,
  SharedChatEntity,
  SharedChatEntityType,
  SharedChatLearningScenario,
} from './shared-chat-types';
import { runSpeechPipeline, SpeechStreamingPipelineStrategy } from './streaming/speech-pipeline';
import { ChatSpeechStreamResult } from './types';

type SharedChatSpeechContext = {
  user: UserModel;
  federalState: FederalStateModel;
  entity: SharedChatEntity;
  entityType: SharedChatEntityType;
};

export type SharedChatSpeechParams = {
  inviteCode: string;
  entityType: SharedChatEntityType;
  entityId: string;
  text: string;
  voice?: string;
  abortSignal?: AbortSignal;
};

export type SharedChatInitialMessageSpeechParams = Pick<
  SharedChatSpeechParams,
  'inviteCode' | 'entityType' | 'entityId' | 'abortSignal'
>;

export async function generateSharedChatSpeechStreamForInitialMessage({
  inviteCode,
  entityType,
  entityId,
  abortSignal,
}: SharedChatInitialMessageSpeechParams): Promise<ChatSpeechStreamResult> {
  const entity = await getSharedChatEntity({ inviteCode, entityType, entityId });

  verify.sharedChatEntityIsAccessible(entity);

  if (!('initialMessage' in entity) || !entity.initialMessage) {
    throw new NotFoundError('Shared chat has no initial message');
  }

  return generateSharedChatSpeechStream({
    inviteCode,
    entityType,
    entityId,
    text: entity.initialMessage,
    voice: entity.voice,
    abortSignal,
  });
}

/**
 * Generates a speech stream for messages in a shared chat.
 */
export async function generateSharedChatSpeechStream({
  inviteCode,
  entityType,
  entityId,
  text,
  voice,
  abortSignal,
}: SharedChatSpeechParams): Promise<ChatSpeechStreamResult> {
  const entity = await getSharedChatEntity({ inviteCode, entityType, entityId });

  if (entity.startedBy === null) {
    throw new ForbiddenError('Shared chat has no owner');
  }

  const { user, federalState } = await getUserWithFederalState({
    userId: entity.startedBy,
  });

  return runSpeechPipeline(
    {
      user,
      federalState,
      input: text,
      voice: voice ?? entity.voice,
      abortSignal,
    },
    createSharedChatSpeechStrategy({ entity, entityType, user, federalState }),
  );
}

function createSharedChatSpeechStrategy({
  entity,
  entityType,
  user,
  federalState,
}: {
  entity: SharedChatEntity;
  entityType: SharedChatEntityType;
  user: UserModel;
  federalState: FederalStateModel;
}): SpeechStreamingPipelineStrategy<SharedChatSpeechContext> {
  return {
    loadContext: async () => ({
      user,
      federalState,
      entity,
      entityType,
    }),
    checkAccess: async () => {
      requireTeacherRole(user.userRole);

      if (entity.isDeleted) {
        throw new ForbiddenError('Shared chat has been deleted');
      }
      if (entity.suspended) {
        throw new ForbiddenError('Shared chat has been suspended');
      }
      if (federalState.featureToggles.isSpeechModelEnabled !== true || !entity.isSpeechEnabled) {
        throw new ForbiddenError('Speech is not enabled for this shared chat');
      }
      if (sharedChatHasExpired(entity)) {
        throw new ForbiddenError('Shared chat has expired');
      }

      return true;
    },
    checkBudget: async () => {
      const teacherWithFederalState = { ...user, federalState };
      const [sharedChatLimitReached, userLimitReached] = await Promise.all([
        entityType === 'character'
          ? sharedCharacterChatHasReachedTokenPointsLimit({
              user: teacherWithFederalState,
              character: entity,
            })
          : sharedLearningScenarioChatHasReachedTokenPointsLimit({
              user: teacherWithFederalState,
              learningScenario: entity,
            }),
        userHasReachedTokenPointsLimit({ user: teacherWithFederalState }),
      ]);

      if (userLimitReached) return 'userTokenLimitReached';
      if (sharedChatLimitReached) return 'entityTokenLimitReached';
      return 'sufficient';
    },
    storeUsage: async (_params, context, model, result) => {
      const costsInCent = await result.costsInCent;

      if (context.entityType === 'character') {
        await dbUpdateTokenUsageByCharacterChatId({
          characterId: context.entity.id,
          userId: context.user.id,
          modelId: model.id,
          completionTokens: 0,
          promptTokens: 0,
          costsInCent,
        });
      } else {
        await dbUpdateTokenUsageBySharedLearningScenarioId({
          learningScenarioId: context.entity.id,
          userId: context.user.id,
          modelId: model.id,
          completionTokens: 0,
          promptTokens: 0,
          costsInCent,
        });
      }
    },
    reportUsage: async (_params, context, model, result) => {
      const costsInCent = await result.costsInCent;
      const common = {
        user: { ...context.user, federalState: { id: context.federalState.id } },
        anonymous: true,
        provider: model.provider,
        modelName: model.name,
        promptTokens: 0,
        completionTokens: 0,
        costsInCent,
      };

      await sendRabbitmqEvent(
        constructNewMessageEvent(
          context.entityType === 'character'
            ? { ...common, character: context.entity as SharedChatCharacter }
            : { ...common, sharedChat: context.entity as SharedChatLearningScenario },
        ),
      );
    },
  };
}
