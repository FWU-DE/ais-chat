import {
  AiGenerationError,
  InvalidModelError,
  RateLimitExceededError,
  ResponsibleAIError,
  ProviderConfigurationError,
} from '@ais-chat/ai-core/errors';
import type { FastifyReply } from 'fastify';

/**
 * Maps ai-core errors to appropriate HTTP responses.
 * Returns true if the error was handled, false otherwise.
 */
export function handleAiCoreError(reply: FastifyReply, error: unknown): boolean {
  if (InvalidModelError.is(error)) {
    reply.status(404).send({
      error: error.message,
    });
    return true;
  }

  if (RateLimitExceededError.is(error)) {
    reply.status(429).send({
      error: 'You have reached the price limit',
    });
    return true;
  }

  if (ResponsibleAIError.is(error)) {
    reply.status(400).send({
      error: 'Die Anfrage wurde wegen unangemessener Inhalte automatisch blockiert.',
    });
    return true;
  }

  if (ProviderConfigurationError.is(error)) {
    reply.log.error(error, 'Provider configuration error');
    reply.status(500).send({
      error: 'Provider configuration error',
      details: error.message,
    });
    return true;
  }

  if (AiGenerationError.is(error)) {
    reply.log.error(error, 'AI generation error');
    reply.status(500).send({
      error: 'An error occurred',
      details: error.message,
    });
    return true;
  }

  return false;
}
