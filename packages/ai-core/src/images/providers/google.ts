import type { GenerateImagesConfig, GenerateImagesResponse } from '@google/genai';
import * as Sentry from '@sentry/core';

import { AiGenerationError, ResponsibleAIError } from '../../errors';
import {
  createGoogleClient,
  formatGoogleError,
  getGoogleServiceAddress,
} from '../../google-client';
import type { AiModel, ImageGenerationFn, ImageResponse } from '../types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function createGoogleImageConfig(additionalParameters: Record<string, unknown>): {
  config: GenerateImagesConfig;
  outputMimeType: string;
} {
  const rawConfig = isRecord(additionalParameters.parameters)
    ? additionalParameters.parameters
    : additionalParameters;
  const { sampleImageSize, safetySetting, ...rest } = rawConfig;

  const configRecord: Record<string, unknown> = {
    numberOfImages: 1,
    aspectRatio: '1:1',
    imageSize: '1K',
    safetyFilterLevel: 'block_only_high',
    personGeneration: 'allow_adult',
    language: 'auto',
    includeRaiReason: true,
    outputMimeType: 'image/png',
    ...(typeof sampleImageSize === 'string' ? { imageSize: sampleImageSize } : {}),
    ...(typeof safetySetting === 'string' ? { safetyFilterLevel: safetySetting } : {}),
    ...rest,
  };

  const outputMimeType =
    typeof configRecord.outputMimeType === 'string' ? configRecord.outputMimeType : 'image/png';

  return {
    config: configRecord as GenerateImagesConfig,
    outputMimeType,
  };
}

function toGoogleOutputFormat(mimeType: string | undefined): ImageResponse['output_format'] {
  switch (mimeType) {
    case 'image/jpeg':
    case 'image/jpg':
      return 'jpeg';
    case 'image/webp':
      return 'webp';
    case 'image/png':
    default:
      return 'png';
  }
}

// Construct the Image Generation function for Google Vertex AI
export function constructGoogleImageGenerationFn(model: AiModel): ImageGenerationFn {
  const clientConfig = createGoogleClient(model);
  const additionalParameters = isRecord(model.additionalParameters)
    ? model.additionalParameters
    : {};
  const { config, outputMimeType } = createGoogleImageConfig(additionalParameters);
  const address = getGoogleServiceAddress(clientConfig.location);

  return async function getGoogleImageGeneration(params: Parameters<ImageGenerationFn>[0]) {
    return Sentry.startSpan(
      {
        name: `generate_image ${model.name}`,
        op: 'gen_ai.generate_image',
        attributes: {
          'gen_ai.operation.name': 'generate_image',
          'gen_ai.system': 'google_vertex_ai',
          'gen_ai.request.model': model.name,
          'http.request.method': 'POST',
          'server.address': address,
        },
      },
      async (span) => {
        try {
          const result: GenerateImagesResponse = await clientConfig.client.models.generateImages({
            model: model.name,
            prompt: params.prompt,
            config,
          });

          const generatedImage = result.generatedImages?.[0];
          if (!generatedImage) {
            throw new AiGenerationError('No image generated from Google Vertex AI');
          }

          if (generatedImage.raiFilteredReason) {
            span.setAttribute('gen_ai.response.finish_reasons', [generatedImage.raiFilteredReason]);
            throw new ResponsibleAIError(
              `Image generation was blocked due to safety settings: ${generatedImage.raiFilteredReason}`,
            );
          }

          if (!generatedImage.image?.imageBytes) {
            throw new AiGenerationError('No image data received from Google Vertex AI');
          }

          span.setAttribute('gen_ai.response.finish_reasons', ['success']);
          span.setAttribute('gen_ai.response.model', model.name);

          return {
            data: [generatedImage.image.imageBytes],
            output_format: toGoogleOutputFormat(generatedImage.image.mimeType ?? outputMimeType),
          };
        } catch (error) {
          span.setAttribute('error', true);

          if (error instanceof ResponsibleAIError || error instanceof AiGenerationError) {
            throw error;
          }

          throw new AiGenerationError(
            formatGoogleError('Google Vertex AI Image Generation', error),
          );
        }
      },
    );
  };
}
