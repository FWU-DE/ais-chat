import z from 'zod';
import {
  CUSTOM_OPENAI_PROVIDER_SUFFIX,
  DEFAULT_IONOS_BASE_URL,
  DEFAULT_OPENAI_BASE_URL,
} from './const';

export const defaultLlmProviderProps = z.object({
  name: z.string(),
});

export const llmModelProviderSchema = z.enum(['ionos', 'openai', 'azure', 'google', 'bifrost']);

export const llmModelSettingsIonos = z.object({
  provider: z.literal(llmModelProviderSchema.enum.ionos),
  apiKey: z.string(),
  baseUrl: z.string().default(DEFAULT_IONOS_BASE_URL),
});

export const llmModelSettingsOpenAiSchema = z.object({
  provider: z.literal(llmModelProviderSchema.enum.openai),
  apiKey: z.string(),
  baseUrl: z.string().default(DEFAULT_OPENAI_BASE_URL),
});

export const llmModelSettingsAzureSchema = z.object({
  provider: z.literal(llmModelProviderSchema.enum.azure),
  apiKey: z.string(),
  baseUrl: z.string(),
});

export const llmModelSettingsGoogleSchema = z.object({
  provider: z.literal(llmModelProviderSchema.enum.google),
  projectId: z.string(),
  location: z.string(),
  authCredentials: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
});

export const llmModelSettingsBifrostSchema = z.object({
  provider: z.literal(llmModelProviderSchema.enum.bifrost),
});

// `vertex` is Bifrost's provider id for a `google`-typed key (see `getBifrostProvider`), not a
// valid value for `settings.provider` itself. Names ending in `CUSTOM_OPENAI_PROVIDER_SUFFIX` are
// reserved too, so they can't collide with a generated `openai`-custom-base-URL provider id (see
// `isCustomOpenAiProviderId`).
const RESERVED_LLM_PROVIDER_NAMES: readonly string[] = [
  ...llmModelProviderSchema.options,
  'vertex',
];

function isReservedProviderName(provider: string): boolean {
  return (
    RESERVED_LLM_PROVIDER_NAMES.includes(provider) ||
    provider.endsWith(CUSTOM_OPENAI_PROVIDER_SUFFIX)
  );
}

// Registers an arbitrary Bifrost-native provider (e.g. a provider Bifrost supports out of the
// box that isn't one of the types above) using the exact id Bifrost expects, with no
// custom-provider wrapper.
export const llmModelSettingsBifrostNativeSchema = z.object({
  provider: z
    .string()
    .min(1)
    .refine((value) => !isReservedProviderName(value), {
      message: `Provider must not be one of the reserved values (${RESERVED_LLM_PROVIDER_NAMES.join(', ')}) or end with "${CUSTOM_OPENAI_PROVIDER_SUFFIX}"`,
    }),
  apiKey: z.string(),
  baseUrl: z.string().optional(),
});

export const llmModelSettingsSchema = llmModelSettingsIonos
  .or(llmModelSettingsOpenAiSchema)
  .or(llmModelSettingsAzureSchema)
  .or(llmModelSettingsGoogleSchema)
  .or(llmModelSettingsBifrostSchema)
  .or(llmModelSettingsBifrostNativeSchema);

export type LlmProviderKeySettings = z.infer<typeof llmModelSettingsSchema>;
export type LlmModelProviderSettings = LlmProviderKeySettings;
export type LlmProviderKeyBifrostNativeSettings = z.infer<
  typeof llmModelSettingsBifrostNativeSchema
>;

// `provider` is a free string on the Bifrost-native variant, so a plain `settings.provider !== x`
// check can't narrow it out. Use these type guards instead.
export function isLlmProvider<TProvider extends string>(
  settings: LlmProviderKeySettings,
  provider: TProvider,
): settings is Extract<LlmProviderKeySettings, { provider: TProvider }> {
  return settings.provider === provider;
}

export function isBifrostNativeSettings(
  settings: LlmProviderKeySettings,
): settings is LlmProviderKeyBifrostNativeSettings {
  return !isReservedProviderName(settings.provider);
}
