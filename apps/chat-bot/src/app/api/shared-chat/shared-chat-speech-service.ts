import { getUserAndContextByUserId } from '@/auth/utils';
import { checkProductAccess } from '@/utils/vidis/access';
import { ForbiddenError } from '@shared/error';
import {
  sharedChatHasExpired,
  sharedCharacterChatHasReachedTokenPointsLimit,
  sharedLearningScenarioChatHasReachedTokenPointsLimit,
  userHasReachedTokenPointsLimit,
} from '@shared/users/usage';
import { generateSpeech } from '@/app/api/chat/speech-service';
import { getSharedChatEntity } from './shared-chat-get-entity';
import { verify } from '.';

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
}): Promise<Awaited<ReturnType<typeof generateSpeech>>> {
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

  if (teacher.userRole !== 'teacher') {
    throw new ForbiddenError('The user assigned to this chat is not a teacher');
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

  if (sharedChatLimitReached || userLimitReached) {
    throw new ForbiddenError('Token points limit reached');
  }

  return generateSpeech({ text });
}
