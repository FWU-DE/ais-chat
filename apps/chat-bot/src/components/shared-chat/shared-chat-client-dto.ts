import type {
  CharacterWithShareDataModel,
  LearningScenarioWithShareDataModel,
} from '@shared/db/schema';

type SharedChatEntityDto = {
  id: string;
  name: string;
  description: string;
  modelId: string;
  speechOnly: boolean;
  expiredAt: Date;
  manuallyStoppedAt: Date | null;
  inviteCode: string;
};

export type SharedCharacterDto = SharedChatEntityDto & { initialMessage: string | null };
export type SharedLearningScenarioDto = SharedChatEntityDto & { studentExercise: string };

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
