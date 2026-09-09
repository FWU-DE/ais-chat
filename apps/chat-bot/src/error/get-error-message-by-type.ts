import { isKnownAiGenerationError, type KnownAiGenerationError } from '@ais-chat/ai-core/errors';

type ErrorMessageTranslationKey =
  | 'rate-limit-error'
  | 'provider-rate-limit-error'
  | 'responsible-ai-error'
  | 'invalid-model-error'
  | 'chat-expired-error'
  | 'empty-response-error'
  | 'not-found-error'
  | 'generic-error';

const aiErrorNameToMessageKeyMap = {
  TokenPointsExceededError: 'rate-limit-error',
  EmptyResponseError: 'empty-response-error',
  SharedChatExpiredError: 'chat-expired-error',
  ResponsibleAIError: 'responsible-ai-error',
  RateLimitExceededError: 'provider-rate-limit-error',
  InvalidModelError: 'invalid-model-error',
} as const satisfies Partial<Record<KnownAiGenerationError['name'], ErrorMessageTranslationKey>>;

function isMappedAiErrorName(name: string): name is keyof typeof aiErrorNameToMessageKeyMap {
  return Object.hasOwn(aiErrorNameToMessageKeyMap, name);
}

function hasErrorName(error: unknown, name: string): error is { name: string } {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const errorName = (error as { name?: unknown }).name;
  return errorName === name;
}

export function getErrorMessageByType(error: unknown): ErrorMessageTranslationKey {
  if (hasErrorName(error, 'NotFoundError')) {
    return 'not-found-error';
  }

  if (isKnownAiGenerationError(error)) {
    if (isMappedAiErrorName(error.name)) {
      return aiErrorNameToMessageKeyMap[error.name];
    }

    return 'generic-error';
  }

  return 'generic-error';
}
