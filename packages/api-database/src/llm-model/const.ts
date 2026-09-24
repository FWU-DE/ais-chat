export const DEFAULT_IONOS_BASE_URL = 'https://openai.inference.de-txl.ionos.com/v1';
export const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';

// Suffix appended to derive a Bifrost custom-provider id for an `openai`-typed key with a
// non-default base URL (see `buildCustomOpenAiProviderId`). Reserved here too so an arbitrary
// Bifrost-native provider name can't collide with one of those generated ids.
export const CUSTOM_OPENAI_PROVIDER_SUFFIX = '-custom';

export const TOKEN_AMOUNT_PER_PRICE = 1_000_000;
export const CENT_MULTIPLIER = 10;
export const PRICE_AND_CENT_MULTIPLIER = TOKEN_AMOUNT_PER_PRICE * CENT_MULTIPLIER;
