import { SWAGGER_DEFAULT_RESPONSES_SCHEMA } from '@/swagger/const';

export const imageGenerationRequestSwaggerSchema = {
  body: {
    type: 'object',
    properties: {
      model: {
        type: 'string',
        description:
          'The model to use for image generation. Supported models can be retrieved from the /v1/models endpoint.',
        example: 'gpt-image-1.5',
      },
      prompt: {
        type: 'string',
        description: 'The text prompt to generate an image from',
        example: 'A beautiful sunset over a mountain range',
      },
      size: {
        type: 'string',
        pattern: '^[1-9]\\d*x[1-9]\\d*$',
        description:
          'Optional image size in the format "<width>x<height>" with positive integers, e.g. "1024x1024". The aspect ratio must be supported by the selected model. Check the respective model documentation for supported sizes.',
        example: '1024x1024',
      },
    },
    required: ['model', 'prompt'],
    'x-examples': {
      gptImage: {
        summary: 'GPT-Image-1.5',
        description: 'Image generation using GPT-Image-1.5',
        value: {
          model: 'gpt-image-1.5',
          prompt: 'A beautiful sunset over a mountain range',
          size: '1024x1024',
        },
      },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        created: {
          type: 'number',
          description: 'The Unix timestamp when the image was generated',
        },
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              b64_json: {
                type: 'string',
                description: 'The base64-encoded JSON of the generated image',
              },
            },
          },
        },
      },
    },
    ...SWAGGER_DEFAULT_RESPONSES_SCHEMA,
  },
  security: [{ bearerAuth: [] }],
  summary: 'Generate an image based on a text prompt',
  description:
    'Generates an image using the specified model and prompt. The response includes the generated image in base64-encoded JSON format.',
};
