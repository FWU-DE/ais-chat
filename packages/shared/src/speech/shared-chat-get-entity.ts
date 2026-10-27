import { dbGetCharacterByIdAndInviteCode } from '@shared/db/functions/character';
import { dbGetLearningScenarioByIdAndInviteCode } from '@shared/db/functions/learning-scenario';
import { NotFoundError } from '@shared/error';
import { SharedChatEntity, SharedChatEntityType } from './shared-chat-types';

export async function getSharedChatEntity({
  inviteCode,
  entityType,
  entityId,
}: {
  inviteCode: string;
  entityType: SharedChatEntityType;
  entityId: string;
}): Promise<SharedChatEntity> {
  if (entityType === 'character') {
    const character = await dbGetCharacterByIdAndInviteCode({
      id: entityId,
      inviteCode,
    });
    if (character !== undefined) return character;
  }

  if (entityType === 'learningScenario') {
    const learningScenario = await dbGetLearningScenarioByIdAndInviteCode({
      learningScenarioId: entityId,
      inviteCode,
    });
    if (learningScenario !== undefined) return learningScenario;
  }

  throw new NotFoundError('Shared chat not found');
}
