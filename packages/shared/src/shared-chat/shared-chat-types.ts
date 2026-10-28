import { dbGetCharacterByIdAndInviteCode } from '@shared/db/functions/character';
import { dbGetLearningScenarioByIdAndInviteCode } from '@shared/db/functions/learning-scenario';
import { FileMetadata } from '@shared/db/schema';

export type SharedSessionId = string;

export type SharedChatCharacter = NonNullable<
  Awaited<ReturnType<typeof dbGetCharacterByIdAndInviteCode>>
>;

export type SharedChatLearningScenario = NonNullable<
  Awaited<ReturnType<typeof dbGetLearningScenarioByIdAndInviteCode>>
>;

export type SharedChatEntity = SharedChatCharacter | SharedChatLearningScenario;

/** This object is stored in the metadata column of the files table.
 * It contains the shared chat ownership information as well as any other metadata
 * relevant for that file.
 */
export type SharedChatFileMetadata = {
  sessionId: string;
  inviteCode: string;
  entityType: 'character' | 'learningScenario';
  entityId: string;
} & FileMetadata;

export function isSharedChatFileMetadata(metadata: unknown): metadata is SharedChatFileMetadata {
  if (metadata === null || typeof metadata !== 'object') {
    return false;
  }
  const m = metadata as Record<string, unknown>;
  return (
    typeof m.sessionId === 'string' &&
    typeof m.inviteCode === 'string' &&
    (m.entityType === 'character' || m.entityType === 'learningScenario') &&
    typeof m.entityId === 'string'
  );
}
