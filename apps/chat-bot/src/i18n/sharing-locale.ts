import { generateTextWithBilling } from '@ais-chat/ai-core';
import { dbGetCharacterById, dbUpdateCharacterFilterGroup } from '@shared/db/functions/character';
import {
  dbGetLearningScenarioById,
  dbUpdateLearningScenarioFilterGroup,
} from '@shared/db/functions/learning-scenario';
import { dbGetFederalStateByUserId } from '@shared/db/functions/school';
import type { FilterGroup, LlmModelSelectModel } from '@shared/db/schema';
import { cacheLife } from 'next/cache';

import { constructCharacterLanguageSystemPrompt } from '@/app/api/character/system-prompt';
import { constructLearningScenarioLanguageSystemPrompt } from '@/app/api/learning-scenario/system-prompt';
import { getModelAndApiKeyWithResult, getStrongAuxiliaryModel } from '@/app/api/utils/utils';
import { getMaybeUser } from '@/auth/utils';

import {
  DEFAULT_LOCALE,
  getLocaleForFilterLanguage,
  getLocaleForFilterLanguageOrGermanName,
  LOCALE_TO_FILTER_LANGUAGE,
  SUPPORTED_LOCALES,
} from './locales';

/**
 * Resolves the locale for a shared custom chat (character or learning scenario).
 * Priority: filter language > LLM-determined language > default locale.
 *
 * `sharingUserId` identifies the user currently sharing the custom chat.
 * It is used to resolve the federal state for the locale-detection feature toggle
 * and auxiliary model.
 */
export async function resolveSharingLocale({
  customChatVariant,
  customChatId,
  sharingUserId,
}: {
  customChatVariant: 'character' | 'learning-scenario';
  customChatId: string;
  sharingUserId: string;
}): Promise<string> {
  if (customChatVariant === 'character') {
    const character = await dbGetCharacterById({ characterId: customChatId });

    if (character === undefined) {
      return DEFAULT_LOCALE;
    }

    const localeFromFilterLanguage = getLocaleFromFilterLanguages(character.filterGroup?.languages);
    if (localeFromFilterLanguage !== null) {
      return localeFromFilterLanguage;
    }

    const federalState = await dbGetFederalStateByUserId({ userId: sharingUserId });
    if (federalState === undefined) {
      return DEFAULT_LOCALE;
    }

    const sharedPageLocaleDetectionEnabled =
      federalState.featureToggles.isSharedPageLocaleDetectionEnabled ?? true;
    if (!sharedPageLocaleDetectionEnabled) {
      return DEFAULT_LOCALE;
    }

    const auxiliaryModel = await getStrongAuxiliaryModel(federalState.id);
    const [error, auxiliaryModelAndApiKey] = await getModelAndApiKeyWithResult({
      modelId: auxiliaryModel.id,
      federalStateId: federalState.id,
    });
    if (error !== null) {
      return DEFAULT_LOCALE;
    }

    const systemPrompt = constructCharacterLanguageSystemPrompt({
      character,
    });

    const locale = await getLocale(auxiliaryModelAndApiKey, systemPrompt);
    if (locale === null) {
      return DEFAULT_LOCALE;
    }

    await persistDetectedLanguage({
      customChatVariant: 'character',
      customChatId: character.id,
      ownerUserId: character.userId,
      locale,
      existingFilterGroup: character.filterGroup,
    });

    return locale;
  }

  if (customChatVariant === 'learning-scenario') {
    const learningScenario = await dbGetLearningScenarioById({
      learningScenarioId: customChatId,
    });

    if (learningScenario === undefined) {
      return DEFAULT_LOCALE;
    }

    const localeFromFilterLanguage = getLocaleFromFilterLanguages(
      learningScenario.filterGroup?.languages,
    );
    if (localeFromFilterLanguage !== null) {
      return localeFromFilterLanguage;
    }

    const federalState = await dbGetFederalStateByUserId({ userId: sharingUserId });
    if (federalState === undefined) {
      return DEFAULT_LOCALE;
    }

    const sharedPageLocaleDetectionEnabled =
      federalState.featureToggles.isSharedPageLocaleDetectionEnabled ?? true;
    if (!sharedPageLocaleDetectionEnabled) {
      return DEFAULT_LOCALE;
    }

    const auxiliaryModel = await getStrongAuxiliaryModel(federalState.id);
    const [error, auxiliaryModelAndApiKey] = await getModelAndApiKeyWithResult({
      modelId: auxiliaryModel.id,
      federalStateId: federalState.id,
    });

    if (error !== null) {
      return DEFAULT_LOCALE;
    }

    const systemPrompt = constructLearningScenarioLanguageSystemPrompt({
      learningScenario,
    });

    const locale = await getLocale(auxiliaryModelAndApiKey, systemPrompt);
    if (locale === null) {
      return DEFAULT_LOCALE;
    }

    await persistDetectedLanguage({
      customChatVariant: 'learning-scenario',
      customChatId: learningScenario.id,
      ownerUserId: learningScenario.userId,
      locale,
      existingFilterGroup: learningScenario.filterGroup,
    });

    return locale;
  }

  return DEFAULT_LOCALE;
}

