import { ProviderRateLimitExceededError, TokenPointsExceededError } from '@ais-chat/ai-core/errors';
import { InvalidArgumentError, NotFoundError } from '@shared/error';
import { logError, logMessage } from '@shared/logging';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { runServerAction } from './run-server-action';

vi.mock('@sentry/nextjs', () => ({
  withServerActionInstrumentation: (_name: string, callback: () => unknown) => callback(),
}));
vi.mock('@shared/logging', () => ({ logError: vi.fn(), logMessage: vi.fn() }));

function failWith(error: unknown) {
  return runServerAction('testAction', async () => {
    throw error;
  })();
}

describe('runServerAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the value on success', async () => {
    await expect(runServerAction('testAction', async () => 42)()).resolves.toEqual({
      success: true,
      value: 42,
    });
  });

  it.each([
    ['business error', new NotFoundError('Character not found')],
    ['AI generation error', new TokenPointsExceededError()],
  ])('logs an expected %s as a message at its log level', async (_name, error) => {
    const result = await failWith(error);

    expect(result).toMatchObject({
      success: false,
      error: { name: error.name, message: error.message },
    });
    expect(logError).not.toHaveBeenCalled();
    expect(logMessage).toHaveBeenCalledWith(expect.any(String), 'info', {
      errorName: error.name,
      errorMessage: error.message,
    });
  });

  it.each([
    ['business error', new InvalidArgumentError('Bad input')],
    ['AI generation error', new ProviderRateLimitExceededError('Rate limit')],
  ])('logs a %s with error level through logError', async (_name, error) => {
    const result = await failWith(error);

    expect(result).toMatchObject({ success: false, error: { name: error.name } });
    expect(logError).toHaveBeenCalledWith(expect.any(String), error);
    expect(logMessage).not.toHaveBeenCalled();
  });

  it('logs unknown errors and returns an UnexpectedError', async () => {
    const error = new Error('db exploded');
    const result = await failWith(error);

    expect(result).toMatchObject({ success: false, error: { name: 'UnexpectedError' } });
    expect(logError).toHaveBeenCalledWith(expect.any(String), error);
  });
});
