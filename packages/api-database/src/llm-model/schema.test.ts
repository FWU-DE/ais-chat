import { describe, expect, it } from 'vitest';
import { llmModelSettingsBifrostNativeSchema, llmModelSettingsGoogleSchema } from './schema';

describe('llmModelSettingsGoogleSchema', () => {
  it('accepts a string or object authCredentials value', () => {
    expect(
      llmModelSettingsGoogleSchema.safeParse({
        provider: 'google',
        projectId: 'project-id',
        location: 'europe-west3',
        authCredentials: 'raw-credentials',
      }).success,
    ).toBe(true);

    expect(
      llmModelSettingsGoogleSchema.safeParse({
        provider: 'google',
        projectId: 'project-id',
        location: 'europe-west3',
        authCredentials: {
          type: 'service_account',
          client_email: 'test@example.com',
        },
      }).success,
    ).toBe(true);
  });

  it('rejects non-string, non-object authCredentials values', () => {
    expect(
      llmModelSettingsGoogleSchema.safeParse({
        provider: 'google',
        projectId: 'project-id',
        location: 'europe-west3',
        authCredentials: 123,
      }).success,
    ).toBe(false);
  });
});

describe('llmModelSettingsBifrostNativeSchema', () => {
  it('accepts an arbitrary provider name', () => {
    expect(
      llmModelSettingsBifrostNativeSchema.safeParse({
        provider: 'acme',
        apiKey: 'sk-1',
        baseUrl: 'https://acme.example/api',
      }).success,
    ).toBe(true);
  });

  it('rejects reserved provider names', () => {
    expect(
      llmModelSettingsBifrostNativeSchema.safeParse({
        provider: 'openai',
        apiKey: 'sk-1',
      }).success,
    ).toBe(false);
  });

  it('rejects "vertex", which is Bifrost\'s provider id for a "google"-typed key', () => {
    expect(
      llmModelSettingsBifrostNativeSchema.safeParse({
        provider: 'vertex',
        apiKey: 'sk-1',
      }).success,
    ).toBe(false);
  });

  it('rejects a name ending in the generated openai-custom-provider suffix', () => {
    expect(
      llmModelSettingsBifrostNativeSchema.safeParse({
        provider: 'groq-custom',
        apiKey: 'sk-1',
      }).success,
    ).toBe(false);
  });
});
