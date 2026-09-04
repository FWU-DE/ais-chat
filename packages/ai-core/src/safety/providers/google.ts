import type { SafetyCheckFn, SafetyResult, AiModel } from '../types';
import { GoogleAuth } from 'google-auth-library';
import { AiGenerationError, ProviderConfigurationError } from '../../errors';
import { getGoogleServiceAddress } from '../../google-client';

type GoogleModelSettings = Extract<AiModel['setting'], { provider: 'google' }>;

const SAFETY_CATEGORIES = `S1: Violent Crimes
S2: Non-Violent Crimes
S3: Sex-Related Crimes
S4: Child Sexual Exploitation
S5: Defamation
S6: Specialized Advice
S7: Privacy
S8: Intellectual Property
S9: Indiscriminate Weapons
S10: Hate
S11: Suicide & Self-Harm
S12: Sexual Content
S13: Elections
S14: Code Interpreter Abuse`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function buildGuardPrompt(text: string): string {
  return `Task: Check if there is unsafe content in the User message according to our safety policy with the below categories.

<BEGIN UNSAFE CONTENT CATEGORIES>
${SAFETY_CATEGORIES}
<END UNSAFE CONTENT CATEGORIES>

<BEGIN CONVERSATION>

User: ${text}

<END CONVERSATION>

Provide your safety assessment for the above content.`;
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

  const settings = model.setting as GoogleModelSettings;
  const endpointId = getEndpointId(model);
  const endpointHost = getEndpointHost(model, settings.location);
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });

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

      console.log('[safety] Google request', {
        url: requestUrl,
        body: JSON.stringify(requestBody),
      });

      const response = await fetch(requestUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const responseBody = await response.text();
      console.log('[safety] Google raw response body', responseBody);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${responseBody}`);
      }

      const payload = JSON.parse(responseBody) as {
        predictions?: unknown;
      };
      const prediction = Array.isArray(payload.predictions)
        ? payload.predictions[0]
        : payload.predictions;
      const predictionRecord = isRecord(prediction) ? prediction : undefined;
      const choices = Array.isArray(predictionRecord?.choices) ? predictionRecord.choices : [];
      const choice = isRecord(choices[0]) ? choices[0] : undefined;
      const message = choice && isRecord(choice.message) ? choice.message : undefined;
      const messageContent = message?.content;
      const reasoningContent = message?.reasoning_content;
      const result =
        typeof messageContent === 'string'
          ? messageContent || (typeof reasoningContent === 'string' ? reasoningContent : undefined)
          : Array.isArray(messageContent)
            ? messageContent
                .filter((part): part is Record<string, unknown> => isRecord(part))
                .map((part) => (typeof part.text === 'string' ? part.text : ''))
                .join('')
            : typeof choice?.text === 'string'
              ? choice.text
              : typeof prediction === 'string'
                ? prediction
                : undefined;

      console.log('[safety] Google response', {
        status: response.status,
        predictionType: typeof prediction,
        predictionKeys: predictionRecord ? Object.keys(predictionRecord) : [],
        choiceKeys: choice ? Object.keys(choice) : [],
        messageKeys: message ? Object.keys(message) : [],
        finishReason: choice?.finish_reason,
        stopReason: choice?.stop_reason,
        contentType: typeof messageContent,
        contentIsArray: Array.isArray(messageContent),
        contentValue:
          typeof messageContent === 'string'
            ? messageContent.slice(0, 100)
            : Array.isArray(messageContent)
              ? messageContent.map((part) => (isRecord(part) ? Object.keys(part) : typeof part))
              : undefined,
        resultLength: result?.length ?? 0,
        reasoningContentLength: typeof reasoningContent === 'string' ? reasoningContent.length : 0,
        usage: predictionRecord?.usage,
        requestTextLength: text.length,
      });

      if (!result) {
        throw new Error('Google safety model returned an empty result');
      }

      return { result };
    } catch (error) {
      throw new AiGenerationError(
        `Google Vertex AI Safety request failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };
}
