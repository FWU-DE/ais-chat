import * as Sentry from '@sentry/core';
import { z } from 'zod';
import { AiGenerationError, EmptyResponseError, ProviderConfigurationError } from '../../errors';
import { createGoogleAuth } from '../../google-client';
import { buildGuardPrompt } from '../prompt';
import type { AiModel, SafetyCheckFn, SafetyImage, SafetyResult } from '../types';

const MAX_IMAGES = 4;
const MAX_IMAGE_URL_LENGTH = 10 * 1024 * 1024;

const responseSchema = z.object({
  predictions: z.object({
    choices: z.array(
      z.object({
        message: z.object({ content: z.string() }),
      }),
    ),
  }),
});

function parseSafetyResult(payload: unknown, modelId: string): SafetyResult {
  const result = responseSchema.safeParse(payload);
  if (!result.success || !result.data.predictions.choices[0]?.message.content) {
    throw new EmptyResponseError({ modelId, message: 'Empty safety response' });
  }

  const [classification, ...categories] = result.data.predictions.choices[0].message.content
    .trim()
    .toUpperCase()
    .split(/\s+/);

  if (classification === 'SAFE') {
    return { safe: true };
  }

  const parsedCategories = categories
    .flatMap((category) => category.split(','))
    .filter((category) => /^S(?:[1-9]|1[0-4])$/.test(category));
  if (classification === 'UNSAFE' && parsedCategories.length > 0) {
    return { safe: false, categories: parsedCategories };
  }

  throw new AiGenerationError('Google safety model returned an invalid classification');
}

function isValidImage(image: SafetyImage): boolean {
  if (!image.contentType.startsWith('image/') || image.url.length > MAX_IMAGE_URL_LENGTH) {
    return false;
  }

  if (image.url.startsWith('data:')) {
    return /^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/]+={0,2}$/i.test(image.url);
  }

  try {
    return ['http:', 'https:'].includes(new URL(image.url).protocol);
  } catch {
    return false;
  }
}

function filterImages(images: SafetyImage[]): SafetyImage[] {
  const validImages = images.filter(isValidImage);
  const droppedImageCount = images.length - Math.min(validImages.length, MAX_IMAGES);

  if (droppedImageCount > 0) {
    Sentry.captureMessage('Safety image attachments filtered', {
      level: 'warning',
      extra: { droppedImageCount, maximumImageCount: MAX_IMAGES },
    });
  }

  return validImages.slice(0, MAX_IMAGES);
}

function getEndpoint(model: AiModel): { id: string; host: string } {
  const id = model.additionalParameters?.endpointId;
  const host = model.additionalParameters?.endpointHost;

  if (typeof id !== 'string' || id === '') {
    throw new ProviderConfigurationError(
      `Google safety model ${model.name} requires additionalParameters.endpointId`,
    );
  }

  if (typeof host !== 'string' || host.trim() !== host || host === '' || /[/:?#]/.test(host)) {
    throw new ProviderConfigurationError(
      `Google safety model ${model.name} requires a hostname in additionalParameters.endpointHost`,
    );
  }

  return { id, host };
}

export function constructGoogleSafetyCheckFn(model: AiModel): SafetyCheckFn {
  if (model.setting.provider !== 'google') {
    throw new ProviderConfigurationError('Invalid model configuration for Google');
  }

  const { projectId, location } = model.setting;
  const endpoint = getEndpoint(model);
  const auth = createGoogleAuth(model);

  return async function checkGoogleSafety({ messages }): Promise<SafetyResult> {
    try {
      const accessToken = await (await auth.getClient()).getAccessToken();
      if (!accessToken.token) {
        throw new AiGenerationError('Google authentication returned no access token');
      }

      const images = filterImages(messages.flatMap((message) => message.images ?? []));
      const imageParts = images.map((image) => ({
        type: 'image_url' as const,
        image_url: { url: image.url },
      }));
      const prompt = buildGuardPrompt(messages);
      const content =
        imageParts.length > 0 ? [{ type: 'text' as const, text: prompt }, ...imageParts] : prompt;
      const url = `https://${endpoint.host}/v1/projects/${projectId}/locations/${location}/endpoints/${endpoint.id}:predict`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          instances: [
            {
              '@requestFormat': 'chatCompletions',
              messages: [{ role: 'user', content }],
              max_tokens: 10,
              temperature: 0,
            },
          ],
        }),
      });

      if (!response.ok) {
        throw new AiGenerationError(`Google safety request failed with status ${response.status}`);
      }

      return parseSafetyResult(await response.json(), model.id);
    } catch (error) {
      Sentry.captureException(error, {
        tags: { provider: 'google', operation: 'safety_check' },
      });
      return { safe: true };
    }
  };
}
