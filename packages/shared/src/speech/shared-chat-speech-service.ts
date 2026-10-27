import { requireTeacherRole } from '@shared/auth/authorization-service';
import { UserModel } from '@shared/auth/user-model';
import { dbUpdateTokenUsageByCharacterChatId } from '@shared/db/functions/character';
import { dbUpdateTokenUsageBySharedLearningScenarioId } from '@shared/db/functions/learning-scenario';
import { ForbiddenError } from '@shared/error';
import { FederalStateModel } from '@shared/federal-states/types';
import { constructNewMessageEvent, sendRabbitmqEvent } from '@shared/rabbitmq';
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

type SharedChatTeacherContext = {
  user: UserModel;
  federalState: FederalStateModel;
};

type SharedChatSpeechContext = {
  userId: string;
  entity: SharedChatEntity;
  entityType: SharedChatEntityType;
  teacher: SharedChatTeacherContext;
};

export type SharedChatSpeechParams = {
  inviteCode: string;
  entityType: SharedChatEntityType;
  entityId: string;
  text: string;
  voice?: string;
  abortSignal?: AbortSignal;
};

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

  const teacherContext: SharedChatTeacherContext = {
    user,
    federalState,
  };

  return runSpeechPipeline(
    {
      user: teacherContext.user,
      federalState: teacherContext.federalState,
      input: text,
      voice: voice ?? entity.voice,
      abortSignal,
    },
    createSharedChatSpeechStrategy({ entity, entityType, teacher: teacherContext }),
  );
}

function createSharedChatSpeechStrategy({
  entity,
  entityType,
  teacher,
}: {
  entity: SharedChatEntity;
  entityType: SharedChatEntityType;
  teacher: SharedChatTeacherContext;
}): SpeechStreamingPipelineStrategy<SharedChatSpeechContext> {
  return {
    loadContext: async () => ({
      userId: teacher.user.id,
      entity,
      entityType,
      teacher,
    }),
    checkAccess: async () => {
      requireTeacherRole(teacher.user.userRole);

      if (entity.isDeleted) {
        throw new ForbiddenError('Shared chat has been deleted');
      }
      if (entity.suspended) {
        throw new ForbiddenError('Shared chat has been suspended');
      }
      if (
        teacher.federalState.featureToggles.isSpeechModelEnabled !== true ||
        !entity.isSpeechEnabled
      ) {
        throw new ForbiddenError('Speech is not enabled for this shared chat');
      }
      if (sharedChatHasExpired(entity)) {
        throw new ForbiddenError('Shared chat has expired');
      }

      return true;
    },
    checkBudget: async () => {
      const teacherWithFederalState = { ...teacher.user, federalState: teacher.federalState };
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
          userId: context.userId,
          modelId: model.id,
          completionTokens: 0,
          promptTokens: 0,
          costsInCent,
        });
      } else {
        await dbUpdateTokenUsageBySharedLearningScenarioId({
          learningScenarioId: context.entity.id,
          userId: context.userId,
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
        user: { ...context.teacher.user, federalState: { id: context.teacher.federalState.id } },
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
