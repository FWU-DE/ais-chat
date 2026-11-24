import type {
  AssistantSelectModel,
  CharacterSelectModel,
  LearningScenarioSelectModel,
} from '@shared/db/schema';

/**
 * Only send fields consumed by the chat UI, not full configuration/database rows.
 * Pick narrows the types; explicit projections also remove other properties at runtime.
 */
type ChatFields = 'id' | 'name' | 'description' | 'isSpeechEnabled' | 'speechOnly' | 'voice';

export type ChatAssistantDto = Pick<AssistantSelectModel, ChatFields> & { description: string };
export type ChatCharacterDto = Pick<CharacterSelectModel, ChatFields> & { description: string };
export type ChatLearningScenarioDto = Pick<
  LearningScenarioSelectModel,
  ChatFields | 'studentExercise'
> & { description: string };

export function toChatAssistantDto(source: AssistantSelectModel): ChatAssistantDto {
  return {
    id: source.id,
    name: source.name,
    description: source.description ?? '',
    isSpeechEnabled: source.isSpeechEnabled,
    speechOnly: source.speechOnly,
    voice: source.voice,
  };
}

export function toChatCharacterDto(source: CharacterSelectModel): ChatCharacterDto {
  return {
    id: source.id,
    name: source.name,
    description: source.description ?? '',
    isSpeechEnabled: source.isSpeechEnabled,
    speechOnly: source.speechOnly,
    voice: source.voice,
  };
}

export function toChatLearningScenarioDto(
  source: LearningScenarioSelectModel,
): ChatLearningScenarioDto {
  return {
    id: source.id,
    name: source.name,
    description: source.description ?? '',
    isSpeechEnabled: source.isSpeechEnabled,
    speechOnly: source.speechOnly,
    voice: source.voice,
    studentExercise: source.studentExercise,
  };
}
