export const DEFAULT_LOCALE = 'de';

export const SUPPORTED_LOCALES = new Set(['de', 'en', 'fr', 'it', 'ar', 'ru']);

/**
 * Single source of truth for filter languages that have a corresponding locale.
 * `SupportedFilterLanguage` is inferred from this object, and the reverse
 * locale -> filter language mapping is derived from it, so the two mappings
 * can never drift out of sync.
 */
const LOCALE_BY_FILTER_LANGUAGE = {
  german: 'de',
  english: 'en',
  arabic: 'ar',
  french: 'fr',
  italian: 'it',
  russian: 'ru',
} as const;

export type SupportedFilterLanguage = keyof typeof LOCALE_BY_FILTER_LANGUAGE;

const FILTER_LANGUAGE_BY_GERMAN_NAME = new Map<string, SupportedFilterLanguage>([
  ['deutsch', 'german'],
  ['englisch', 'english'],
  ['französisch', 'french'],
  ['italienisch', 'italian'],
  ['arabisch', 'arabic'],
  ['russisch', 'russian'],
]);

export const FILTER_LANGUAGE_TO_LOCALE: Record<SupportedFilterLanguage, string> =
  LOCALE_BY_FILTER_LANGUAGE;

export const LOCALE_TO_FILTER_LANGUAGE: Record<string, SupportedFilterLanguage> =
  Object.fromEntries(
    Object.entries(LOCALE_BY_FILTER_LANGUAGE).map(([filterLanguage, locale]) => [
      locale,
      filterLanguage,
    ]),
  ) as Record<string, SupportedFilterLanguage>;

function isSupportedFilterLanguage(language: string): language is SupportedFilterLanguage {
  return Object.hasOwn(LOCALE_BY_FILTER_LANGUAGE, language);
}

/**
 * Returns the locale for a filter language, or `undefined` if the language
 * is not one of the languages we ship translations for.
 */
export function getLocaleForFilterLanguage(language: string): string | undefined {
  return isSupportedFilterLanguage(language) ? FILTER_LANGUAGE_TO_LOCALE[language] : undefined;
}

/**
 * Returns the locale for a filter language (e.g. `french`) or a German
 * language name (e.g. `französisch`).
 */
export function getLocaleForFilterLanguageOrGermanName(languageName: string): string | undefined {
  const filterLanguage = FILTER_LANGUAGE_BY_GERMAN_NAME.get(languageName) ?? languageName;
  return getLocaleForFilterLanguage(filterLanguage);
}
