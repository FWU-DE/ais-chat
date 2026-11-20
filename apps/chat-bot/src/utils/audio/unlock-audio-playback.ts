let primedAudioElement: HTMLAudioElement | null = null;

/**
 * Creates an `<audio>` element and calls `play()` on it synchronously, which must happen directly
 * inside a user gesture handler (e.g. a message submit), before any `await`. Browsers such as
 * Safari only clear an element's autoplay restriction this way, and the restriction is tracked per
 * element rather than per page, so the unlocked element is kept around and handed to the next
 * `Mp3StreamPlayer` (see `takePrimedAudioElement`) — otherwise a speech-only reply that starts
 * playing on its own, outside any gesture, would be blocked.
 *
 * Called unconditionally from the chat input submit handler: it needs no knowledge of the speech
 * settings, so no chat surface can forget to unlock.
 */
export function unlockAudioPlayback(): void {
  if (primedAudioElement) {
    return;
  }
  const audio = new Audio();
  primedAudioElement = audio;
  // Fails because the element has no source yet; the autoplay restriction is cleared regardless.
  void audio.play().catch(() => undefined);
}

/** Hands the unlocked element over to a player; the next gesture primes a fresh one. */
export function takePrimedAudioElement(): HTMLAudioElement | null {
  const audio = primedAudioElement;
  primedAudioElement = null;
  return audio;
}
