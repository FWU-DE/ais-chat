import { SWAGGER_DEFAULT_RESPONSES_SCHEMA } from '@/swagger/const';

export const speechRequestSwaggerSchema = {
  body: {
    type: 'object',
    properties: {
      model: {
        type: 'string',
        description:
          'The model to use for speech generation. Supported models can be retrieved from the /v1/models endpoint.',
        example: 'tts-model',
      },
      input: {
        type: 'string',
        maxLength: 4096,
        description: 'The text to generate audio for, at most 4096 characters',
        example: 'Hallo, wie geht es dir?',
      },
      voice: {
        type: 'string',
        description:
          'The voice to use. The available voices of a model are listed in modelConfig.voices of the /v1/models endpoint. The voice determines the supported languages.',
        example: 'de-DE-Seraphina:DragonHDLatestNeural',
      },
      response_format: {
        type: 'string',
        enum: ['mp3'],
        default: 'mp3',
        description: 'The audio format. Only mp3 is supported.',
      },
      stream_format: {
        type: 'string',
        enum: ['audio', 'sse'],
        default: 'audio',
        description:
          'Stream the raw audio or server-sent events with base64-encoded audio chunks (speech.audio.delta, speech.audio.done).',
      },
    },
    required: ['model', 'input', 'voice'],
    'x-examples': {
      speech: {
        summary: 'Text to speech',
        description: 'Generate German speech as an MP3 stream',
        value: {
          model: 'tts-model',
          input: 'Hallo, wie geht es dir?',
          voice: 'de-DE-Seraphina:DragonHDLatestNeural',
        },
      },
    },
  },
  response: {
    200: {
      description: 'The generated audio as an MP3 stream, or server-sent events',
      content: {
        'audio/mpeg': { schema: { type: 'string', format: 'binary' } },
        'text/event-stream': { schema: { type: 'string' } },
      },
    },
    ...SWAGGER_DEFAULT_RESPONSES_SCHEMA,
  },
  security: [{ bearerAuth: [] }],
  summary: 'Generate speech from text',
  description:
    'Generates audio from the input text with the specified model and voice, compatible with the OpenAI audio.speech.create endpoint. The speed and instructions parameters are not supported. Usage is billed per input character to the api key. If the budget exceeds the limit, the request will fail with a 429 error.',
};
