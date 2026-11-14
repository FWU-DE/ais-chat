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

  return (
    (usage.characters * model.priceMetadata.priceInCentPer1MillionCharacters) /
    TOKEN_AMOUNT_PER_PRICE
  );
}

/**
 * Returns the names of the voices configured for the speech model.
 * Throws if no voices are configured.
 */
export function getConfiguredVoiceNames(model: LlmModelSelectModel): [string, ...string[]] {
  const [first, ...rest] = (model.modelConfig?.voices ?? []).map((v) => v.name);
  if (first === undefined) throw new Error('No voices configured for the speech model');
  return [first, ...rest];
}

/**
 * Returns the given voice if it is configured for the speech model,
 * otherwise falls back to the first configured voice.
 */
export function resolveSpeechVoice(model: LlmModelSelectModel, voice?: string): string {
  const voices = getConfiguredVoiceNames(model);
  return voice && voices.includes(voice) ? voice : voices[0];
}
