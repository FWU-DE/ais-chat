import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { handleAiCoreError } from '@/ai-core-adapter/errors';
import {
  createSpeechAudioDeltaEvent,
  createSpeechAudioDoneEvent,
  createSpeechStream,
} from '@/ai-core-adapter/speech';
import { validateApiKeyWithResult } from '@/routes/utils';

const speechRequestSchema = z.object({
  model: z.string().min(1),
  input: z.string().trim().min(1).max(4096, 'input must be at most 4096 characters'),
  voice: z.string().min(1),
  response_format: z.enum(['mp3'], { message: "Only 'mp3' is supported" }).optional(),
  stream_format: z.enum(['audio', 'sse']).optional().default('audio'),
  speed: z
    .number()
    .refine((value) => value === 1, 'speed is not supported; omit it or use 1')
    .optional(),
  instructions: z
    .string()
    .refine((value) => value.length === 0, 'instructions are not supported')
    .optional(),
});

export async function handler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const [apiKeyError, apiKey] = await validateApiKeyWithResult(request, reply);
  if (apiKeyError !== null) {
    reply.status(401).send({ error: apiKeyError.message });
    return;
  }
  if (apiKey === undefined) {
    return;
  }

  const parsed = speechRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    reply.status(400).send({ error: 'Bad request', details: parsed.error.message });
    return;
  }

  const body = parsed.data;

  try {
    const stream = await createSpeechStream({
      modelName: body.model,
      input: body.input,
      voice: body.voice,
      apiKeyId: apiKey.id,
    });

    if (body.stream_format === 'audio') {
      reply.raw.writeHead(200, {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-store',
        'Transfer-Encoding': 'chunked',
      });
      for await (const chunk of stream.chunks) {
        reply.raw.write(chunk);
      }
    } else {
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Transfer-Encoding': 'chunked',
        Connection: 'keep-alive',
      });
      for await (const chunk of stream.chunks) {
        reply.raw.write(`data: ${JSON.stringify(createSpeechAudioDeltaEvent(chunk))}\n\n`);
      }
      await stream.usage;
      reply.raw.write(`data: ${JSON.stringify(createSpeechAudioDoneEvent())}\n\n`);
    }
    reply.raw.end();
  } catch (error) {
    if (reply.raw.headersSent) {
      reply.log.error(error, 'Error processing speech stream');
      reply.raw.destroy();
      return;
    }
    if (!handleAiCoreError(reply, error)) {
      reply.log.error(error, 'Error generating speech');
      reply.status(500).send({
        error: 'Error generating speech',
        details: error instanceof Error ? error.message : 'An error occurred',
      });
    }
  }
}
