import type {
  AssistantSelectModel,
  CharacterSelectModel,
  LearningScenarioSelectModel,
} from '@shared/db/schema';
import { describe, expect, it } from 'vitest';
import {
  toChatAssistantDto,
  toChatCharacterDto,
  toChatLearningScenarioDto,
} from './chat-client-dto';

describe('chat client DTO projections', () => {
  it('projects an assistant without teacher-only fields', () => {
    const source = {
      id: 'assistant-id',
      name: 'Assistant',
      description: 'Description',
      isSpeechEnabled: true,
      speechOnly: false,
      voice: 'voice',
      didacticCommentary: 'teacher secret',
      privateSentinel: 'private',
    } as unknown as AssistantSelectModel;

    const result = toChatAssistantDto(source);

    expect(result).toEqual({
      id: 'assistant-id',
      name: 'Assistant',
      description: 'Description',
      isSpeechEnabled: true,
      speechOnly: false,
      voice: 'voice',
    });
    expect(result).not.toHaveProperty('didacticCommentary');
  });

  it('projects a character without teacher-only fields', () => {
    const source = {
      id: 'character-id',
      name: 'Character',
      description: 'Description',
      isSpeechEnabled: true,
      speechOnly: false,
      voice: 'voice',
      didacticCommentary: 'teacher secret',
      privateSentinel: 'private',
    } as unknown as CharacterSelectModel;

    const result = toChatCharacterDto(source);

    expect(result).toEqual({
      id: 'character-id',
      name: 'Character',
      description: 'Description',
      isSpeechEnabled: true,
      speechOnly: false,
      voice: 'voice',
    });
    expect(result).not.toHaveProperty('didacticCommentary');
  });

  it('projects a learning scenario without teacher-only fields', () => {
    const source = {
      id: 'scenario-id',
      name: 'Scenario',
      description: 'Description',
      isSpeechEnabled: true,
      speechOnly: false,
      voice: 'voice',
      studentExercise: 'Exercise',
      didacticCommentary: 'teacher secret',
      privateSentinel: 'private',
    } as unknown as LearningScenarioSelectModel;

    const result = toChatLearningScenarioDto(source);

    expect(result).toEqual({
      id: 'scenario-id',
      name: 'Scenario',
      description: 'Description',
      isSpeechEnabled: true,
      speechOnly: false,
      voice: 'voice',
      studentExercise: 'Exercise',
    });
    expect(result).not.toHaveProperty('didacticCommentary');
  });
});
