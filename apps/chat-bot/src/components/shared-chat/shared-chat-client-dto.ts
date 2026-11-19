import type {
  CharacterWithShareDataModel,
  LearningScenarioWithShareDataModel,
} from '@shared/db/schema';

/**
 * Invite-based chats need only display, model and session-state fields.
 * Explicit projections prevent configuration and internal row fields reaching the browser.
 */
type SharedChatFields =
  | 'id'
  | 'name'
  | 'description'
  | 'modelId'
  | 'speechOnly'
  | 'expiredAt'
  | 'manuallyStoppedAt'
  | 'inviteCode';

export type SharedCharacterDto = Pick<
  CharacterWithShareDataModel,
  SharedChatFields | 'initialMessage'
>;
export type SharedLearningScenarioDto = Pick<
  LearningScenarioWithShareDataModel,
  SharedChatFields | 'studentExercise'
>;

export function toSharedCharacterDto(
  source: CharacterWithShareDataModel,
  inviteCode: string,
): SharedCharacterDto {
  return {
    id: source.id,
    name: source.name,
    description: source.description,
    modelId: source.modelId,
    initialMessage: source.initialMessage,
    speechOnly: source.speechOnly,
    expiredAt: source.expiredAt,
    manuallyStoppedAt: source.manuallyStoppedAt,
    inviteCode,
  };
}

export function toSharedLearningScenarioDto(
  source: LearningScenarioWithShareDataModel,
  inviteCode: string,
): SharedLearningScenarioDto {
  return {
    id: source.id,
    name: source.name,
    description: source.description,
    modelId: source.modelId,
    studentExercise: source.studentExercise,
    speechOnly: source.speechOnly,
    expiredAt: source.expiredAt,
    manuallyStoppedAt: source.manuallyStoppedAt,
    inviteCode,
  };
}
