import { describe, it, expect } from 'vitest';
import {
  AiGenerationError,
  ApiKeyQuotaExceededError,
  ResponsibleAIError,
  ProviderRateLimitExceededError,
  RateLimitExceededError,
  InvalidModelError,
  ProviderConfigurationError,
  TokenPointsExceededError,
  SharedChatExpiredError,
  EmptyResponseError,
  isKnownAiGenerationError,
  normalizeAiGenerationError,
} from './errors';

describe('AiGenerationError', () => {
  it('should create an error with the correct name and message', () => {
    const error = new AiGenerationError('Test error');
    expect(error.name).toBe('AiGenerationError');
    expect(error.message).toBe('Test error');
    expect(error).toBeInstanceOf(Error);
  });

  it('should correctly identify AiGenerationError instances', () => {
    const error = new AiGenerationError('Test');
    expect(AiGenerationError.is(error)).toBe(true);
    expect(AiGenerationError.is(new Error('Test'))).toBe(false);
    expect(AiGenerationError.is('not an error')).toBe(false);
    expect(AiGenerationError.is(null)).toBe(false);
  });
});

describe('ResponsibleAIError', () => {
  it('should create an error with the correct name and message', () => {
    const error = new ResponsibleAIError('Content policy violation');
    expect(error.name).toBe('ResponsibleAIError');
    expect(error.message).toBe('Content policy violation');
    expect(error).toBeInstanceOf(AiGenerationError);
  });

  it('should correctly identify ResponsibleAIError instances', () => {
    const error = new ResponsibleAIError('Test');
    expect(ResponsibleAIError.is(error)).toBe(true);
    expect(ResponsibleAIError.is(new AiGenerationError('Test'))).toBe(false);
    expect(ResponsibleAIError.is(new Error('Test'))).toBe(false);
  });
});

describe('RateLimitExceededError', () => {
  it('should create an error with the correct name and message', () => {
    const error = new RateLimitExceededError('Too many requests');
    expect(error.name).toBe('RateLimitExceededError');
    expect(error.message).toBe('Too many requests');
    expect(error).toBeInstanceOf(AiGenerationError);
  });

  it('should correctly identify RateLimitExceededError instances', () => {
    const error = new RateLimitExceededError('Test');
    expect(RateLimitExceededError.is(error)).toBe(true);
    expect(RateLimitExceededError.is(new AiGenerationError('Test'))).toBe(false);
  });
});

describe('rate-limit subtypes', () => {
  it('identifies API-key quota errors as rate-limit errors', () => {
    const error = new ApiKeyQuotaExceededError('API key quota exceeded');
    expect(ApiKeyQuotaExceededError.is(error)).toBe(true);
    expect(RateLimitExceededError.is(error)).toBe(true);
  });

  it('identifies provider throttling errors as rate-limit errors', () => {
    const error = new ProviderRateLimitExceededError('Too many requests');
    expect(ProviderRateLimitExceededError.is(error)).toBe(true);
    expect(RateLimitExceededError.is(error)).toBe(true);
  });
});

describe('InvalidModelError', () => {
  it('should create an error with the correct name and message', () => {
    const error = new InvalidModelError('Invalid model');
    expect(error.name).toBe('InvalidModelError');
    expect(error.message).toBe('Invalid model');
    expect(error).toBeInstanceOf(AiGenerationError);
  });

  it('should correctly identify InvalidModelError instances', () => {
    const error = new InvalidModelError('Test');
    expect(InvalidModelError.is(error)).toBe(true);
    expect(InvalidModelError.is(new AiGenerationError('Test'))).toBe(false);
  });
});

describe('ProviderConfigurationError', () => {
  it('should create an error with the correct name and message', () => {
    const error = new ProviderConfigurationError('Provider not configured');
    expect(error.name).toBe('ProviderConfigurationError');
    expect(error.message).toBe('Provider not configured');
    expect(error).toBeInstanceOf(AiGenerationError);
  });

  it('should correctly identify ProviderConfigurationError instances', () => {
    const error = new ProviderConfigurationError('Test');
    expect(ProviderConfigurationError.is(error)).toBe(true);
    expect(ProviderConfigurationError.is(new AiGenerationError('Test'))).toBe(false);
  });
});

