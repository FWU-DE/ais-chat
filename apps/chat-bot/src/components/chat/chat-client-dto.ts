import type {
  AssistantSelectModel,
  CharacterSelectModel,
  LearningScenarioSelectModel,
} from '@shared/db/schema';

export type ChatAssistantDto = {
  id: string;
  name: string;
  description: string;
  isSpeechEnabled: boolean;
  speechOnly: boolean;
  voice: string;
};

export type ChatCharacterDto = ChatAssistantDto;

export type ChatLearningScenarioDto = ChatAssistantDto & { studentExercise: string };

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
