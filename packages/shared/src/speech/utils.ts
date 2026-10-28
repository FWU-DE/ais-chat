import { SpeechUsage } from '@ais-chat/ai-core';
import { LlmModelSelectModel } from '@shared/db/schema';
import { logError } from '@shared/logging';
import { TOKEN_AMOUNT_PER_PRICE } from './types';

/**
 * Calculates the cost of a speech generation in cent.
 *
 * `priceMetadata` values for the speech model are given in cent per 1 million tokens.
 */
export function calculateSpeechCostsInCent(model: LlmModelSelectModel, usage: SpeechUsage): number {
  if (model.priceMetadata.type !== 'speech') {
    logError(
      'Invalid model type, gracefully returning 0: ' + model.name,
      new TypeError('Invalid model type'),
    );

    return 0;
  }

  const inputTextTokenPrice = usage.inputTextTokens * model.priceMetadata.inputTextTokenPrice;
  const outputAudioTokenPrice = usage.outputAudioTokens * model.priceMetadata.outputAudioTokenPrice;

  return (inputTextTokenPrice + outputAudioTokenPrice) / TOKEN_AMOUNT_PER_PRICE;
}
