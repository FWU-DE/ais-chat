import { FastifySchema } from 'fastify/types/schema';

import { SWAGGER_DEFAULT_RESPONSES_SCHEMA } from '@/swagger/const';

export const modelRequestSwaggerSchema: FastifySchema = {
  response: {
    200: {
      type: 'array',
      description: 'Default response',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
          provider: { type: 'string' },
          displayName: { type: 'string' },
          description: { type: 'string' },
          supportedImageFormats: { type: 'array', items: { type: 'string' } },
          priceMetadata: {
            type: 'object',
            description: 'Pricing metadata; type may be text, image, embedding, speech, or safety.',
            properties: { type: { type: 'string' } },
          },
          modelConfig: {
            type: ['object', 'null'],
            description:
              'Speech model configuration. Speech models expose their available voices here.',
            properties: {
              voices: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: { name: { type: 'string' }, displayName: { type: 'string' } },
                },
              },
            },
          },
        },
      },
    },
    ...SWAGGER_DEFAULT_RESPONSES_SCHEMA,
  },
  summary: 'List models for the current api key and project',
  description:
    'Lists text, image, embedding, safety, and speech models. Speech model voices are available in modelConfig.voices; supportedImageFormats lists image capabilities.',
  security: [{ bearerAuth: [] }],
};
