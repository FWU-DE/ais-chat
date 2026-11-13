import type {
  CharacterWithShareDataModel,
  LearningScenarioWithShareDataModel,
} from '@shared/db/schema';
import { describe, expect, it } from 'vitest';

import { toSharedCharacterDto, toSharedLearningScenarioDto } from './shared-chat-client-dto';

const shared = {
  description: 'Description',
  modelId: 'model-id',
  speechOnly: false,
  expiredAt: new Date('2026-01-01'),
  manuallyStoppedAt: null,
  didacticCommentary: 'secret',
  privateSentinel: 'private',
};

describe('shared chat client DTO projections', () => {
  it('projects only the shared character fields', () => {
    const source = {
      ...shared,
      id: 'character-id',
      name: 'Character',
      initialMessage: 'Welcome',
    } as unknown as CharacterWithShareDataModel;
    expect(toSharedCharacterDto(source, 'invite')).toEqual({
      id: 'character-id',
      name: 'Character',
      description: 'Description',
      modelId: 'model-id',
      initialMessage: 'Welcome',
      speechOnly: false,
      expiredAt: shared.expiredAt,
      manuallyStoppedAt: null,
      inviteCode: 'invite',
    });
  });

  it('projects only the shared learning scenario fields', () => {
    const source = {
      ...shared,
      id: 'scenario-id',
      name: 'Scenario',
      studentExercise: 'Exercise',
    } as unknown as LearningScenarioWithShareDataModel;
    expect(toSharedLearningScenarioDto(source, 'invite')).toEqual({
      id: 'scenario-id',
      name: 'Scenario',
      description: 'Description',
      modelId: 'model-id',
      studentExercise: 'Exercise',
      speechOnly: false,
      expiredAt: shared.expiredAt,
      manuallyStoppedAt: null,
      inviteCode: 'invite',
    });
  });
});
