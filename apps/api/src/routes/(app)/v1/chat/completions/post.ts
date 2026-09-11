import { validateApiKeyWithResult } from '@/routes/utils';
import { handleAiCoreError } from '@/ai-core-adapter/errors';
import { chatCompletion, chatCompletionStream } from '@/ai-core-adapter/chat';
import { FastifyReply, FastifyRequest } from 'fastify';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions.js';
import { z } from 'zod';
import { dbGetModelsByApiKeyId } from '@ais-chat/api-database';

// Define content part schemas for image and text
const textContentPartSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
});

const imageUrlContentPartSchema = z.object({
  type: z.literal('image_url'),
  image_url: z.object({
    url: z.string(),
    detail: z.enum(['auto', 'low', 'high']).optional(),
  }),
});

const contentPartSchema = z.union([textContentPartSchema, imageUrlContentPartSchema]);

// Content can be either a string (legacy format) or an array of content parts (new format with image support)
const messageContentSchema = z.union([z.string(), z.array(contentPartSchema)]);

const completionRequestSchema = z.object({
  model: z.string(),
  messages: z.array(
    z.object({
      role: z.enum(['system', 'user', 'assistant', 'developer']),
      content: messageContentSchema,
    }),
  ),
  max_tokens: z.number().optional().nullable(),
  temperature: z.coerce.number().optional(),
  stream: z.boolean().optional(),
});

export type CompletionRequest = z.infer<typeof completionRequestSchema>;

export async function handler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const [apiKeyError, apiKey] = await validateApiKeyWithResult(request, reply);

  if (apiKeyError !== null) {
    reply.status(401).send({ error: apiKeyError.message });
    return;
  }

  if (apiKey === undefined) return;

  const requestParseResult = completionRequestSchema.safeParse(request.body);
  if (!requestParseResult.success) {
    reply.status(400).send({
      error: 'Bad request',
      details: requestParseResult.error.message,
    });
    return;
  }

  const body = requestParseResult.data;
  const safetyModel = (await dbGetModelsByApiKeyId({ apiKeyId: apiKey.id })).find(
    (model) => model.priceMetadata.type === 'safety',
  );
  if (body.stream) {
    try {
      const stream = await chatCompletionStream({
        modelName: body.model,
        messages: body.messages as ChatCompletionMessageParam[],
        apiKeyId: apiKey.id,
        maxTokens: body.max_tokens,
        temperature: body.temperature,
        safetyModelName: safetyModel?.name,
      });

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Transfer-Encoding': 'chunked',
        Connection: 'keep-alive',
      });

      const reader = stream.getReader();

      async function processStream() {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          const chunkString = new TextDecoder().decode(value);
          reply.raw.write(chunkString);
        }
      }

      processStream()
        .catch((error) => {
          reply.log.error(error, 'Error processing stream');
        })
        .finally(() => {
          reply.raw.write('data: [DONE]\n\n');
          reply.raw.end();
          return;
        });
    } catch (error) {
      // Errors thrown before the stream starts (e.g. model not found, quota exceeded)
      if (!handleAiCoreError(reply, error)) {
        reply.log.error(error, 'Error in streaming completion');
        reply.status(500).send({
          error: 'An error occurred',
          details: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  } else {
    try {
      const response = await chatCompletion({
        modelName: body.model,
        messages: body.messages as ChatCompletionMessageParam[],
        apiKeyId: apiKey.id,
        maxTokens: body.max_tokens,
        temperature: body.temperature,
        safetyModelName: safetyModel?.name,
      });

      reply.status(200).send(response);
    } catch (error) {
      if (!handleAiCoreError(reply, error)) {
        reply.log.error(error, 'Error in non-streaming completion');
        reply.status(500).send({
          error: 'An error occurred',
          details: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return;
  }
}
