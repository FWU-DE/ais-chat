import type { SpeechVoice } from '@shared/db/schema';

/**
 * Returns the stored voice if it is still offered by the speech model,
 * otherwise falls back to the first available voice.
 */
export function resolveInitialVoice(storedVoice: string, voices: SpeechVoice[]): string {
  const [firstVoice] = voices;
  if (firstVoice === undefined) {
    return storedVoice;
  }

  if (storedVoice && voices.some((voice) => voice.name === storedVoice)) {
    return storedVoice;
  }
  return firstVoice.name;
}
