import type { LlmModel } from '@ais-chat/api-database';
import { GoogleGenAI } from '@google/genai';
import { GoogleAuth, type GoogleAuthOptions } from 'google-auth-library';
import { ProviderConfigurationError } from './errors';
import { instrumentGoogleGenAIClient } from '@sentry/core';

const GOOGLE_API_VERSION = 'v1';
const GOOGLE_CLOUD_PLATFORM_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
const GOOGLE_MULTI_REGION_LOCATIONS = new Set(['eu', 'us']);

export interface GoogleClientConfig {
  projectId: string;
  location: string;
  client: GoogleGenAI;
}

const googleClientCache = new Map<string, GoogleClientConfig>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function getGoogleAuthOptions(
  settings: Extract<LlmModel['setting'], { provider: 'google' }>,
): GoogleAuthOptions {
  const authCredentials = settings.authCredentials;
  if (authCredentials === undefined) {
    throw new ProviderConfigurationError('Google requires inline credentials');
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
  if (model.setting.provider !== 'google') {
    throw new ProviderConfigurationError('Invalid model configuration for Google');
  }

  return new GoogleAuth(getGoogleAuthOptions(model.setting));
}

export function createGoogleClient(model: LlmModel): GoogleClientConfig {
  if (model.setting.provider !== 'google') {
    throw new ProviderConfigurationError('Invalid model configuration for Google');
  }

  const { projectId, location } = model.setting;
  const cacheKey = `${projectId}-${location}` as const;

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
      googleAuthOptions: getGoogleAuthOptions(model.setting),
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
  if (location === 'global') {
    return 'aiplatform.googleapis.com';
  }

  if (GOOGLE_MULTI_REGION_LOCATIONS.has(location)) {
    return `aiplatform.${location}.rep.googleapis.com`;
  }

  return `${location}-aiplatform.googleapis.com`;
}
