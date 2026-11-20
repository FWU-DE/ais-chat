import { type ApiKeyModel, dbValidateApiKey } from '@ais-chat/api-database';
import { errorifyAsyncFn } from '@ais-chat/api-database/utils';
import { FastifyReply, FastifyRequest } from 'fastify';
import { ChatCompletionChunk } from 'openai/resources/chat/completions.js';

const BEARER_PREFIX = 'Bearer ';

export function getMaybeBearerToken(authorizationHeader: string | undefined): string | undefined {
  if (authorizationHeader === undefined) return undefined;
  if (!authorizationHeader.startsWith(BEARER_PREFIX)) {
    return undefined;
  }

  return authorizationHeader.slice(BEARER_PREFIX.length, authorizationHeader.length);
}

export const validateApiKeyWithResult = errorifyAsyncFn(validateApiKey);

export async function validateApiKey(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<ApiKeyModel | undefined> {
  const authorizationHeader = getMaybeBearerToken(request.headers.authorization);

  if (!authorizationHeader) {
    reply.status(401).send({ error: 'No Bearer token found.' });
    return undefined;
  }

  const apiKeyValidationResponse = await dbValidateApiKey(authorizationHeader);

  if (!apiKeyValidationResponse.valid) {
    reply.status(403).send({ error: apiKeyValidationResponse.reason });
    return undefined;
  }

  return apiKeyValidationResponse.apiKey;
}

export function getContentFilterFailedChunk({
  id,
  created,
  model,
}: {
  id: string;
  created: number;
  model: string;
}): ChatCompletionChunk {
  return {
    choices: [
      {
        index: 0,
        delta: {
          content: 'Die Anfrage wurde wegen unangemessener Inhalte automatisch blockiert.',
        },
        finish_reason: 'content_filter',
      },
    ],
    id,
    created,
    model,
    object: 'chat.completion.chunk',
  };
}

export function getErrorChunk({
  id,
  created,
  model,
  errorMessage,
  errorCode,
}: {
  id: string;
  created: number;
  model: string;
  errorMessage: string;
  errorCode?: string;
}): ChatCompletionChunk {
  return {
    choices: [
      {
        index: 0,
        delta: {
          content: `Error in Chat Stream: ${errorMessage}`,
        },
        finish_reason: 'stop',
      },
    ],
    id,
    created,
    model,
    object: 'chat.completion.chunk',
    error: {
      message: errorMessage,
      code: errorCode || 'unknown_error',
      type: 'error',
    },
  } as ChatCompletionChunk;
}

export function handleLlmModelError(
  reply: FastifyReply,
  error: unknown,
  errorContext: string,
): void {
  reply.log.error({ err: error, errorContext });

  let statusCode = 500;
  let errorMessage = 'An error occurred';

  if (isErrorWithStatus(error)) {
    statusCode = error.status;
  }

  if (error instanceof Error) {
    errorMessage = error.message;
  }

  reply.status(statusCode).send({
    error: errorContext,
    details: errorMessage,
  });
}

// Type guard to check if an error has a 'status' property
export function isErrorWithStatus(error: unknown): error is Error & { status: number } {
  return error instanceof Error && 'status' in error && typeof error.status === 'number';
}
