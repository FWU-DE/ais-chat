import {
  ApiKeyQuotaExceededError,
  EmptyResponseError,
  InvalidModelError,
  ProviderRateLimitExceededError,
  ResponsibleAIError,
  SharedChatExpiredError,
  TokenPointsExceededError,
} from '@ais-chat/ai-core/errors';
import { NotFoundError } from '@shared/error/not-found-error';
import { describe, expect, it } from 'vitest';
import { getErrorMessageByType } from './get-error-message-by-type';

describe('getErrorMessageByType', () => {
  it('returns key for mapped ai-core errors', () => {
    expect(getErrorMessageByType(new TokenPointsExceededError())).toBe('rate-limit-error');
    expect(getErrorMessageByType(new SharedChatExpiredError())).toBe('chat-expired-error');
    expect(getErrorMessageByType(new EmptyResponseError({ modelId: 'm' }))).toBe(
      'empty-response-error',
    );
    expect(getErrorMessageByType(new ResponsibleAIError('Policy violation'))).toBe(
      'responsible-ai-error',
    );
    expect(getErrorMessageByType(new ApiKeyQuotaExceededError('Quota exceeded'))).toBe(
      'api-key-quota-error',
    );
    expect(getErrorMessageByType(new ProviderRateLimitExceededError('Rate limit'))).toBe(
      'provider-rate-limit-error',
    );
    expect(getErrorMessageByType(new InvalidModelError('Invalid model'))).toBe(
      'invalid-model-error',
    );
  });

  it('returns not-found key for NotFoundError', () => {
    expect(getErrorMessageByType(new NotFoundError('Not found'))).toBe('not-found-error');
  });

  it('returns generic key for unknown values', () => {
    expect(getErrorMessageByType(new Error('Oops'))).toBe('generic-error');
    expect(getErrorMessageByType('not an error')).toBe('generic-error');
    expect(getErrorMessageByType(null)).toBe('generic-error');
  });
});
