/**
 * Returns the stored voice if it is still offered by the speech model,
 * otherwise falls back to the first available voice.
 */
export function resolveInitialVoice(storedVoice: string, voices: string[]): string {
  if (storedVoice && voices.includes(storedVoice)) {
    return storedVoice;
  }
  return voices[0] ?? '';
}