describe('TokenPointsExceededError', () => {
  it('should create an error with the correct name and message', () => {
    const error = new TokenPointsExceededError('Points exceeded');
    expect(error.name).toBe('TokenPointsExceededError');
    expect(error.message).toBe('Points exceeded');
    expect(error).toBeInstanceOf(AiGenerationError);
  });

  it('should use the default message when none is provided', () => {
    const error = new TokenPointsExceededError();
    expect(error.message).toBe('User has reached token points limit');
  });

  it('should correctly identify TokenPointsExceededError instances', () => {
    const error = new TokenPointsExceededError('Test');
    expect(TokenPointsExceededError.is(error)).toBe(true);
    expect(TokenPointsExceededError.is(new AiGenerationError('Test'))).toBe(false);
    expect(TokenPointsExceededError.is(new Error('Test'))).toBe(false);
  });
});

describe('SharedChatExpiredError', () => {
  it('should create an error with the correct name and message', () => {
    const error = new SharedChatExpiredError('Chat expired');
    expect(error.name).toBe('SharedChatExpiredError');
    expect(error.message).toBe('Chat expired');
    expect(error).toBeInstanceOf(AiGenerationError);
  });

  it('should use the default message when none is provided', () => {
    const error = new SharedChatExpiredError();
    expect(error.message).toBe('Shared chat has expired');
  });

  it('should correctly identify SharedChatExpiredError instances', () => {
    const error = new SharedChatExpiredError('Test');
    expect(SharedChatExpiredError.is(error)).toBe(true);
    expect(SharedChatExpiredError.is(new AiGenerationError('Test'))).toBe(false);
    expect(SharedChatExpiredError.is(new Error('Test'))).toBe(false);
  });
});

describe('EmptyResponseError', () => {
  it('should create an error with neutral default message and correct name', () => {
    const error = new EmptyResponseError({ modelId: 'model' });
    expect(error.name).toBe('EmptyResponseError');
    expect(error.message).toBe('Empty response from provider (modelId=model)');
    expect(error).toBeInstanceOf(AiGenerationError);
  });

  it('should correctly identify EmptyResponseError instances', () => {
    const error = new EmptyResponseError({ modelId: 'm' });
    expect(EmptyResponseError.is(error)).toBe(true);
    expect(EmptyResponseError.is(new AiGenerationError('Test'))).toBe(false);
  });
});

describe('isKnownAiGenerationError', () => {
  it('should return true for known AI generation errors', () => {
    expect(isKnownAiGenerationError(new AiGenerationError('Test'))).toBe(true);
    expect(isKnownAiGenerationError(new ResponsibleAIError('Test'))).toBe(true);
    expect(isKnownAiGenerationError(new RateLimitExceededError('Test'))).toBe(true);
    expect(isKnownAiGenerationError(new ApiKeyQuotaExceededError('Test'))).toBe(true);
    expect(isKnownAiGenerationError(new ProviderRateLimitExceededError('Test'))).toBe(true);
    expect(isKnownAiGenerationError(new InvalidModelError('Test'))).toBe(true);
    expect(isKnownAiGenerationError(new ProviderConfigurationError('Test'))).toBe(true);
    expect(isKnownAiGenerationError(new TokenPointsExceededError('Test'))).toBe(true);
    expect(isKnownAiGenerationError(new SharedChatExpiredError('Test'))).toBe(true);
    expect(isKnownAiGenerationError(new EmptyResponseError({ modelId: 'm' }))).toBe(true);
  });

  it('should return false for unknown values', () => {
    expect(isKnownAiGenerationError(new Error('Test'))).toBe(false);
    expect(isKnownAiGenerationError('not an error')).toBe(false);
    expect(isKnownAiGenerationError(null)).toBe(false);
    expect(isKnownAiGenerationError(undefined)).toBe(false);
    expect(isKnownAiGenerationError({ name: 'SomeOtherError' })).toBe(false);
  });
});

describe('normalizeAiGenerationError', () => {
  it.each([
    [{ status: 429, message: 'Too many requests' }, ProviderRateLimitExceededError],
    [
      { status: 400, message: 'Your request was rejected by the safety system' },
      ResponsibleAIError,
    ],
    [{ code: 'model_not_found', message: 'Unknown deployment' }, InvalidModelError],
  ])('classifies provider errors', (providerError, ErrorType) => {
    expect(normalizeAiGenerationError(providerError, 'Generation failed')).toBeInstanceOf(
      ErrorType,
    );
  });

  it('preserves existing typed errors', () => {
    const error = new ResponsibleAIError('Policy violation');
    expect(normalizeAiGenerationError(error, 'Generation failed')).toBe(error);
  });

  it('removes a provider request ID from responsible AI errors', () => {
    const error = normalizeAiGenerationError(
      new Error('Your request was rejected by the safety system. Request ID: secret'),
      'Generation failed',
    );

    expect(error).toBeInstanceOf(ResponsibleAIError);
    expect(error.message).toBe('Your request was rejected by the safety system');
  });
});
