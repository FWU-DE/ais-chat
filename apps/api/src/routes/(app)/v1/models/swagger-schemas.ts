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
        },
      },
    },
    ...SWAGGER_DEFAULT_RESPONSES_SCHEMA,
  },
  summary: 'List models for the current api key and project',
  description:
    'list the models as objects with the following properties: id, name, createdAt, provider, displayName, description, pricingData, supportedImageFormats (array of strings). If no image formats are listed, the model does not support images.',
  security: [{ bearerAuth: [] }],
};
