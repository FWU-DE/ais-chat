import type { SafetyCheckFn, SafetyResult, AiModel } from '../types';
import { GoogleAuth, type GoogleAuthOptions } from 'google-auth-library';
import { AiGenerationError, ProviderConfigurationError } from '../../errors';
import { getGoogleServiceAddress } from '../../google-client';
import { buildGuardPrompt } from '../prompt';

function getGoogleAuthOptions(
  settings: Extract<AiModel['setting'], { provider: 'google' }>,
): GoogleAuthOptions {
  const authCredentials = settings.authCredentials;
  if (authCredentials === undefined) {
    throw new ProviderConfigurationError(
      'Google safety models require inline service-account credentials in settings.authCredentials',
    );
  }

  if (typeof authCredentials === 'string') {
    try {
      return {
        credentials: JSON.parse(authCredentials),
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      };
    } catch {
      throw new ProviderConfigurationError(
        'Google safety model settings.authCredentials must be valid service-account JSON',
      );
    }
  }

  return {
    credentials: authCredentials,
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function extractSafetyResult(payload: unknown): string | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }

  const predictions = payload.predictions;
  const prediction = Array.isArray(predictions) ? predictions[0] : predictions;
  if (typeof prediction === 'string') {
    return prediction;
  }
  if (!isRecord(prediction) || !Array.isArray(prediction.choices)) {
    return undefined;
  }

  const choice = prediction.choices[0];
  if (!isRecord(choice)) {
    return undefined;
  }

  const message = isRecord(choice.message) ? choice.message : undefined;
  const content = message?.content;
  if (typeof content === 'string') {
    if (content !== '') {
      return content;
    }

    return typeof message?.reasoning_content === 'string' ? message.reasoning_content : undefined;
  }

  if (Array.isArray(content)) {
    return content
      .filter((part): part is Record<string, unknown> => isRecord(part))
      .map((part) => (typeof part.text === 'string' ? part.text : ''))
      .join('');
  }

  return typeof choice.text === 'string' ? choice.text : undefined;
}

function validateSafetyResult(result: string): string {
  const normalized = result.trim();
  if (/^safe$/i.test(normalized) || /^unsafe(?:\s+S\d+(?:\s+S\d+)*)?$/i.test(normalized)) {
    return normalized;
  }

  throw new Error('Google safety model returned an invalid classification');
}

function getEndpointId(model: AiModel): string {
  const parameters = model.additionalParameters;
  const endpointId = parameters?.endpointId;
  if (typeof endpointId !== 'string' || endpointId === '') {
    throw new ProviderConfigurationError(
      `Google safety model ${model.name} requires additionalParameters.endpointId`,
    );
  }
  return endpointId;
}

function getEndpointHost(model: AiModel, location: string): string {
  const endpointHost = model.additionalParameters?.endpointHost;
  if (typeof endpointHost === 'string' && endpointHost !== '') {
    return endpointHost;
  }

  return getGoogleServiceAddress(location);
}

export function constructGoogleSafetyCheckFn(model: AiModel): SafetyCheckFn {
  if (model.setting.provider !== 'google') {
    throw new ProviderConfigurationError('Invalid model configuration for Google');
  }

  const settings = model.setting;
  const endpointId = getEndpointId(model);
  const endpointHost = getEndpointHost(model, settings.location);
  const auth = new GoogleAuth(getGoogleAuthOptions(settings));

  return async function checkGoogleSafety({ text }): Promise<SafetyResult> {
    try {
      const client = await auth.getClient();
      const accessToken = await client.getAccessToken();
      if (!accessToken.token) {
        throw new Error('Google authentication returned no access token');
      }

      const requestBody = {
        instances: [
          {
            '@requestFormat': 'chatCompletions',
            messages: [{ role: 'user', content: buildGuardPrompt(text) }],
            max_tokens: 10,
            temperature: 0,
          },
        ],
      };

      const requestUrl = `https://${endpointHost}/v1/projects/${settings.projectId}/locations/${settings.location}/endpoints/${endpointId}:predict`;

      const response = await fetch(requestUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const responseBody = await response.text();

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${responseBody}`);
      }

      const result = extractSafetyResult(JSON.parse(responseBody));

      if (!result) {
        throw new Error('Google safety model returned an empty result');
      }

      return { result: validateSafetyResult(result) };
    } catch (error) {
      throw new AiGenerationError(
        `Google Vertex AI Safety request failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };
}
