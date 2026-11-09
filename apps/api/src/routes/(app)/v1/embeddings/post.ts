import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { createEmbeddings } from '@/ai-core-adapter/embeddings';
import { handleAiCoreError } from '@/ai-core-adapter/errors';
import { validateApiKeyWithResult } from '@/routes/utils';

const embeddingRequestSchema = z.object({
  model: z.string(),
  input: z.array(z.string()),
});

export type EmbeddingRequest = z.infer<typeof embeddingRequestSchema>;

export async function handler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const [apiKeyError, apiKey] = await validateApiKeyWithResult(request, reply);

  if (apiKeyError !== null) {
    reply.status(401).send({ error: apiKeyError.message });
    return;
  }

  if (apiKey === undefined) return;

  const requestParseResult = embeddingRequestSchema.safeParse(request.body);
  if (!requestParseResult.success) {
    reply.status(400).send({
      error: 'Bad request',
      details: requestParseResult.error.message,
    });

    return;
  }

  const body = requestParseResult.data;

  try {
    const result = await createEmbeddings({
      modelName: body.model,
      input: body.input,
      apiKeyId: apiKey.id,
    });

    reply.status(200).send(result);
  } catch (error) {
    if (!handleAiCoreError(reply, error)) {
      reply.log.error(error, 'Error generating embedding');
      reply.status(500).send({
        error: 'Error generating embedding',
        details: error instanceof Error ? error.message : 'An error occurred',
      });
    }
  }
}
