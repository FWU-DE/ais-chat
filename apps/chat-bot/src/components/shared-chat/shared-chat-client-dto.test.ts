import type {
  CharacterWithShareDataModel,
  LearningScenarioWithShareDataModel,
} from '@shared/db/schema';
import { describe, expect, it } from 'vitest';
import { toSharedCharacterDto, toSharedLearningScenarioDto } from './shared-chat-client-dto';

const expiredAt = new Date('2026-01-01T00:00:00.000Z');

describe('shared chat client DTO projections', () => {
  it('projects a shared character without teacher-only fields', () => {
    const source = {
      id: 'character-id',
      name: 'Character',
      description: 'Description',
      modelId: 'model-id',
      initialMessage: 'Welcome',
      speechOnly: false,
      expiredAt,
      manuallyStoppedAt: null,
      didacticCommentary: 'teacher secret',
      privateSentinel: 'private',
    } as unknown as CharacterWithShareDataModel;

    const result = toSharedCharacterDto(source, 'invite-code');

    expect(result).toEqual({
      id: 'character-id',
      name: 'Character',
      description: 'Description',
      modelId: 'model-id',
      initialMessage: 'Welcome',
      speechOnly: false,
      expiredAt,
      manuallyStoppedAt: null,
      inviteCode: 'invite-code',
    });
    expect(result).not.toHaveProperty('didacticCommentary');
  });

  it('projects a shared learning scenario without teacher-only fields', () => {
    const source = {
      id: 'scenario-id',
      name: 'Scenario',
      description: 'Description',
      modelId: 'model-id',
      studentExercise: 'Exercise',
      speechOnly: false,
      expiredAt,
      manuallyStoppedAt: null,
      didacticCommentary: 'teacher secret',
      privateSentinel: 'private',
    } as unknown as LearningScenarioWithShareDataModel;

    const result = toSharedLearningScenarioDto(source, 'invite-code');

    expect(result).toEqual({
      id: 'scenario-id',
      name: 'Scenario',
      description: 'Description',
      modelId: 'model-id',
      studentExercise: 'Exercise',
      speechOnly: false,
      expiredAt,
      manuallyStoppedAt: null,
      inviteCode: 'invite-code',
    });
    expect(result).not.toHaveProperty('didacticCommentary');
  });
});
