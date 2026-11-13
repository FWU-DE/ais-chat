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
  it.each([
    ['assistant', toChatAssistantDto, { id: 'assistant-id' } as AssistantSelectModel],
    ['character', toChatCharacterDto, { id: 'character-id' } as CharacterSelectModel],
  ])('projects a %s without private fields', (_name, project, idOnly) => {
    const source = {
      ...idOnly,
      name: 'Entity',
      description: 'Description',
      isSpeechEnabled: true,
      speechOnly: false,
      voice: 'voice',
      didacticCommentary: 'secret',
      privateSentinel: 'private',
    } as never;
    expect(project(source)).toEqual({
      id: _name === 'assistant' ? 'assistant-id' : 'character-id',
      name: 'Entity',
      description: 'Description',
      isSpeechEnabled: true,
      speechOnly: false,
      voice: 'voice',
    });
  });

  it('retains the learning exercise while omitting private fields', () => {
    const source = {
      id: 'scenario-id',
      name: 'Scenario',
      description: 'Description',
      isSpeechEnabled: true,
      speechOnly: false,
      voice: 'voice',
      studentExercise: 'Exercise',
      didacticCommentary: 'secret',
      privateSentinel: 'private',
    } as unknown as LearningScenarioSelectModel;
    expect(toChatLearningScenarioDto(source)).toEqual({
      id: 'scenario-id',
      name: 'Scenario',
      description: 'Description',
      isSpeechEnabled: true,
      speechOnly: false,
      voice: 'voice',
      studentExercise: 'Exercise',
    });
  });
});