/**
 * Checks if a single filter language is explicitly set.
 * Returns the mapped locale for supported languages, or null to use LLM detection.
 */
function getLocaleFromFilterLanguages(languages: string[] | undefined): string | null {
  if (languages === undefined || languages.length !== 1) {
    return null;
  }

  const selectedLanguage = languages[0];
  if (selectedLanguage === undefined) {
    return null;
  }

  // We only ship a subset of locales. For unsupported language filters,
  // use the default locale deterministically instead of model-based guessing.
  return getLocaleForFilterLanguage(selectedLanguage) ?? DEFAULT_LOCALE;
}

/**
 * Calls the LLM to determine which language the entity's content is in.
 * Results are cached for 30 days based on the systemPrompt content.
 */
async function getLocale(
  auxiliaryModelAndApiKey: { model: LlmModelSelectModel; apiKeyId: string },
  systemPrompt: string,
): Promise<string | null> {
  'use cache';
  cacheLife({
    expire: 60 * 60 * 24 * 30,
    revalidate: 60 * 60 * 24 * 29,
  });
  try {
    const { text } = await generateTextWithBilling(
      auxiliaryModelAndApiKey.model.id,
      [
        {
          role: 'system',
          content: `Determine the language in which the following assistant will respond to messages. Respond exclusively with one of the following language codes: ${[...SUPPORTED_LOCALES].join(', ')}. If the language is not clear, respond with ${DEFAULT_LOCALE}.`,
        },
        {
          role: 'system',
          content: systemPrompt,
        },
      ],
      auxiliaryModelAndApiKey.apiKeyId,
    );
    return normalizeLocale(text);
  } catch {
    return null;
  }
}

/**
 * Persists a locale detected by the LLM back to the entity's filterGroup.languages.
 * Only the entity owner may persist; other users and unauthenticated viewers are ignored.
 * Also no-ops if the locale cannot be mapped to a known Language or is already in the list.
 * Errors are caught so locale resolution is never blocked by a write failure.
 */
async function persistDetectedLanguage({
  customChatVariant,
  customChatId,
  ownerUserId,
  locale,
  existingFilterGroup,
}: {
  customChatVariant: 'character' | 'learning-scenario';
  customChatId: string;
  ownerUserId: string;
  locale: string;
  existingFilterGroup: FilterGroup;
}): Promise<void> {
  const triggeringUser = await getMaybeUser();
  if (triggeringUser?.id !== ownerUserId) {
    return;
  }
  const detectedLanguage = LOCALE_TO_FILTER_LANGUAGE[locale];
  if (detectedLanguage === undefined) {
    return;
  }

  const currentLanguages = existingFilterGroup.languages;
  if (currentLanguages?.includes(detectedLanguage)) {
    return;
  }

  const updatedFilterGroup: FilterGroup = {
    ...existingFilterGroup,
    languages: [...(currentLanguages ?? []), detectedLanguage],
  };

  try {
    if (customChatVariant === 'character') {
      await dbUpdateCharacterFilterGroup({
        characterId: customChatId,
        filterGroup: updatedFilterGroup,
      });
    } else {
      await dbUpdateLearningScenarioFilterGroup({
        learningScenarioId: customChatId,
        filterGroup: updatedFilterGroup,
      });
    }
  } catch {
    // write failure must not break locale resolution
  }
}

function normalizeLocale(text: string): string {
  const normalized = text.trim().toLowerCase();

  if (SUPPORTED_LOCALES.has(normalized)) {
    return normalized;
  }

  return getLocaleForFilterLanguageOrGermanName(normalized) ?? DEFAULT_LOCALE;
}
