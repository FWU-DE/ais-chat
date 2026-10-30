import type { LlmModel } from '@ais-chat/api-database';
import { isLlmProvider } from '@ais-chat/api-database/llm-model';
import { GoogleGenAI } from '@google/genai';
import { instrumentGoogleGenAIClient } from '@sentry/server-utils';
import { createHash } from 'crypto';
import { GoogleAuth, type GoogleAuthOptions } from 'google-auth-library';
import { ProviderConfigurationError } from './errors';

type GoogleGenAIAuthOptions = NonNullable<
  NonNullable<ConstructorParameters<typeof GoogleGenAI>[0]>['googleAuthOptions']
>;

const GOOGLE_API_VERSION = 'v1';
const GOOGLE_CLOUD_PLATFORM_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';

export interface GoogleClientConfig {
  projectId: string;
  location: string;
  client: GoogleGenAI;
}

const googleClientCache = new Map<string, GoogleClientConfig>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Data residency is non-negotiable: every Google request must stay inside the EU. Enforced in
 * `getGoogleAuthOptions` so it covers every Google client (chat, images, safety, speech) instead
 * of each provider having to remember the check.
 */
export function assertGoogleEuLocation(location: string): void {
  if (location !== 'eu' && !location.startsWith('europe-')) {
    throw new ProviderConfigurationError(
      `Google location "${location}" is outside the EU; only "eu" and "europe-*" are allowed`,
    );
  }
}

export function getGoogleAuthOptions(
  settings: Extract<LlmModel['setting'], { provider: 'google' }>,
  requireCredentials = false,
): GoogleAuthOptions {
  assertGoogleEuLocation(settings.location);

  const authCredentials = settings.authCredentials;
  if (authCredentials === undefined) {
    if (requireCredentials) {
      throw new ProviderConfigurationError('Google requires inline credentials');
    }

    return { scopes: [GOOGLE_CLOUD_PLATFORM_SCOPE] };
  }

  if (typeof authCredentials !== 'string') {
    return { credentials: authCredentials, scopes: [GOOGLE_CLOUD_PLATFORM_SCOPE] };
  }

  try {
    const credentials = JSON.parse(authCredentials) as unknown;
    if (!isRecord(credentials)) {
      throw new ProviderConfigurationError('Google credentials must be a JSON object');
    }

    return { credentials, scopes: [GOOGLE_CLOUD_PLATFORM_SCOPE] };
  } catch (error) {
    if (error instanceof ProviderConfigurationError) {
      throw error;
    }

    throw new ProviderConfigurationError('Google credentials must be valid JSON');
  }
}

export function createGoogleAuth(model: LlmModel): GoogleAuth {
  if (!isLlmProvider(model.setting, 'google')) {
    throw new ProviderConfigurationError('Invalid model configuration for Google');
  }

  return new GoogleAuth(getGoogleAuthOptions(model.setting, true));
}

export function getCredentialsFingerprint(
  authCredentials: Extract<LlmModel['setting'], { provider: 'google' }>['authCredentials'],
): string {
  if (authCredentials === undefined) return 'adc';
  const normalized =
    typeof authCredentials === 'string' ? authCredentials : JSON.stringify(authCredentials);
  return createHash('sha256').update(normalized).digest('hex');
}

export function createGoogleClient(model: LlmModel): GoogleClientConfig {
  if (!isLlmProvider(model.setting, 'google')) {
    throw new ProviderConfigurationError('Invalid model configuration for Google');
  }

  const { projectId, location, authCredentials } = model.setting;
  const cacheKey =
    `${projectId}-${location}-${getCredentialsFingerprint(authCredentials)}` as const;

  const cachedClient = googleClientCache.get(cacheKey);
  if (cachedClient) {
    return cachedClient;
  }

  const instrumentedClient = instrumentGoogleGenAIClient(
    new GoogleGenAI({
      enterprise: true,
      project: projectId,
      location,
      apiVersion: GOOGLE_API_VERSION,
      googleAuthOptions: getGoogleAuthOptions(model.setting) as unknown as GoogleGenAIAuthOptions,
    }),
  );

  const client = {
    projectId,
    location,
    client: instrumentedClient,
  };

  googleClientCache.set(cacheKey, client);

  return client;
}

export function formatGoogleError(errorLabel: string, error: unknown): string {
  if (isRecord(error)) {
    const status = typeof error.status === 'number' ? error.status : undefined;
    const message = typeof error.message === 'string' ? error.message : undefined;

    if (status !== undefined && message) {
      return `${errorLabel} request failed with status ${status}: ${message}`;
    }

    if (message) {
      return `${errorLabel} request failed: ${message}`;
    }
  }

  if (error instanceof Error) {
    return `${errorLabel} request failed: ${error.message}`;
  }

  return `${errorLabel} request failed`;
}

export function getGoogleServiceAddress(location: string): string {
  if (location === 'eu') {
    return 'aiplatform.eu.rep.googleapis.com';
  }

  return `${location}-aiplatform.googleapis.com`;
}

/**
 * Cloud Text-to-Speech only offers `global`, `eu` and `us` endpoints, so the Vertex AI location
 * from the model configuration (e.g. `europe-west3`) maps onto the `eu` multi-region rather than
 * onto a same-named regional endpoint.
 * https://cloud.google.com/text-to-speech/docs/endpoints
 */
export function getGoogleTextToSpeechServiceAddress(location: string): string {
  assertGoogleEuLocation(location);

  return 'eu-texttospeech.googleapis.com';
}
