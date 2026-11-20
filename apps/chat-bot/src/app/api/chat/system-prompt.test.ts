import { HELP_MODE_ASSISTANT_ID } from '@shared/db/const';
import type { AssistantSelectModel } from '@shared/db/schema';
import { describe, expect, it } from 'vitest';

import type { ObscuredFederalState } from '@/auth/utils';

import { constructChatSystemPrompt } from './system-prompt';

const helpModeAssistant = { id: HELP_MODE_ASSISTANT_ID } as AssistantSelectModel;

function createFederalState(
  featureToggles: Partial<ObscuredFederalState['featureToggles']> = {},
): ObscuredFederalState {
  return {
    id: 'federal-state-1',
    supportContacts: null,
    chatStorageTime: 120,
    featureToggles: { isStudentAccessEnabled: true, ...featureToggles },
  } as ObscuredFederalState;
}

describe('constructChatSystemPrompt (help mode)', () => {
  it('does not mention anonymization when the toggle is disabled', () => {
    const prompt = constructChatSystemPrompt({
      assistant: helpModeAssistant,
      isTeacher: true,
      federalState: createFederalState({ isAnonymizationEnabled: false }),
    });

    expect(prompt).not.toContain('Anonymisierung');
  });

  it('describes placeholder mode when enabled without an explicit mode', () => {
    const prompt = constructChatSystemPrompt({
      assistant: helpModeAssistant,
      isTeacher: true,
      federalState: createFederalState({ isAnonymizationEnabled: true }),
    });

    expect(prompt).toContain('automatische Anonymisierung aktiviert');
    expect(prompt).toContain('Platzhalter');
  });

  it('describes pseudonym mode when configured', () => {
    const prompt = constructChatSystemPrompt({
      assistant: helpModeAssistant,
      isTeacher: true,
      federalState: createFederalState({
        isAnonymizationEnabled: true,
        anonymizationMode: 'pseudonym',
      }),
    });

    expect(prompt).toContain('automatische Anonymisierung aktiviert');
    expect(prompt).toContain('Pseudonyme');
  });
});
