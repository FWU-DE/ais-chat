import { getRequestConfig } from 'next-intl/server';

import { loadTranslations } from './load-translations';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from './locales';

export default getRequestConfig(async ({ requestLocale }) => {
  const requestedLocale = await requestLocale;
  const locale =
    requestedLocale !== undefined && SUPPORTED_LOCALES.has(requestedLocale)
      ? requestedLocale
      : DEFAULT_LOCALE;

  return {
    locale,
    messages: await loadTranslations(locale),
  };
});
