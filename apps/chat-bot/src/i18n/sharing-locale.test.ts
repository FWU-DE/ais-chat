import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from './locales';

const mocks = vi.hoisted(() => ({
  cacheLifeMock: vi.fn(),
  generateTextWithBillingMock: vi.fn(),
  dbGetCharacterByIdMock: vi.fn(),
  dbUpdateCharacterFilterGroupMock: vi.fn(),
  dbGetLearningScenarioByIdMock: vi.fn(),
  dbUpdateLearningScenarioFilterGroupMock: vi.fn(),
  dbGetFederalStateByUserIdMock: vi.fn(),
  getMaybeUserMock: vi.fn(),
  getModelAndApiKeyWithResultMock: vi.fn(),
  getStrongAuxiliaryModelMock: vi.fn(),
  constructCharacterLanguageSystemPromptMock: vi.fn(),
  constructLearningScenarioLanguageSystemPromptMock: vi.fn(),
}));

vi.mock('next/cache', () => ({
  cacheLife: mocks.cacheLifeMock,
}));

vi.mock('@ais-chat/ai-core', () => ({
  generateTextWithBilling: mocks.generateTextWithBillingMock,
}));

vi.mock('@shared/db/functions/character', () => ({
  dbGetCharacterById: mocks.dbGetCharacterByIdMock,
  dbUpdateCharacterFilterGroup: mocks.dbUpdateCharacterFilterGroupMock,
}));

vi.mock('@shared/db/functions/learning-scenario', () => ({
  dbGetLearningScenarioById: mocks.dbGetLearningScenarioByIdMock,
  dbUpdateLearningScenarioFilterGroup: mocks.dbUpdateLearningScenarioFilterGroupMock,
}));

vi.mock('@shared/db/functions/school', () => ({
  dbGetFederalStateByUserId: mocks.dbGetFederalStateByUserIdMock,
}));

vi.mock('@/auth/utils', () => ({
  getMaybeUser: mocks.getMaybeUserMock,
}));

vi.mock('@/app/api/utils/utils', () => ({
  getModelAndApiKeyWithResult: mocks.getModelAndApiKeyWithResultMock,
  getStrongAuxiliaryModel: mocks.getStrongAuxiliaryModelMock,
}));

vi.mock('@/app/api/character/system-prompt', () => ({
  constructCharacterLanguageSystemPrompt: mocks.constructCharacterLanguageSystemPromptMock,
}));

vi.mock('@/app/api/learning-scenario/system-prompt', () => ({
  constructLearningScenarioLanguageSystemPrompt:
    mocks.constructLearningScenarioLanguageSystemPromptMock,
}));

const sharingFederalState = {
  id: 'federal-state-1',
  featureToggles: {
    isSharedPageLocaleDetectionEnabled: true,
  },
};

const auxiliaryModel = {
  id: 'aux-model-1',
};

const modelAndApiKey = {
  model: { id: 'aux-model-1' },
  apiKeyId: 'api-key-1',
};

const customChatCharacter = {
  customChatVariant: 'character' as const,
  customChatId: 'character-1',
  sharingUserId: 'sharing-user-1',
};

const customChatLearningScenario = {
  customChatVariant: 'learning-scenario' as const,
  customChatId: 'scenario-1',
  sharingUserId: 'sharing-user-1',
};

beforeEach(() => {
  vi.clearAllMocks();

  mocks.dbGetCharacterByIdMock.mockResolvedValue({
    id: 'character-1',
    userId: 'teacher-1',
    filterGroup: {},
  });
  mocks.dbGetLearningScenarioByIdMock.mockResolvedValue({
    id: 'scenario-1',
    userId: 'teacher-1',
    filterGroup: {},
  });
  mocks.getMaybeUserMock.mockResolvedValue({ id: 'teacher-1' });
  mocks.dbGetFederalStateByUserIdMock.mockResolvedValue(sharingFederalState);
  mocks.getStrongAuxiliaryModelMock.mockResolvedValue(auxiliaryModel);
  mocks.getModelAndApiKeyWithResultMock.mockResolvedValue([null, modelAndApiKey]);
  mocks.constructCharacterLanguageSystemPromptMock.mockReturnValue('character-system-prompt');
  mocks.constructLearningScenarioLanguageSystemPromptMock.mockReturnValue(
    'learning-scenario-system-prompt',
  );
  mocks.generateTextWithBillingMock.mockResolvedValue({ text: 'de' });
  mocks.dbUpdateCharacterFilterGroupMock.mockResolvedValue(undefined);
  mocks.dbUpdateLearningScenarioFilterGroupMock.mockResolvedValue(undefined);
});

