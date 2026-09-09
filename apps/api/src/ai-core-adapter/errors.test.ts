import { describe, it, expect, vi } from 'vitest';
import { handleAiCoreError } from './errors';

// Mock the error classes from @ais-chat/ai-core/errors
vi.mock('@ais-chat/ai-core/errors', () => ({
  InvalidModelError: { is: (e: unknown) => e instanceof Error && e.message === 'InvalidModel' },
  RateLimitExceededError: {
    is: (e: unknown) => e instanceof Error && e.message === 'RateLimitExceeded',
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

  it('handles RateLimitExceededError with 429', () => {
    const reply = createMockReply();
    const handled = handleAiCoreError(reply as never, new Error('RateLimitExceeded'));
    expect(handled).toBe(true);
    expect(reply.statusCode).toBe(429);
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

  it('does not infer an error type from an AiGenerationError message', () => {
    const reply = createMockReply();
    const handled = handleAiCoreError(
      reply as never,
      new Error('AiGeneration: exceeded its monthly quota'),
    );
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
