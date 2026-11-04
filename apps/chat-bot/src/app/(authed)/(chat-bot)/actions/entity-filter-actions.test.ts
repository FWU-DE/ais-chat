import { requireAuth } from '@/auth/requireAuth';
import { getAssistantsByOverviewFilter } from '@shared/assistants/assistant-service';
import { getCharactersByOverviewFilter } from '@shared/characters/character-service';
import { getLearningScenariosByOverviewFilter } from '@shared/learning-scenarios/learning-scenario-service';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getAssistantsByFilterAction,
  getCharactersByFilterAction,
  getLearningScenariosByFilterAction,
} from './entity-filter-actions';

vi.mock('@/auth/requireAuth', () => ({ requireAuth: vi.fn() }));
vi.mock('@shared/assistants/assistant-service', () => ({
  getAssistantsByOverviewFilter: vi.fn(),
}));
vi.mock('@shared/characters/character-service', () => ({
  getCharactersByOverviewFilter: vi.fn(),
}));
vi.mock('@shared/learning-scenarios/learning-scenario-service', () => ({
  enrichLearningScenarioWithPictureUrl: vi.fn(),
  getLearningScenariosByOverviewFilter: vi.fn(),
}));
vi.mock('../assistants/utils', () => ({ enrichAssistantsWithImage: vi.fn() }));
vi.mock('../characters/utils', () => ({ enrichCharactersWithImage: vi.fn() }));

describe('entity filter actions', () => {
  beforeEach(() => {
    vi.mocked(requireAuth).mockResolvedValue({
      user: {
        id: 'student-id',
        userRole: 'student',
        schoolIds: [],
      },
      federalState: {
        id: 'DE-TEST',
        featureToggles: {
          isShareTemplateWithSchoolEnabled: true,
        },
      },
    } as never);
  });

  it.each([
    ['characters', getCharactersByFilterAction, getCharactersByOverviewFilter],
    [
      'learning scenarios',
      getLearningScenariosByFilterAction,
      getLearningScenariosByOverviewFilter,
    ],
    ['assistants', getAssistantsByFilterAction, getAssistantsByOverviewFilter],
  ] as const)('rejects student access to %s', async (_name, action, service) => {
    await expect(action('official')).rejects.toMatchObject({ name: 'ForbiddenError' });
    expect(service).not.toHaveBeenCalled();
  });
});
