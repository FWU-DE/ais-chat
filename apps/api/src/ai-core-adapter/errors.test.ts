import { describe, it, expect, vi } from 'vitest';
import { handleAiCoreError } from './errors';

// Mock the error classes from @ais-chat/ai-core/errors
vi.mock('@ais-chat/ai-core/errors', () => ({
  ApiKeyQuotaExceededError: {
    is: (e: unknown) => e instanceof Error && e.message === 'ApiKeyQuotaExceeded',
  },
  InvalidModelError: { is: (e: unknown) => e instanceof Error && e.message === 'InvalidModel' },
  ProviderRateLimitExceededError: {
    is: (e: unknown) => e instanceof Error && e.message === 'ProviderRateLimitExceeded',
  },
  ResponsibleAIError: {
    is: (e: unknown) => e instanceof Error && e.message === 'ResponsibleAI',
  },
  ProviderConfigurationError: {
    is: (e: unknown) => e instanceof Error && e.message === 'ProviderConfig',
  },
  AiGenerationError: {
    is: (e: unknown) => e instanceof Error && e.message.startsWith('AiGeneration'),
  },
}));

function createMockReply() {
  const reply = {
    statusCode: 0,
    body: undefined as unknown,
    log: {
      error: vi.fn(),
    },
    status(code: number) {
      reply.statusCode = code;
      return reply;
    },
    send(body: unknown) {
      reply.body = body;
      return reply;
    },
  };
  return reply;
}

describe('handleAiCoreError', () => {
  it('handles InvalidModelError with 404', () => {
    const reply = createMockReply();
    const handled = handleAiCoreError(reply as never, new Error('InvalidModel'));
    expect(handled).toBe(true);
    expect(reply.statusCode).toBe(404);
  });

  it('handles ApiKeyQuotaExceededError with 429 and a quota message', () => {
    const reply = createMockReply();
    const handled = handleAiCoreError(reply as never, new Error('ApiKeyQuotaExceeded'));
    expect(handled).toBe(true);
    expect(reply.statusCode).toBe(429);
    expect(reply.body).toEqual({ error: 'You have reached the price limit' });
  });

  it('handles ProviderRateLimitExceededError with 429 and a retry message', () => {
    const reply = createMockReply();
    const handled = handleAiCoreError(reply as never, new Error('ProviderRateLimitExceeded'));
    expect(handled).toBe(true);
    expect(reply.statusCode).toBe(429);
    expect(reply.body).toEqual({
      error: 'The provider is currently rate limited. Please try again later.',
    });
  });

  it('handles ResponsibleAIError with 400', () => {
    const reply = createMockReply();
    const handled = handleAiCoreError(reply as never, new Error('ResponsibleAI'));
    expect(handled).toBe(true);
    expect(reply.statusCode).toBe(400);
  });

  it('handles ProviderConfigurationError with 500', () => {
    const reply = createMockReply();
    const handled = handleAiCoreError(reply as never, new Error('ProviderConfig'));
    expect(handled).toBe(true);
    expect(reply.statusCode).toBe(500);
  });

  it('handles generic AiGenerationError with 500', () => {
    const reply = createMockReply();
    const handled = handleAiCoreError(reply as never, new Error('AiGeneration: something else'));
    expect(handled).toBe(true);
    expect(reply.statusCode).toBe(500);
  });

  it('returns false for unrecognized errors', () => {
    const reply = createMockReply();
    const handled = handleAiCoreError(reply as never, new Error('something unknown'));
    expect(handled).toBe(false);
  });
});