describe('resolveSharingLocale', () => {
  it('returns mapped locale from character single filter language and skips detection', async () => {
    const { resolveSharingLocale } = await import('./sharing-locale');
    mocks.dbGetCharacterByIdMock.mockResolvedValue({
      id: 'character-1',
      userId: 'teacher-1',
      filterGroup: {
        school_types: [],
        grade_ranges: [],
        subjects: [],
        categories: [],
        federal_states: [],
        languages: ['english'],
      },
    });

    const locale = await resolveSharingLocale(customChatCharacter);

    expect(locale).toBe('en');
    expect(mocks.dbGetFederalStateByUserIdMock).not.toHaveBeenCalled();
    expect(mocks.generateTextWithBillingMock).not.toHaveBeenCalled();
  });

  it('returns default locale for unsupported character single filter language and skips detection', async () => {
    const { resolveSharingLocale } = await import('./sharing-locale');
    mocks.dbGetCharacterByIdMock.mockResolvedValue({
      id: 'character-1',
      userId: 'teacher-1',
      filterGroup: {
        school_types: [],
        grade_ranges: [],
        subjects: [],
        categories: [],
        federal_states: [],
        languages: ['spanish'],
      },
    });

    const locale = await resolveSharingLocale(customChatCharacter);

    expect(locale).toBe('de');
    expect(mocks.dbGetFederalStateByUserIdMock).not.toHaveBeenCalled();
    expect(mocks.generateTextWithBillingMock).not.toHaveBeenCalled();
  });

  it('returns default locale when character locale detection toggle is disabled', async () => {
    const { resolveSharingLocale } = await import('./sharing-locale');
    mocks.dbGetFederalStateByUserIdMock.mockResolvedValue({
      id: 'federal-state-1',
      featureToggles: {
        isSharedPageLocaleDetectionEnabled: false,
      },
    });

    const locale = await resolveSharingLocale(customChatCharacter);

    expect(locale).toBe('de');
    expect(mocks.getStrongAuxiliaryModelMock).not.toHaveBeenCalled();
    expect(mocks.getModelAndApiKeyWithResultMock).not.toHaveBeenCalled();
    expect(mocks.generateTextWithBillingMock).not.toHaveBeenCalled();
  });

  it('resolves the federal state from the sharing user, not the character owner', async () => {
    const { resolveSharingLocale } = await import('./sharing-locale');

    await resolveSharingLocale(customChatCharacter);

    expect(mocks.dbGetFederalStateByUserIdMock).toHaveBeenCalledWith({
      userId: 'sharing-user-1',
    });
  });

  it('returns default locale when the sharing user has no federal state', async () => {
    const { resolveSharingLocale } = await import('./sharing-locale');
    mocks.dbGetFederalStateByUserIdMock.mockResolvedValue(undefined);

    const locale = await resolveSharingLocale(customChatCharacter);

    expect(locale).toBe('de');
    expect(mocks.getStrongAuxiliaryModelMock).not.toHaveBeenCalled();
    expect(mocks.generateTextWithBillingMock).not.toHaveBeenCalled();
  });

  it('treats undefined character locale detection toggle as enabled and persists detected language', async () => {
    const { resolveSharingLocale } = await import('./sharing-locale');
    mocks.dbGetFederalStateByUserIdMock.mockResolvedValue({
      id: 'federal-state-1',
      featureToggles: {},
    });
    mocks.generateTextWithBillingMock.mockResolvedValue({ text: 'english' });

    const locale = await resolveSharingLocale(customChatCharacter);

    expect(locale).toBe('en');
    expect(mocks.getStrongAuxiliaryModelMock).toHaveBeenCalledWith('federal-state-1');
    expect(mocks.getModelAndApiKeyWithResultMock).toHaveBeenCalledWith({
      modelId: 'aux-model-1',
      federalStateId: 'federal-state-1',
    });
    expect(mocks.dbUpdateCharacterFilterGroupMock).toHaveBeenCalledWith({
      characterId: 'character-1',
      filterGroup: {
        languages: ['english'],
      },
    });
  });

  it('falls back to default locale when model/api-key lookup fails for character', async () => {
    const { resolveSharingLocale } = await import('./sharing-locale');
    mocks.getModelAndApiKeyWithResultMock.mockResolvedValue([new Error('missing key'), null]);

    const locale = await resolveSharingLocale(customChatCharacter);

    expect(locale).toBe('de');
    expect(mocks.generateTextWithBillingMock).not.toHaveBeenCalled();
  });

  it('returns detected locale even when character filter-group update fails', async () => {
    const { resolveSharingLocale } = await import('./sharing-locale');
    mocks.generateTextWithBillingMock.mockResolvedValue({ text: 'fr' });
    mocks.dbUpdateCharacterFilterGroupMock.mockRejectedValue(new Error('write failed'));

    const locale = await resolveSharingLocale(customChatCharacter);

    expect(locale).toBe('fr');
    expect(mocks.dbUpdateCharacterFilterGroupMock).toHaveBeenCalledTimes(1);
  });

  it('does not persist a detected language when the triggering user does not own the character', async () => {
    const { resolveSharingLocale } = await import('./sharing-locale');
    mocks.getMaybeUserMock.mockResolvedValue({ id: 'another-user' });
    mocks.generateTextWithBillingMock.mockResolvedValue({ text: 'fr' });

    const locale = await resolveSharingLocale(customChatCharacter);

    expect(locale).toBe('fr');
    expect(mocks.dbUpdateCharacterFilterGroupMock).not.toHaveBeenCalled();
  });

  it('returns default locale when character does not exist', async () => {
    const { resolveSharingLocale } = await import('./sharing-locale');
    mocks.dbGetCharacterByIdMock.mockResolvedValue(undefined);

    const locale = await resolveSharingLocale(customChatCharacter);

    expect(locale).toBe('de');
    expect(mocks.dbGetFederalStateByUserIdMock).not.toHaveBeenCalled();
  });

  it('returns default locale when learning scenario locale detection toggle is disabled', async () => {
    const { resolveSharingLocale } = await import('./sharing-locale');
    mocks.dbGetFederalStateByUserIdMock.mockResolvedValue({
      id: 'federal-state-1',
      featureToggles: {
        isSharedPageLocaleDetectionEnabled: false,
      },
    });

    const locale = await resolveSharingLocale(customChatLearningScenario);

    expect(locale).toBe('de');
    expect(mocks.getStrongAuxiliaryModelMock).not.toHaveBeenCalled();
    expect(mocks.generateTextWithBillingMock).not.toHaveBeenCalled();
  });

  it('resolves and persists locale for a learning scenario', async () => {
    const { resolveSharingLocale } = await import('./sharing-locale');
    mocks.generateTextWithBillingMock.mockResolvedValue({ text: 'italienisch' });

    const locale = await resolveSharingLocale(customChatLearningScenario);

    expect(locale).toBe('it');
    expect(mocks.dbUpdateLearningScenarioFilterGroupMock).toHaveBeenCalledWith({
      learningScenarioId: 'scenario-1',
      filterGroup: {
        languages: ['italian'],
      },
    });
  });

  it('does not persist a detected language for an unauthenticated learning-scenario viewer', async () => {
    const { resolveSharingLocale } = await import('./sharing-locale');
    mocks.getMaybeUserMock.mockResolvedValue(null);
    mocks.generateTextWithBillingMock.mockResolvedValue({ text: 'italienisch' });

    const locale = await resolveSharingLocale(customChatLearningScenario);

    expect(locale).toBe('it');
    expect(mocks.dbUpdateLearningScenarioFilterGroupMock).not.toHaveBeenCalled();
  });

  it('falls back to default locale when auxiliary model answer contains multiple languages', async () => {
    const { resolveSharingLocale } = await import('./sharing-locale');
    mocks.generateTextWithBillingMock.mockResolvedValue({ text: 'de, en' });

    const locale = await resolveSharingLocale(customChatLearningScenario);

    expect(locale).toBe('de');
    expect(mocks.dbUpdateLearningScenarioFilterGroupMock).toHaveBeenCalledWith({
      learningScenarioId: 'scenario-1',
      filterGroup: {
        languages: ['german'],
      },
    });
  });

  it('extracts language via character system prompt and auxiliary model answer', async () => {
    const { resolveSharingLocale } = await import('./sharing-locale');
    mocks.generateTextWithBillingMock.mockResolvedValue({ text: 'fr' });
    mocks.constructCharacterLanguageSystemPromptMock.mockReturnValue('prompt-from-character');

    const locale = await resolveSharingLocale(customChatCharacter);

    expect(locale).toBe('fr');
    expect(mocks.constructCharacterLanguageSystemPromptMock).toHaveBeenCalledWith({
      character: {
        id: 'character-1',
        userId: 'teacher-1',
        filterGroup: {},
      },
    });
    expect(mocks.generateTextWithBillingMock).toHaveBeenCalledWith(
      'aux-model-1',
      [
        {
          role: 'system',
          content: `Determine the language in which the following assistant will respond to messages. Respond exclusively with one of the following language codes: ${[...SUPPORTED_LOCALES].join(', ')}. If the language is not clear, respond with ${DEFAULT_LOCALE}.`,
        },
        {
          role: 'system',
          content: 'prompt-from-character',
        },
      ],
      'api-key-1',
    );
  });

  it('returns default locale when detected locale is unknown', async () => {
    const { resolveSharingLocale } = await import('./sharing-locale');
    mocks.generateTextWithBillingMock.mockResolvedValue({ text: 'klingon' });

    const locale = await resolveSharingLocale(customChatLearningScenario);

    expect(locale).toBe('de');
  });
});
