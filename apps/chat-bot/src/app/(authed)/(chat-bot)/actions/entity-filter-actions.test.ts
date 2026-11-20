import { getAssistantsByOverviewFilter } from '@shared/assistants/assistant-service';
import { getCharactersByOverviewFilter } from '@shared/characters/character-service';
import { getLearningScenariosByOverviewFilter } from '@shared/learning-scenarios/learning-scenario-service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { requireAuth } from '@/auth/requireAuth';

import { enrichAssistantsWithImage } from '../assistants/utils';
import {
  getAssistantsByFilterAction,
  getCharactersByFilterAction,
  getLearningScenariosByFilterAction,
} from './entity-filter-actions';

vi.mock('@/auth/requireAuth', () => ({ requireAuth: vi.fn() }));
vi.mock('@shared/assistants/assistant-service', () => ({ getAssistantsByOverviewFilter: vi.fn() }));
vi.mock('@shared/characters/character-service', () => ({ getCharactersByOverviewFilter: vi.fn() }));
vi.mock('@shared/learning-scenarios/learning-scenario-service', () => ({
  enrichLearningScenarioWithPictureUrl: vi.fn(),
  getLearningScenariosByOverviewFilter: vi.fn(),
}));
vi.mock('../assistants/utils', () => ({ enrichAssistantsWithImage: vi.fn() }));
vi.mock('../characters/utils', () => ({ enrichCharactersWithImage: vi.fn() }));

describe('entity filter actions', () => {
  beforeEach(() => {
    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: 'student', userRole: 'student', schoolIds: [] },
      federalState: { id: 'test', featureToggles: { isShareTemplateWithSchoolEnabled: true } },
    } as never);
  });

  it.each([
    ['characters', getCharactersByFilterAction, getCharactersByOverviewFilter],
    [
      'learning scenarios',
      getLearningScenariosByFilterAction,
      getLearningScenariosByOverviewFilter,
    ],
  ] as const)(
    'rejects student access to %s before service calls',
    async (_name, action, service) => {
      await expect(action('official')).rejects.toMatchObject({ name: 'ForbiddenError' });
      expect(service).not.toHaveBeenCalled();
    },
  );

  it('preserves authenticated student access to assistants', async () => {
    vi.mocked(getAssistantsByOverviewFilter).mockResolvedValue([]);
    vi.mocked(enrichAssistantsWithImage).mockResolvedValue([]);

    await expect(getAssistantsByFilterAction('official')).resolves.toEqual([]);
    expect(getAssistantsByOverviewFilter).toHaveBeenCalledWith({
      filter: 'official',
      user: { id: 'student', schoolIds: [], federalStateId: 'test' },
    });
  });
});
