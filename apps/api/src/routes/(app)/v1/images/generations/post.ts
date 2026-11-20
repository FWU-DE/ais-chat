import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { handleAiCoreError } from '@/ai-core-adapter/errors';
import { createImage } from '@/ai-core-adapter/images';
import { validateApiKeyWithResult } from '@/routes/utils';

const imageSizeSchema = z
  .string()
  .regex(/^[1-9]\d*x[1-9]\d*$/, 'size must be in the format "<width>x<height>", e.g. "1024x1024"');

const imageGenerationRequestSchema = z.object({
  model: z.string(),
  prompt: z.string(),
  size: imageSizeSchema.optional(),
});

export type ImageGenerationRequest = z.infer<typeof imageGenerationRequestSchema>;

export async function handler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const [apiKeyError, apiKey] = await validateApiKeyWithResult(request, reply);

  if (apiKeyError !== null) {
    reply.status(401).send({ error: apiKeyError.message });
    return;
  }

  if (apiKey === undefined) return;

  const requestParseResult = imageGenerationRequestSchema.safeParse(request.body);
  if (!requestParseResult.success) {
    reply.status(400).send({
      error: 'Bad request',
      details: requestParseResult.error.message,
    });
    return;
  }

  const body = requestParseResult.data;

  try {
    const response = await createImage({
      modelName: body.model,
      prompt: body.prompt,
      apiKeyId: apiKey.id,
      options: body.size !== undefined ? { size: body.size } : undefined,
    });

    reply.status(200).send(response);
  } catch (error) {
    if (!handleAiCoreError(reply, error)) {
      reply.log.error(error, 'Error generating image');
      reply.status(500).send({
        error: 'Error generating image',
        details: error instanceof Error ? error.message : 'An error occurred',
      });
    }
  }
}
